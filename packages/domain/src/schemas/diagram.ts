import { z } from "zod";
import {
  ANCHOR_SIDES,
  BOUNDARY_TONES,
  CANVAS_TONES,
  DIAGRAM_LIMITS,
  EDGE_STYLES,
  TILE_VARIANTS,
} from "../constants/diagram";
import { DIAGRAM_ICON_KEYS } from "../constants/diagram-icons";

/**
 * `DiagramConfig` — the contract at the centre of the diagram tool. A model
 * writes it, the editor edits it, the renderer draws it.
 *
 * Failure messages are written for the author, not the library: they name the
 * offending value and the fix. Cross-field rules run in one `superRefine` so a
 * single parse reports every problem at once, which lets a model correct them
 * all in one retry instead of discovering them one turn at a time.
 */

/** Text that appears inside a tile: trimmed, non-empty, and short enough to fit. */
const tileText = (field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(
      DIAGRAM_LIMITS.TEXT_MAX,
      `${field} must be at most ${DIAGRAM_LIMITS.TEXT_MAX} characters — abbreviate it to fit the tile`,
    );

export const diagramNodeSchema = z
  .object({
    id: z.string().trim().min(1, "Node id is required"),
    /** Centre of the tile, not its top-left corner. */
    x: z.number(),
    y: z.number(),
    /** Fallback mark for a technology with no logo in the registry. */
    emoji: z.string().trim().min(1, "Node emoji must not be empty").optional(),
    /** A brand mark from the icon registry. Takes precedence over `emoji`. */
    iconKey: z.enum(DIAGRAM_ICON_KEYS).optional(),
    name: tileText("Node name"),
    sub: z
      .string()
      .trim()
      .max(
        DIAGRAM_LIMITS.TEXT_MAX,
        `Node sublabel must be at most ${DIAGRAM_LIMITS.TEXT_MAX} characters — abbreviate it to fit the tile`,
      )
      .default(""),
    tile: z.enum(TILE_VARIANTS).default(TILE_VARIANTS.LIGHT),
  })
  /**
   * A node has to show something. The rule lives on the node rather than in the
   * config-level `superRefine` so it travels with the schema wherever a single
   * node is parsed — the editor's field-level mutations included.
   */
  .superRefine((node, ctx) => {
    if (node.emoji || node.iconKey) return;

    ctx.addIssue({
      code: "custom",
      message:
        `"${node.id}" has neither emoji nor iconKey — a node must show one of the two. ` +
        `Use iconKey when the technology has a brand mark; the authoring guidelines list every ` +
        `available key. Otherwise pick an emoji.`,
    });
  });

export const diagramBoundarySchema = z.object({
  id: z.string().trim().min(1, "Boundary id is required"),
  label: tileText("Boundary label"),
  icon: z.string().default(""),
  x: z.number(),
  y: z.number(),
  w: z.number().positive("Boundary width must be positive"),
  h: z.number().positive("Boundary height must be positive"),
  tone: z.enum(BOUNDARY_TONES),
  dashed: z.boolean().default(false),
  /** `false` draws the border only — used for a nested boundary. */
  filled: z.boolean().default(true),
});

export const diagramEdgeSchema = z.object({
  /**
   * Stable identity, so a position in an array is never a handle.
   *
   * Optional to write and always present after parsing: an author should not
   * have to invent a name for something whose identity is already its two
   * endpoints, but everything downstream — an editor addressing an edge, a
   * layout keyed by id — needs one that survives reordering.
   */
  id: z.string().trim().min(1, "Edge id must not be empty").optional(),
  from: z.string().trim().min(1, "Edge source is required"),
  to: z.string().trim().min(1, "Edge target is required"),
  out: z.enum(ANCHOR_SIDES),
  inn: z.enum(ANCHOR_SIDES),
  label: z.string().trim().optional(),
  style: z.enum(EDGE_STYLES).default(EDGE_STYLES.SOLID),
});

/** The least an edge has to be for its id to be derivable. */
interface EdgeIdentity {
  id?: string | undefined;
  from: string;
  to: string;
}

/**
 * Fills in the id an author left out, from the endpoints that already identify
 * the edge.
 *
 * Ids written by hand are reserved before anything is derived, so a derived one
 * can never take a name the author used further down the array — which would
 * make the outcome depend on declaration order in a way nobody could predict.
 *
 * Exported because the editor mutates raw JSON that may legitimately have no
 * ids in it, and has to reach the same edge the schema would. Two copies of
 * this rule would be two answers to "which edge is that", one of them wrong.
 */
export const deriveEdgeIds = <T extends EdgeIdentity>(
  edges: readonly T[],
): Array<T & { id: string }> => {
  const taken = new Set(edges.map((edge) => edge.id).filter((id): id is string => Boolean(id)));

  return edges.map((edge) => {
    if (edge.id) return { ...edge, id: edge.id };

    const base = `${edge.from}-${edge.to}`;
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    taken.add(id);
    return { ...edge, id };
  });
};

const diagramConfigShape = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1, "Title is required").default("diagram"),
  /**
   * A fixed frame, for a diagram that needs an exact size — a slide, a page.
   *
   * Optional, and normally absent: the renderer derives the frame from what the
   * diagram actually contains. Declaring it is what used to make coordinates a
   * walled garden, where a node could be "outside the canvas" and an author had
   * to grow a rectangle before they could put something down. Nothing is out of
   * bounds any more, so nothing needs to be declared in advance.
   */
  canvas: z
    .object({
      w: z.number().positive("Canvas width must be positive"),
      h: z.number().positive("Canvas height must be positive"),
    })
    .optional(),
  /**
   * The paper tone. Named rather than a hex, like every other colour choice in
   * the format: the author picks a tint, the renderer owns the value.
   */
  background: z.enum(CANVAS_TONES).optional(),
  boundaries: z
    .array(diagramBoundarySchema)
    .max(DIAGRAM_LIMITS.MAX_BOUNDARIES, `At most ${DIAGRAM_LIMITS.MAX_BOUNDARIES} boundaries`),
  nodes: z
    .array(diagramNodeSchema)
    .min(DIAGRAM_LIMITS.MIN_NODES, "A diagram needs at least one node")
    .max(DIAGRAM_LIMITS.MAX_NODES, `At most ${DIAGRAM_LIMITS.MAX_NODES} nodes`),
  edges: z
    .array(diagramEdgeSchema)
    .max(DIAGRAM_LIMITS.MAX_EDGES, `At most ${DIAGRAM_LIMITS.MAX_EDGES} edges`)
    .transform(deriveEdgeIds),
});

