import { describe, expect, it } from "vitest";
import {
  EXAMPLE_DIAGRAM_DOCUMENT,
  diagramDocumentSchema,
  validateDiagramDocument,
} from "../diagram-document";

/**
 * The document under test is the spec's payments example: four nodes, one
 * boundary, a group that frames two of them and a group that frames nothing.
 * Every case below breaks exactly one thing about it.
 */
const NODES = [
  { id: "web", iconKey: "react", name: "Web", sub: "portal" },
  { id: "api", iconKey: "hono", name: "API", sub: "http server" },
  { id: "db", iconKey: "cloudflare", name: "D1", sub: "sqlite", tile: "dark" },
  { id: "ci", emoji: "⚙️", name: "CI", sub: "deploy" },
];

const boundary = (id: string) => ({ id, label: "CLOUDFLARE", tone: "orange" });

const GROUPS = [
  { id: "runtime", members: ["cf", "api", "db"] },
  { id: "pipeline", members: ["ci", "web"] },
];

const EDGES = [
  { id: "web-api", from: "web", to: "api", label: "HTTPS" },
  { id: "api-db", from: "api", to: "db", label: "SQL" },
];

interface Overrides {
  nodes?: unknown;
  boundaries?: unknown;
  groups?: unknown;
  edges?: unknown;
  layout?: unknown;
}

const documentWith = ({ layout, ...content }: Overrides = {}) => ({
  version: 2,
  content: {
    title: "payments",
    nodes: NODES,
    boundaries: [boundary("cf")],
    groups: GROUPS,
    edges: EDGES,
    ...content,
  },
  ...(layout === undefined ? {} : { layout }),
});

const errorsOf = (input: unknown): string => {
  const result = validateDiagramDocument(input);
  return result.ok ? "" : result.errors.join("\n");
};

