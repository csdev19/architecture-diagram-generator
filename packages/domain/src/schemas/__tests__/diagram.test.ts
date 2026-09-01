import { describe, expect, it } from "vitest";
import { EXAMPLE_DIAGRAM_CONFIG, diagramConfigSchema, validateDiagramConfig } from "../diagram";

/** Every failure message produced by parsing `input`. */
const messagesFor = (input: unknown): string[] => {
  const parsed = diagramConfigSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

/** A minimal valid config, cloned so a test can break one field in isolation. */
const validConfig = () => structuredClone(EXAMPLE_DIAGRAM_CONFIG) as Record<string, unknown>;

describe("diagramConfigSchema", () => {
  it("accepts the canonical example config", () => {
    expect(diagramConfigSchema.safeParse(EXAMPLE_DIAGRAM_CONFIG).success).toBe(true);
  });

  it("applies the documented defaults", () => {
    const parsed = diagramConfigSchema.parse({
      version: 1,
      canvas: { w: 700, h: 360 },
      groups: [],
      nodes: [{ id: "a", x: 200, y: 180, emoji: "🖥️", name: "User" }],
      edges: [],
    });

    expect(parsed.title).toBe("diagram");
    expect(parsed.nodes[0]?.sub).toBe("");
    expect(parsed.nodes[0]?.tile).toBe("light");
  });

  it("applies group and edge defaults", () => {
    const config = validConfig();
    const parsed = diagramConfigSchema.parse(config);

    expect(parsed.groups[0]?.dashed).toBe(false);
    expect(parsed.groups[0]?.filled).toBe(true);
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

  it("names the repeated id when two groups share one", () => {
    const config = validConfig();
    const groups = config.groups as Array<Record<string, unknown>>;
    groups.push({ ...groups[0]! });

    expect(messagesFor(config).some((m) => m.includes("unique"))).toBe(true);
  });

  it("tells the author to abbreviate a name that overflows the tile", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "x".repeat(27);

    expect(messagesFor(config).some((m) => m.includes("26") && m.includes("abbreviate"))).toBe(
      true,
    );
  });

  it("rejects a node too close to the canvas edge, naming the node and the margin", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.x = 10;

    const messages = messagesFor(config);
    expect(messages.some((m) => m.includes('"user"') && m.includes("60"))).toBe(true);
  });

  it("rejects a whitespace-only name", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "   ";

    expect(diagramConfigSchema.safeParse(config).success).toBe(false);
  });

  it("rejects an unknown group tone", () => {
    const config = validConfig();
    (config.groups as Array<Record<string, unknown>>)[0]!.tone = "purple";

    expect(diagramConfigSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a version other than 1", () => {
    const config = validConfig();
    config.version = 2;

    expect(diagramConfigSchema.safeParse(config).success).toBe(false);
  });

  it("rejects a canvas smaller than the documented minimum", () => {
    const config = validConfig();
    config.canvas = { w: 100, h: 100 };

    expect(diagramConfigSchema.safeParse(config).success).toBe(false);
  });

  it("requires at least one node", () => {
    const config = validConfig();
    config.nodes = [];
    config.edges = [];

    expect(diagramConfigSchema.safeParse(config).success).toBe(false);
  });
});

/**
 * The phase-0 example frozen as a literal. `EXAMPLE_DIAGRAM_CONFIG` itself
 * gained `iconKey`s in phase 1.5, so it can no longer stand as the guarantee
 * that a config written before icons existed still parses. This copy can.
 */
const PHASE_0_CONFIG = {
  version: 1,
  title: "api-simple",
  canvas: { w: 700, h: 360 },
  groups: [
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
  version: 1,
  canvas: { w: 700, h: 360 },
  groups: [],
  nodes: [{ id: "a", x: 200, y: 180, name: "Thing", ...node }],
  edges: [],
});

describe("node icons", () => {
  it("accepts a node identified by an iconKey alone", () => {
    expect(diagramConfigSchema.safeParse(configWithNode({ iconKey: "react" })).success).toBe(true);
  });

  it("still accepts a node identified by an emoji alone", () => {
    expect(diagramConfigSchema.safeParse(configWithNode({ emoji: "🔥" })).success).toBe(true);
  });

  it("accepts every config written before icons existed", () => {
    expect(diagramConfigSchema.safeParse(PHASE_0_CONFIG).success).toBe(true);
  });

  it("leaves iconKey absent rather than defaulting it", () => {
    const parsed = diagramConfigSchema.parse(configWithNode({ emoji: "🔥" }));
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
    const result = validateDiagramConfig(configWithNode({ iconKey: "not-a-framework" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The message has to be actionable: it must name the field and offer keys.
      expect(result.errors.some((e) => e.includes("nodes[0].iconKey"))).toBe(true);
      expect(result.errors.some((e) => e.includes("react"))).toBe(true);
    }
  });

  it("accepts a node carrying both an emoji and an iconKey", () => {
    expect(
      diagramConfigSchema.safeParse(configWithNode({ emoji: "🔥", iconKey: "hono" })).success,
    ).toBe(true);
  });
});

describe("validateDiagramConfig", () => {
  it("returns the parsed config, defaults filled in, when valid", () => {
    const result = validateDiagramConfig(EXAMPLE_DIAGRAM_CONFIG);

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

    const result = validateDiagramConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('"nope"'))).toBe(true);
      expect(result.errors.some((e) => e.includes("abbreviate"))).toBe(true);
    }
  });

  it("prefixes the path onto a message that does not already carry one", () => {
    const config = validConfig();
    (config.nodes as Array<Record<string, unknown>>)[0]!.name = "x".repeat(27);

    const result = validateDiagramConfig(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("nodes[0].name: "))).toBe(true);
    }
  });

  it("does not prefix a cross-field message that already names its location", () => {
    const config = validConfig();
    (config.edges as Array<Record<string, unknown>>)[0]!.to = "nope";

    const result = validateDiagramConfig(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.find((e) => e.includes('"nope"'));
      expect(message?.startsWith("edges[0].to: ")).toBe(true);
      expect(message).not.toContain("edges[0].to: edges[0].to");
    }
  });

  it("reports a non-object input without throwing", () => {
    const result = validateDiagramConfig("not a config");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});