/** The singular noun each collection's duplicate message speaks in. */
const ITEM_NOUN = {
  nodes: "node",
  boundaries: "boundary",
  edges: "edge",
} as const;

/** Reports the first duplicate of each repeated id in `items`. */
const addDuplicateIdIssues = (
  ctx: z.RefinementCtx,
  items: ReadonlyArray<{ id: string }>,
  field: keyof typeof ITEM_NOUN,
) => {
  const seen = new Set<string>();
  const reported = new Set<string>();

  items.forEach((item, index) => {
    if (seen.has(item.id) && !reported.has(item.id)) {
      reported.add(item.id);
      ctx.addIssue({
        code: "custom",
        path: [field, index, "id"],
        message: `${field}[${index}]: duplicate id "${item.id}" — every ${ITEM_NOUN[field]} id must be unique`,
      });
    }
    seen.add(item.id);
  });
};

export const diagramConfigSchema = diagramConfigShape.superRefine((config, ctx) => {
  addDuplicateIdIssues(ctx, config.nodes, "nodes");
  addDuplicateIdIssues(ctx, config.boundaries, "boundaries");
  addDuplicateIdIssues(ctx, config.edges, "edges");

  const nodeIds = new Set(config.nodes.map((node) => node.id));
  const available = config.nodes.map((node) => node.id).join(", ");

  config.edges.forEach((edge, index) => {
    for (const endpoint of ["from", "to"] as const) {
      const id = edge[endpoint];
      if (!nodeIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", index, endpoint],
          message: `edges[${index}].${endpoint}: "${id}" does not exist. Available nodes: ${available}`,
        });
      }
    }

    if (edge.from === edge.to) {
      ctx.addIssue({
        code: "custom",
        path: ["edges", index],
        message: `edges[${index}]: "${edge.from}" cannot connect to itself`,
      });
    }
  });

  // There is deliberately no bounds check on coordinates. The frame is derived
  // from the drawing, so no point is "outside" it — a node at (-800, 2400) is
  // as legal as one at (110, 180), and the exported document simply covers it.
});

