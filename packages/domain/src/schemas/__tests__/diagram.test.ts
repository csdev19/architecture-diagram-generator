import { describe, expect, it } from "vitest";
import {
  EXAMPLE_RESOLVED_DIAGRAM,
  resolvedDiagramSchema,
  validateResolvedDiagram,
} from "../diagram";

/** Every failure message produced by parsing `input`. */
const messagesFor = (input: unknown): string[] => {
  const parsed = resolvedDiagramSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

/** A minimal valid config, cloned so a test can break one field in isolation. */
const validConfig = () => structuredClone(EXAMPLE_RESOLVED_DIAGRAM) as Record<string, unknown>;

describe("resolvedDiagramSchema", () => {
  it("accepts the canonical example config", () => {
    expect(resolvedDiagramSchema.safeParse(EXAMPLE_RESOLVED_DIAGRAM).success).toBe(true);
  });

  it("applies the documented defaults", () => {
    const parsed = resolvedDiagramSchema.parse({
      canvas: { w: 700, h: 360 },
      boundaries: [],
      nodes: [{ id: "a", x: 200, y: 180, emoji: "🖥️", name: "User" }],
      edges: [],
    });

    expect(parsed.title).toBe("diagram");
    expect(parsed.nodes[0]?.sub).toBe("");
    expect(parsed.nodes[0]?.tile).toBe("light");
  });

  it("applies boundary and edge defaults", () => {
    const config = validConfig();
    const parsed = resolvedDiagramSchema.parse(config);

    expect(parsed.boundaries[0]?.dashed).toBe(false);
    expect(parsed.boundaries[0]?.filled).toBe(true);
    expect(parsed.edges[0]?.style).toBe("solid");
  });

  it("names the missing node and lists the available ids when an edge dangles", () => {
    const config = validConfig();
    (config.edges as Array<Record<string, unknown>>)[0]!.to = "nope";

    const messages = messagesFor(config);
    expect(messages.some((m) => m.includes('"nope"') && m.includes("does not exist"))).toBe(true);
    expect(messages.some((m) => m.includes("user") && m.includes("hono"))).toBe(true);
  });

  it("reports every dangling edge in a single parse", () => {
    const config = validConfig();
    const edges = config.edges as Array<Record<string, unknown>>;
    edges[0]!.to = "nope";
    edges[1]!.from = "alsonope";

    const messages = messagesFor(config);
    expect(messages.some((m) => m.includes('"nope"'))).toBe(true);
    expect(messages.some((m) => m.includes('"alsonope"'))).toBe(true);
  });

  it("rejects an edge that connects a node to itself", () => {
    const config = validConfig();
    const edges = config.edges as Array<Record<string, unknown>>;
    edges[0]!.from = "hono";
    edges[0]!.to = "hono";

    expect(messagesFor(config).some((m) => m.includes("itself"))).toBe(true);
  });

  it("names the repeated id when two nodes share one", () => {
    const config = validConfig();
    const nodes = config.nodes as Array<Record<string, unknown>>;
    nodes[1]!.id = nodes[0]!.id;

    expect(messagesFor(config).some((m) => m.includes('"user"') && m.includes("unique"))).toBe(
      true,
    );
  });

  it("names the repeated id when two boundaries share one", () => {
    const config = validConfig();
    const boundaries = config.boundaries as Array<Record<string, unknown>>;
    boundaries.push({ ...boundaries[0]! });

    expect(messagesFor(config).some((m) => m.includes("unique"))).toBe(true);
  });

  it("tells the author to abbreviate a name that overflows the tile", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "x".repeat(27);

    expect(messagesFor(config).some((m) => m.includes("26") && m.includes("abbreviate"))).toBe(
      true,
    );
  });

  it("accepts a coordinate anywhere, negatives included", () => {
    // There is no canvas to be outside of any more: the exported frame is
    // derived from the drawing, so an author placing a tile far off to the
    // left is describing a wider diagram, not making a mistake.
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.x = -1800;
    (config.nodes as Array<Record<string, unknown>>)[0]!.y = 9000;

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(true);
  });

  it("rejects a whitespace-only name", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "   ";

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(false);
  });

  it("rejects an unknown boundary tone", () => {
    const config = validConfig();
    (config.boundaries as Array<Record<string, unknown>>)[0]!.tone = "purple";

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(false);
  });

  it("accepts a config with no canvas at all — that is the normal shape now", () => {
    const config = validConfig();
    delete config.canvas;

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(true);
  });

  it("still rejects a canvas that is not a positive size", () => {
    const config = validConfig();
    config.canvas = { w: 0, h: -10 };

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(false);
  });

  it("requires at least one node", () => {
    const config = validConfig();
    config.nodes = [];
    config.edges = [];

    expect(resolvedDiagramSchema.safeParse(config).success).toBe(false);
  });
});

