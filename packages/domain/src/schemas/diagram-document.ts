import { z } from "zod";
import {
  ANCHOR_SIDES,
  BOUNDARY_PADDINGS,
  BOUNDARY_TONES,
  CANVAS_TONES,
  DIAGRAM_LIMITS,
  ICON_STYLES,
  TILE_VARIANTS,
} from "../constants/diagram";
import {
  deriveEdgeIds,
  diagramBoundarySchema,
  diagramEdgeSchema,
  formatDiagramIssues,
  nodeIdentityShape,
  requireNodeMark,
} from "./diagram";

/**
 * `DiagramDocument` — the format a person pastes and a model returns.
 *
 * One envelope, two parts. `content` is what the architecture *is*: nodes,
 * boundaries, grouping, relationships. `layout` is how it is *composed*:
 * positions, rectangles, anchors. Splitting them is what lets a model answer
 * with architecture alone and still get an editable diagram, and it means a
 * drag produces a diff confined to the `layout` subtree.
 *
 * `layout` is optional and may be partial. Everything missing from it is
 * computed by `resolveDiagram`, which is the only place geometry is invented.
 */

/**
 * A node, without geometry. Where it sits is `layout`'s business.
 *
 * Strict, so a node still carrying `x` and `y` is reported rather than quietly
 * stripped. Pasting a v1 node into a v2 document is the obvious mistake to
 * make, and silently dropping the positions is the one response that loses the
 * author's work without telling them.
 */
export const contentNodeSchema = z.strictObject(nodeIdentityShape).superRefine(requireNodeMark);

/**
 * A boundary, without geometry, plus how tightly it should hug its members.
 *
 * `padding` is named rather than numeric for the same reason `tone` is: the
 * author states an intention and the renderer owns the pixels. It is also what
 * replaces resizing a grouped boundary, whose rectangle is not its to write.
 */
export const contentBoundarySchema = diagramBoundarySchema
  .omit({ x: true, y: true, w: true, h: true })
  .extend({
    padding: z.enum(BOUNDARY_PADDINGS).default(BOUNDARY_PADDINGS.NORMAL),
  });

/** An edge, without its anchor sides — which side a line leaves is composition. */
export const contentEdgeSchema = diagramEdgeSchema.omit({ out: true, inn: true });

/**
 * A group: a relation over elements, and nothing else.
 *
 * It has no geometry and never will. That is not an omission to be fixed later
 * — it is the reason a group can never contradict the picture. A group's
 * members may be nodes, boundaries or other groups.
 */
export const diagramGroupSchema = z.object({
  id: z.string().trim().min(1, "Group id is required"),
  members: z
    .array(z.string().trim().min(1, "A group member must name an element"))
    .min(1, "A group needs at least one member"),
});

export const diagramContentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(DIAGRAM_LIMITS.TITLE_MAX, `A title is at most ${DIAGRAM_LIMITS.TITLE_MAX} characters`)
    .default("diagram"),
  /**
   * The paper tone. Content rather than layout: it is a semantic choice like a
   * boundary's tone, and arranging a diagram must never be able to lose it.
   */
  background: z.enum(CANVAS_TONES).optional(),
  /**
   * Whether marks are drawn in colour or as silhouettes. Content for the same
   * reason the paper tone is: it exports with the drawing, and arranging must
   * never lose it.
   */
  iconStyle: z.enum(ICON_STYLES).optional(),
  nodes: z
    .array(contentNodeSchema)
    .min(DIAGRAM_LIMITS.MIN_NODES, "A diagram needs at least one node")
    .max(DIAGRAM_LIMITS.MAX_NODES, `At most ${DIAGRAM_LIMITS.MAX_NODES} nodes`),
  boundaries: z
    .array(contentBoundarySchema)
    .max(DIAGRAM_LIMITS.MAX_BOUNDARIES, `At most ${DIAGRAM_LIMITS.MAX_BOUNDARIES} boundaries`)
    .default([]),
  groups: z
    .array(diagramGroupSchema)
    .max(DIAGRAM_LIMITS.MAX_GROUPS, `At most ${DIAGRAM_LIMITS.MAX_GROUPS} groups`)
    .default([]),
  edges: z
    .array(contentEdgeSchema)
    .max(DIAGRAM_LIMITS.MAX_EDGES, `At most ${DIAGRAM_LIMITS.MAX_EDGES} edges`)
    .default([])
    .transform(deriveEdgeIds),
});