/** Renders a Zod path as the author wrote it: `nodes[0].name`. */
const formatPath = (path: PropertyKey[]): string =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, "");

/**
 * Turns a parse failure into messages an author — human or model — can act on.
 *
 * Cross-field messages already name their own location, so prefixing them again
 * would read as `edges[0].to: edges[0].to: ...`; only messages that lack it get
 * the path prepended.
 */
export const formatDiagramIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = formatPath(issue.path as PropertyKey[]);
    if (!path) return issue.message;
    return issue.message.startsWith(path) ? issue.message : `${path}: ${issue.message}`;
  });

/**
 * The front door to the contract: validate once, get either a config ready to
 * render or every problem with it. Phase 1's `/validate` endpoint and the MCP
 * `validate_diagram` tool are thin wrappers over this.
 */
export const validateDiagramConfig = (
  input: unknown,
): { ok: true; config: DiagramConfig } | { ok: false; errors: string[] } => {
  const parsed = diagramConfigSchema.safeParse(input);
  return parsed.success
    ? { ok: true, config: parsed.data }
    : { ok: false, errors: formatDiagramIssues(parsed.error) };
};

export type DiagramNode = z.infer<typeof diagramNodeSchema>;
export type DiagramBoundary = z.infer<typeof diagramBoundarySchema>;
export type DiagramConfig = z.infer<typeof diagramConfigSchema>;

/** An edge as it is drawn: its id is filled in by the time anyone reads one. */
export type DiagramEdge = DiagramConfig["edges"][number];

/** The authoring shape, before defaults are filled in. */
export type DiagramConfigInput = z.input<typeof diagramConfigSchema>;

/**
 * The canonical example from the design docs. Doubles as the seed the editor
 * loads on first visit, so there is one example to keep correct rather than two.
 */
export const EXAMPLE_DIAGRAM_CONFIG: DiagramConfigInput = {
  version: 1,
  title: "api-simple",
  boundaries: [
    {
      id: "cf",
      label: "CLOUDFLARE",
      icon: "☁️",
      x: 240,
      y: 60,
      w: 420,
      h: 240,
      tone: BOUNDARY_TONES.ORANGE,
    },
  ],
  nodes: [
    // A generic actor has no brand mark, so it keeps an emoji — which is the
    // fallback existing to be used, not a leftover.
    { id: "user", x: 110, y: 180, emoji: "🖥️", name: "User", sub: "browser" },
    { id: "hono", x: 350, y: 180, iconKey: "hono", name: "Hono", sub: "http server" },
    {
      id: "d1",
      x: 550,
      y: 180,
      iconKey: "cloudflare",
      name: "D1",
      sub: "sqlite",
      tile: TILE_VARIANTS.DARK,
    },
  ],
  edges: [
    { from: "user", to: "hono", out: "r", inn: "l", label: "HTTPS" },
    { from: "hono", to: "d1", out: "r", inn: "l", label: "SQL" },
  ],
};