describe("diagramDocumentSchema", () => {
  it("accepts a content-only document", () => {
    expect(validateDiagramDocument(EXAMPLE_DIAGRAM_DOCUMENT).ok).toBe(true);
  });

  it("accepts the spec's example with a group that has no boundary", () => {
    expect(validateDiagramDocument(documentWith()).ok).toBe(true);
  });

  it("fills in the defaults an author left out", () => {
    const parsed = diagramDocumentSchema.parse(documentWith());

    expect(parsed.content.boundaries[0]?.padding).toBe("normal");
    expect(parsed.content.edges[0]?.style).toBe("solid");
    expect(parsed.layout).toEqual({ nodes: {}, boundaries: {}, edges: {} });
  });

  it("rejects a version other than 2", () => {
    expect(validateDiagramDocument({ ...documentWith(), version: 1 }).ok).toBe(false);
  });

  it("rejects a node that carries its own coordinates", () => {
    // Geometry belongs to layout. Accepting `x` here would quietly create a
    // second place a position can live, which is the whole thing v2 removes.
    const result = validateDiagramDocument(
      documentWith({ nodes: [{ ...NODES[0], x: 10, y: 10 }, ...NODES.slice(1)] }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("group membership", () => {
  it("rejects the same element in two groups", () => {
    const errors = errorsOf(
      documentWith({
        groups: [
          { id: "one", members: ["api", "web"] },
          { id: "two", members: ["api", "ci"] },
        ],
        boundaries: [],
      }),
    );

    expect(errors).toContain('"api" is already a member of "one"');
  });

  it("rejects a group that contains itself, however indirectly", () => {
    const errors = errorsOf(
      documentWith({
        boundaries: [],
        groups: [
          { id: "outer", members: ["inner", "web"] },
          { id: "inner", members: ["api", "outer"] },
        ],
      }),
    );

    expect(errors).toContain("cycle");
  });

  it("rejects a member that does not exist", () => {
    const errors = errorsOf(
      documentWith({ boundaries: [], groups: [{ id: "one", members: ["ghost", "api"] }] }),
    );

    expect(errors).toContain('"ghost" is not an element of this diagram');
  });

  it("rejects two boundaries in one group", () => {
    const errors = errorsOf(
      documentWith({
        boundaries: [boundary("cf"), boundary("aws")],
        groups: [{ id: "runtime", members: ["cf", "aws", "api"] }],
        layout: {},
      }),
    );

    expect(errors).toContain('"runtime" has two boundaries, "cf" and "aws"');
  });

  it("rejects a group whose only member is a boundary", () => {
    const errors = errorsOf(documentWith({ groups: [{ id: "runtime", members: ["cf"] }] }));

    expect(errors).toContain('"runtime" contains no node, so "cf" has nothing to enclose');
  });

  it("rejects a chain of groups that bottoms out in no node", () => {
    const errors = errorsOf(
      documentWith({
        groups: [
          { id: "outer", members: ["inner"] },
          { id: "inner", members: ["cf"] },
        ],
      }),
    );

    expect(errors).toContain("contains no node");
  });

  it("accepts a nested group carrying its own boundary", () => {
    const result = validateDiagramDocument(
      documentWith({
        boundaries: [boundary("cf"), boundary("data")],
        groups: [
          { id: "runtime", members: ["cf", "api", "storage"] },
          { id: "storage", members: ["data", "db"] },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("layout", () => {
  it("rejects a layout key that names nothing", () => {
    const errors = errorsOf(documentWith({ layout: { nodes: { ghost: { x: 0, y: 0 } } } }));

    expect(errors).toContain('layout.nodes.ghost: "ghost" is not a node in content');
  });

  it("rejects a rectangle for a grouped boundary", () => {
    const errors = errorsOf(
      documentWith({ layout: { boundaries: { cf: { x: 0, y: 0, w: 100, h: 100 } } } }),
    );

    expect(errors).toContain('"cf" is in a group, so its rectangle is derived from its members');
  });

  it("rejects a boundary that is neither grouped nor placed", () => {
    const errors = errorsOf(documentWith({ groups: [{ id: "pipeline", members: ["ci", "web"] }] }));

    expect(errors).toContain('"cf" has no geometry');
  });

  it("accepts an ungrouped boundary with a rectangle", () => {
    const result = validateDiagramDocument(
      documentWith({
        groups: [{ id: "pipeline", members: ["ci", "web"] }],
        layout: { boundaries: { cf: { x: 0, y: 0, w: 300, h: 200 } } },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a partial position", () => {
    expect(
      validateDiagramDocument(documentWith({ layout: { nodes: { api: { x: 10 } } } })).ok,
    ).toBe(false);
  });

  it("rejects a stray key inside a layout entry", () => {
    const result = validateDiagramDocument(
      documentWith({ layout: { nodes: { api: { x: 10, y: 10, zIndex: 2 } } } }),
    );

    expect(result.ok).toBe(false);
  });

  it("accepts anchors for an edge that exists", () => {
    const result = validateDiagramDocument(
      documentWith({ layout: { edges: { "web-api": { out: "b", inn: "t" } } } }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects anchors for an edge that does not", () => {
    const errors = errorsOf(documentWith({ layout: { edges: { ghost: { out: "b", inn: "t" } } } }));

    expect(errors).toContain('"ghost" is not an edge in content');
  });
});

describe("edges and ids", () => {
  it("rejects an edge that names a boundary", () => {
    const errors = errorsOf(
      documentWith({ edges: [{ id: "e", from: "cf", to: "api" }], layout: {} }),
    );

    expect(errors).toContain("Available nodes:");
  });

  it("rejects a node and a boundary sharing an id", () => {
    const errors = errorsOf(
      documentWith({
        boundaries: [{ id: "api", label: "CLOUDFLARE", tone: "orange" }],
        groups: [{ id: "runtime", members: ["api", "db"] }],
      }),
    );

    expect(errors).toContain("duplicate id");
  });

  it("derives an edge id from its endpoints when the author omits one", () => {
    const result = validateDiagramDocument(
      documentWith({ edges: [{ from: "web", to: "api" }, ...EDGES.slice(1)] }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.content.edges[0]?.id).toBe("web-api");
  });

  it("reports every problem in one parse", () => {
    const result = validateDiagramDocument(
      documentWith({
        edges: [{ id: "e", from: "ghost", to: "api" }],
        layout: { nodes: { alsoGhost: { x: 0, y: 0 } } },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });
});