/**
 * Strict objects, so a half-written position or a stray `zIndex` is reported
 * rather than silently ignored. A layout entry is small enough that anything
 * unexpected in it is a mistake.
 */
const pointSchema = z.strictObject({ x: z.number(), y: z.number() });

const rectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().positive("Boundary width must be positive"),
  h: z.number().positive("Boundary height must be positive"),
});

const anchorsSchema = z.strictObject({
  out: z.enum(ANCHOR_SIDES),
  inn: z.enum(ANCHOR_SIDES),
});

export const diagramLayoutSchema = z.object({
  nodes: z.record(z.string(), pointSchema).default({}),
  /** Only an ungrouped boundary has one: a grouped boundary derives its own. */
  boundaries: z.record(z.string(), rectSchema).default({}),
  edges: z.record(z.string(), anchorsSchema).default({}),
  /**
   * ADR 0002's escape hatch: a fixed frame for a diagram that must be an exact
   * size, such as a slide. Absent by default — the frame follows the drawing.
   */
  canvas: z
    .object({
      w: z.number().positive("Canvas width must be positive"),
      h: z.number().positive("Canvas height must be positive"),
    })
    .optional(),
});

type Content = z.infer<typeof diagramContentSchema>;
type Layout = z.infer<typeof diagramLayoutSchema>;

/** What kind of thing an id names, for messages and for the layout checks. */
type ElementKind = "node" | "boundary" | "group";

const kindsById = (content: Content): Map<string, ElementKind> => {
  const kinds = new Map<string, ElementKind>();
  for (const node of content.nodes) kinds.set(node.id, "node");
  for (const boundary of content.boundaries) kinds.set(boundary.id, "boundary");
  for (const group of content.groups) kinds.set(group.id, "group");
  return kinds;
};

/**
 * Reports every id used twice across nodes, boundaries and groups.
 *
 * They share one namespace because group members and layout keys address them
 * by bare id: a node and a boundary both called `api` would make
 * `layout.nodes.api` and a member list ambiguous.
 */
const addDuplicateIdIssues = (ctx: z.RefinementCtx, content: Content) => {
  const seen = new Set<string>();
  const reported = new Set<string>();

  const all: Array<{ id: string; kind: ElementKind }> = [
    ...content.nodes.map((node) => ({ id: node.id, kind: "node" as const })),
    ...content.boundaries.map((boundary) => ({ id: boundary.id, kind: "boundary" as const })),
    ...content.groups.map((group) => ({ id: group.id, kind: "group" as const })),
  ];

  for (const item of all) {
    if (seen.has(item.id) && !reported.has(item.id)) {
      reported.add(item.id);
      ctx.addIssue({
        code: "custom",
        path: ["content", `${item.kind}s`, item.id],
        message: `duplicate id "${item.id}" — nodes, boundaries and groups share one namespace, because a group member and a layout key name an element by its bare id`,
      });
    }
    seen.add(item.id);
  }
};

/** The group each element belongs to directly, and the overlaps found on the way. */
const addMembershipIssues = (ctx: z.RefinementCtx, content: Content): Map<string, string> => {
  const parent = new Map<string, string>();
  const kinds = kindsById(content);

  for (const group of content.groups) {
    for (const member of group.members) {
      if (!kinds.has(member)) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "groups", group.id],
          message: `content.groups.${group.id}: "${member}" is not an element of this diagram`,
        });
        continue;
      }

      if (member === group.id) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "groups", group.id],
          message: `content.groups.${group.id}: a group cannot contain itself`,
        });
        continue;
      }

      const held = parent.get(member);
      if (held !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "groups", group.id],
          message: `content.groups.${group.id}: "${member}" is already a member of "${held}" — an element belongs to at most one group`,
        });
        continue;
      }

      parent.set(member, group.id);
    }
  }

  return parent;
};

/**
 * Reports a group that contains itself through nesting.
 *
 * Walked iteratively rather than recursively: a hand-written document may name
 * a cycle, and a validator that overflows its stack on bad input is a validator
 * that cannot report bad input.
 */