describe("edge ids", () => {
  /** A two-node config whose edges the test supplies. */
  const configWithEdges = (edges: Array<Record<string, unknown>>) => ({
    boundaries: [],
    nodes: [
      { id: "user", x: 110, y: 180, emoji: "🖥️", name: "User" },
      { id: "hono", x: 350, y: 180, emoji: "🔥", name: "Hono" },
    ],
    edges,
  });

  it("derives an edge id from its endpoints when the author omits one", () => {
    const result = validateResolvedDiagram(
      configWithEdges([{ from: "user", to: "hono", out: "r", inn: "l" }]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.edges[0]?.id).toBe("user-hono");
  });

  it("suffixes a derived id when the same pair is connected twice", () => {
    const result = validateResolvedDiagram(
      configWithEdges([
        { from: "user", to: "hono", out: "r", inn: "l" },
        { from: "user", to: "hono", out: "b", inn: "t", style: "dashed" },
      ]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.edges.map((edge) => edge.id)).toEqual(["user-hono", "user-hono-2"]);
    }
  });

  it("keeps an id the author wrote", () => {
    const result = validateResolvedDiagram(
      configWithEdges([{ id: "login", from: "user", to: "hono", out: "r", inn: "l" }]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.edges[0]?.id).toBe("login");
  });

  it("rejects two edges that were given the same id", () => {
    const result = validateResolvedDiagram(
      configWithEdges([
        { id: "same", from: "user", to: "hono", out: "r", inn: "l" },
        { id: "same", from: "hono", to: "user", out: "l", inn: "r" },
      ]),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain('duplicate id "same"');
  });

  it("never collides a derived id with one the author wrote", () => {
    const result = validateResolvedDiagram(
      configWithEdges([
        { id: "user-hono", from: "hono", to: "user", out: "l", inn: "r" },
        { from: "user", to: "hono", out: "r", inn: "l" },
      ]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.edges[1]?.id).toBe("user-hono-2");
  });
});

/**
 * The phase-0 example frozen as a literal. `EXAMPLE_RESOLVED_DIAGRAM` itself
 * gained `iconKey`s in phase 1.5, so it can no longer stand as the guarantee
 * that a config written before icons existed still parses. This copy can.
 */
const PHASE_0_CONFIG = {
  title: "api-simple",
  canvas: { w: 700, h: 360 },
  boundaries: [
    { id: "cf", label: "CLOUDFLARE", icon: "☁️", x: 240, y: 60, w: 420, h: 240, tone: "orange" },
  ],
  nodes: [
    { id: "user", x: 110, y: 180, emoji: "🖥️", name: "User", sub: "browser" },
    { id: "hono", x: 350, y: 180, emoji: "🔥", name: "Hono", sub: "http server" },
    { id: "d1", x: 550, y: 180, emoji: "🗄️", name: "D1", sub: "sqlite", tile: "dark" },
  ],
  edges: [
    { from: "user", to: "hono", out: "r", inn: "l", label: "HTTPS" },
    { from: "hono", to: "d1", out: "r", inn: "l", label: "SQL" },
  ],
};

/** A one-node config with the node's identity fields under the test's control. */
const configWithNode = (node: Record<string, unknown>) => ({
  canvas: { w: 700, h: 360 },
  boundaries: [],
  nodes: [{ id: "a", x: 200, y: 180, name: "Thing", ...node }],
  edges: [],
});

describe("node icons", () => {
  it("accepts a node identified by an iconKey alone", () => {
    expect(resolvedDiagramSchema.safeParse(configWithNode({ iconKey: "react" })).success).toBe(
      true,
    );
  });

  it("still accepts a node identified by an emoji alone", () => {
    expect(resolvedDiagramSchema.safeParse(configWithNode({ emoji: "🔥" })).success).toBe(true);
  });

  it("accepts every config written before icons existed", () => {
    expect(resolvedDiagramSchema.safeParse(PHASE_0_CONFIG).success).toBe(true);
  });

  it("leaves iconKey absent rather than defaulting it", () => {
    const parsed = resolvedDiagramSchema.parse(configWithNode({ emoji: "🔥" }));
    expect(parsed.nodes[0]?.iconKey).toBeUndefined();
  });

  it("tells the author to supply one of the two when a node has neither", () => {
    const messages = messagesFor(configWithNode({}));

    expect(messages.some((m) => m.includes("emoji") && m.includes("iconKey"))).toBe(true);
    expect(
      messages.some((m) => m.includes("guidelines")),
      "the message never points at where the key list lives",
    ).toBe(true);
  });

  it("names the offending node when it has neither", () => {
    expect(messagesFor(configWithNode({ id: "orphan" })).some((m) => m.includes('"orphan"'))).toBe(
      true,
    );
  });

  it("rejects an iconKey that is not in the registry", () => {
    const result = validateResolvedDiagram(configWithNode({ iconKey: "not-a-framework" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The message has to be actionable: it must name the field and offer keys.
      expect(result.errors.some((e) => e.includes("nodes[0].iconKey"))).toBe(true);
      expect(result.errors.some((e) => e.includes("react"))).toBe(true);
    }
  });

  it("accepts a node carrying both an emoji and an iconKey", () => {
    expect(
      resolvedDiagramSchema.safeParse(configWithNode({ emoji: "🔥", iconKey: "hono" })).success,
    ).toBe(true);
  });
});

describe("node initials", () => {
  it("accepts a node identified by initials alone", () => {
    expect(resolvedDiagramSchema.safeParse(configWithNode({ initials: "ST" })).success).toBe(true);
  });

  it("accepts a single character", () => {
    expect(resolvedDiagramSchema.safeParse(configWithNode({ initials: "S" })).success).toBe(true);
  });

  it("rejects a third character, which would not fit the tile", () => {
    const result = validateResolvedDiagram(configWithNode({ initials: "STR" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("nodes[0].initials"))).toBe(true);
    }
  });

  it("counts a glyph made of several code units as the one character it draws", () => {
    // "🖥️" is three UTF-16 units and one mark on the tile. A length measured in
    // units would reject it while a person counts one character and disagrees.
    expect(resolvedDiagramSchema.safeParse(configWithNode({ initials: "🖥️" })).success).toBe(true);
  });

  it("rejects initials that are only whitespace", () => {
    // The emoji keeps the node marked, so the only thing left to fail on is
    // the blank field itself rather than a node with nothing to show.
    const result = validateResolvedDiagram(configWithNode({ initials: "  ", emoji: "🔥" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("nodes[0].initials"))).toBe(true);
    }
  });

  it("leaves initials absent rather than defaulting them", () => {
    const parsed = resolvedDiagramSchema.parse(configWithNode({ emoji: "🔥" }));

    expect(parsed.nodes[0]?.initials).toBeUndefined();
  });

  it("offers initials as a third way out when a node has no mark at all", () => {
    const messages = messagesFor(configWithNode({}));

    expect(messages.some((m) => m.includes("initials"))).toBe(true);
  });

  it("keeps initials on a node that also names an iconKey", () => {
    const parsed = resolvedDiagramSchema.parse(configWithNode({ initials: "HO", iconKey: "hono" }));

    expect(parsed.nodes[0]?.initials).toBe("HO");
  });
});
describe("validateResolvedDiagram", () => {
  it("returns the parsed config, defaults filled in, when valid", () => {
    const result = validateResolvedDiagram(EXAMPLE_RESOLVED_DIAGRAM);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.nodes[0]?.tile).toBe("light");
      expect(result.config.edges[0]?.style).toBe("solid");
    }
  });

  it("returns every problem at once when invalid", () => {
    const config = validConfig();
    (config.edges as Array<Record<string, unknown>>)[0]!.to = "nope";
    (config.nodes as Array<Record<string, unknown>>)[1]!.name = "x".repeat(27);

    const result = validateResolvedDiagram(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('"nope"'))).toBe(true);
      expect(result.errors.some((e) => e.includes("abbreviate"))).toBe(true);
    }
  });

  it("prefixes the path onto a message that does not already carry one", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "x".repeat(27);

    const result = validateResolvedDiagram(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("nodes[0].name: "))).toBe(true);
    }
  });

  it("does not prefix a cross-field message that already names its location", () => {
    const config = validConfig();
    (config.edges as Array<Record<string, unknown>>)[0]!.to = "nope";

    const result = validateResolvedDiagram(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.find((e) => e.includes('"nope"'));
      expect(message?.startsWith("edges[0].to: ")).toBe(true);
      expect(message).not.toContain("edges[0].to: edges[0].to");
    }
  });

  it("reports a non-object input without throwing", () => {
    const result = validateResolvedDiagram("not a config");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});