const addCycleIssues = (ctx: z.RefinementCtx, content: Content, parent: Map<string, string>) => {
  for (const group of content.groups) {
    const seen = new Set<string>([group.id]);
    let current = parent.get(group.id);

    while (current !== undefined) {
      if (seen.has(current)) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "groups", group.id],
          message: `content.groups.${group.id}: this group is inside itself — the nesting forms a cycle`,
        });
        break;
      }

      seen.add(current);
      current = parent.get(current);
    }
  }
};

/**
 * Reports a group with two boundaries, and a group with no node.
 *
 * Both are the same failure seen from two sides: a boundary in a group is sized
 * from what its group siblings cover, so two of them would have the same
 * enclosing job and no unambiguous answer, and none of them would have anything
 * to enclose. `resolveDiagram` is total over every document that validates, so
 * the document with no answer has to be the one that does not validate.
 */
const addGroupShapeIssues = (ctx: z.RefinementCtx, content: Content) => {
  const kinds = kindsById(content);
  const groupsById = new Map(content.groups.map((group) => [group.id, group]));

  for (const group of content.groups) {
    const boundaries = group.members.filter((member) => kinds.get(member) === "boundary");

    if (boundaries.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["content", "groups", group.id],
        message: `content.groups.${group.id}: "${group.id}" has two boundaries, "${boundaries[0]}" and "${boundaries[1]}" — a group is framed by at most one`,
      });
    }

    // Depth-first over the nesting, with a visited set so a cycle — reported
    // separately — cannot spin here.
    const seen = new Set<string>([group.id]);
    const pending = [...group.members];
    let hasNode = false;

    while (pending.length > 0) {
      const member = pending.pop();
      if (member === undefined || seen.has(member)) continue;
      seen.add(member);

      if (kinds.get(member) === "node") {
        hasNode = true;
        break;
      }

      const nested = groupsById.get(member);
      if (nested) pending.push(...nested.members);
    }

    if (hasNode) continue;

    const boundaryId = boundaries[0];
    ctx.addIssue({
      code: "custom",
      path: ["content", "groups", group.id],
      message: boundaryId
        ? `content.groups.${group.id}: "${group.id}" contains no node, so "${boundaryId}" has nothing to enclose. Add a node to the group, or take the boundary out of it and place it in layout.boundaries.`
        : `content.groups.${group.id}: "${group.id}" contains no node, directly or through nesting — a group exists to keep nodes together`,
    });
  }
};

/** Reports an edge that names something other than a node, or names itself twice. */
const addEdgeIssues = (ctx: z.RefinementCtx, content: Content) => {
  const nodeIds = new Set(content.nodes.map((node) => node.id));
  const available = content.nodes.map((node) => node.id).join(", ");

  const seen = new Set<string>();
  const reported = new Set<string>();

  content.edges.forEach((edge, index) => {
    for (const endpoint of ["from", "to"] as const) {
      const id = edge[endpoint];
      if (!nodeIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "edges", index, endpoint],
          message: `content.edges[${index}].${endpoint}: "${id}" is not a node. Available nodes: ${available}`,
        });
      }
    }

    if (edge.from === edge.to) {
      ctx.addIssue({
        code: "custom",
        path: ["content", "edges", index],
        message: `content.edges[${index}]: "${edge.from}" cannot connect to itself`,
      });
    }

    if (seen.has(edge.id) && !reported.has(edge.id)) {
      reported.add(edge.id);
      ctx.addIssue({
        code: "custom",
        path: ["content", "edges", index, "id"],
        message: `content.edges[${index}]: duplicate id "${edge.id}" — every edge id must be unique`,
      });
    }
    seen.add(edge.id);
  });
};

/**
 * Reports a layout key naming something that is not there, or geometry written
 * for a boundary that derives its own — and the boundary that has neither.
 *
 * A stale key is an error rather than a silent drop. The editor keeps layout
 * clean as it edits, so reaching this means someone wrote it by hand, which is
 * exactly the moment they want to be told.
 */
const addLayoutIssues = (ctx: z.RefinementCtx, content: Content, layout: Layout) => {
  const kinds = kindsById(content);
  const grouped = new Set(content.groups.flatMap((group) => group.members));
  const edgeIds = new Set(content.edges.map((edge) => edge.id));

  for (const id of Object.keys(layout.nodes)) {
    if (kinds.get(id) !== "node") {
      ctx.addIssue({
        code: "custom",
        path: ["layout", "nodes", id],
        message: `layout.nodes.${id}: "${id}" is not a node in content`,
      });
    }
  }

  for (const id of Object.keys(layout.edges)) {
    if (!edgeIds.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["layout", "edges", id],
        message: `layout.edges.${id}: "${id}" is not an edge in content`,
      });
    }
  }

  for (const id of Object.keys(layout.boundaries)) {
    if (kinds.get(id) !== "boundary") {
      ctx.addIssue({
        code: "custom",
        path: ["layout", "boundaries", id],
        message: `layout.boundaries.${id}: "${id}" is not a boundary in content`,
      });
      continue;
    }

    if (grouped.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["layout", "boundaries", id],
        message: `layout.boundaries.${id}: "${id}" is in a group, so its rectangle is derived from its members. Remove the layout entry, or take it out of the group.`,
      });
    }
  }

  for (const boundary of content.boundaries) {
    if (grouped.has(boundary.id)) continue;
    if (layout.boundaries[boundary.id]) continue;

    ctx.addIssue({
      code: "custom",
      path: ["content", "boundaries", boundary.id],
      message: `"${boundary.id}" has no geometry: put it in a group so it encloses that group's members, or give it a rectangle in layout.boundaries.`,
    });
  }
};

const checkDocument = (
  document: { content: Content; layout: Layout },
  ctx: z.RefinementCtx,
): void => {
  const { content, layout } = document;

  addDuplicateIdIssues(ctx, content);
  const parent = addMembershipIssues(ctx, content);
  addCycleIssues(ctx, content, parent);
  addGroupShapeIssues(ctx, content);
  addEdgeIssues(ctx, content);
  addLayoutIssues(ctx, content, layout);
};

export const diagramDocumentSchema = z
  .object({
    version: z.literal(2),
    content: diagramContentSchema,
    layout: diagramLayoutSchema.default({ nodes: {}, boundaries: {}, edges: {} }),
  })
  .superRefine(checkDocument);

/**
 * The front door to the format: validate once, get either a document ready to
 * resolve or every problem with it. A future `/validate` endpoint and the MCP
 * `validate_diagram` tool are thin wrappers over this.
 */
export const validateDiagramDocument = (
  input: unknown,
): { ok: true; document: DiagramDocument } | { ok: false; errors: string[] } => {
  const parsed = diagramDocumentSchema.safeParse(input);
  return parsed.success
    ? { ok: true, document: parsed.data }
    : { ok: false, errors: formatDiagramIssues(parsed.error) };
};

export type ContentNode = z.infer<typeof contentNodeSchema>;
export type ContentBoundary = z.infer<typeof contentBoundarySchema>;
export type ContentEdge = Content["edges"][number];
export type DiagramGroup = z.infer<typeof diagramGroupSchema>;
export type DiagramContent = Content;
export type DiagramLayout = Layout;
export type DiagramDocument = z.infer<typeof diagramDocumentSchema>;

/** The authoring shape, before defaults are filled in. */
export type DiagramDocumentInput = z.input<typeof diagramDocumentSchema>;

/**
 * The canonical example, and the editor's seed.
 *
 * Content-only on purpose: it is the demonstration that a document with no
 * geometry in it draws a complete diagram. It exercises both kinds of group —
 * one framed by a boundary, one that only keeps its tiles together.
 */
export const EXAMPLE_DIAGRAM_DOCUMENT: DiagramDocumentInput = {
  version: 2,
  content: {
    title: "payments",
    nodes: [
      { id: "web", iconKey: "react", name: "Web", sub: "portal" },
      { id: "api", iconKey: "hono", name: "API", sub: "http server" },
      {
        id: "db",
        iconKey: "cloudflare",
        name: "D1",
        sub: "sqlite",
        tile: TILE_VARIANTS.DARK,
      },
      // A build step has no brand mark of its own, so it keeps an emoji — the
      // fallback exists to be used, not to be a leftover.
      { id: "ci", emoji: "⚙️", name: "CI", sub: "deploy" },
    ],
    boundaries: [{ id: "cf", label: "CLOUDFLARE", icon: "☁️", tone: BOUNDARY_TONES.ORANGE }],
    groups: [
      { id: "runtime", members: ["cf", "api", "db"] },
      { id: "pipeline", members: ["ci", "web"] },
    ],
    edges: [
      { from: "web", to: "api", label: "HTTPS" },
      { from: "api", to: "db", label: "SQL" },
      { from: "ci", to: "api", label: "deploy", style: "dashed" },
    ],
  },
};
