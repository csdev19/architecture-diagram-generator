import {
  EXAMPLE_DIAGRAM_DOCUMENT,
  diagramDocumentSchema,
  validateDiagramDocument,
} from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  removeBoundary,
  removeEdge,
  removeNode,
  setBackground,
  updateNodeFields,
} from "../content-edits";
import { snapToGrid } from "../edit-document";
import {
  clearNodeLayout,
  dropLayoutFor,
  moveNode,
  moveNodes,
  setNodePosition,
} from "../layout-edits";
import { materialiseLayout } from "../materialise";

/** The seed, which is content-only: nothing in it has a position of its own. */
const contentOnly = () => JSON.stringify(EXAMPLE_DIAGRAM_DOCUMENT, null, 2);

const parse = (text: string) => JSON.parse(text) as Record<string, any>;
const resolved = (text: string) => resolveDiagram(diagramDocumentSchema.parse(JSON.parse(text)));

/** The seed with every position written down, as a gesture leaves it. */
const settled = () => materialiseLayout(contentOnly(), resolved(contentOnly()));

const valid = (text: string) => validateDiagramDocument(JSON.parse(text)).ok;

describe("snapToGrid", () => {
  it("rounds to the half-grid", () => {
    // The background grid is 26px, so the half-grid a drag snaps to is 13.
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(6)).toBe(0);
    expect(snapToGrid(7)).toBe(13);
    expect(snapToGrid(20)).toBe(26);
    expect(snapToGrid(180)).toBe(182);
  });

  it("snaps negatives without drifting toward zero", () => {
    expect(snapToGrid(-7)).toBe(-13);
  });
});

describe("moving a node", () => {
  it("creates the layout branch on the first write", () => {
    const next = parse(moveNode(contentOnly(), "api", 130, 260));

    expect(next.layout.nodes.api).toEqual({ x: 130, y: 260 });
  });

  it("writes nothing into content", () => {
    const before = parse(contentOnly()).content;
    const next = parse(moveNode(contentOnly(), "api", 130, 260));

    expect(next.content).toEqual(before);
  });

  it("snaps a dragged position to the half grid", () => {
    const next = parse(moveNode(contentOnly(), "api", 134, 261));

    expect(next.layout.nodes.api).toEqual({ x: 130, y: 260 });
  });

  it("writes several positions at once", () => {
    const next = parse(moveNodes(contentOnly(), { api: { x: 0, y: 0 }, db: { x: 200, y: 0 } }));

    expect(next.layout.nodes).toEqual({
      api: { x: 0, y: 0 },
      db: { x: snapToGrid(200), y: 0 },
    });
  });

  it("returns unparseable text unchanged", () => {
    expect(moveNode("{ not json", "api", 0, 0)).toBe("{ not json");
  });
});

describe("cancelling a drag", () => {
  it("deletes the entry when the node had none", () => {
    const dragged = moveNode(contentOnly(), "api", 130, 260);
    const cancelled = parse(setNodePosition(dragged, "api", null));

    // A node with no supplied position is one auto-layout is placing, and
    // cancelling must hand it back rather than pin it where the drag began.
    expect(cancelled.layout?.nodes?.api).toBeUndefined();
  });

  it("restores an exact position on a node that had one", () => {
    const pinned = moveNode(contentOnly(), "api", 111, 222);
    const cancelled = parse(setNodePosition(pinned, "api", { x: 111, y: 222 }));

    expect(cancelled.layout.nodes.api).toEqual({ x: 111, y: 222 });
  });

  it("leaves no empty branch behind", () => {
    const dragged = moveNode(contentOnly(), "api", 130, 260);
    const cancelled = parse(setNodePosition(dragged, "api", null));

    expect(cancelled.layout).toBeUndefined();
  });
});

describe("materialising the layout", () => {
  it("pins every node the resolver placed", () => {
    const next = parse(settled());

    for (const node of parse(contentOnly()).content.nodes) {
      expect(next.layout.nodes[node.id], `"${node.id}" was left floating`).toBeDefined();
    }
  });

  it("leaves a position the author already wrote", () => {
    const pinned = moveNode(contentOnly(), "api", 111, 222);
    const before = parse(pinned).layout.nodes.api;
    const next = parse(materialiseLayout(pinned, resolved(pinned)));

    expect(next.layout.nodes.api).toEqual(before);
  });

  it("never pins a grouped boundary, whose rectangle is derived", () => {
    const next = parse(settled());

    expect(next.layout.boundaries?.cf).toBeUndefined();
  });

  it("is a no-op once everything is settled", () => {
    const once = settled();

    expect(materialiseLayout(once, resolved(once))).toBe(once);
  });

  it("leaves a document that still validates", () => {
    expect(valid(settled())).toBe(true);
  });

  it("does not move anything it wrote down", () => {
    const before = resolved(contentOnly());
    const after = resolved(settled());

    for (const node of before.nodes) {
      const moved = after.nodes.find((candidate) => candidate.id === node.id);
      expect(moved, `"${node.id}" moved when its position was written down`).toMatchObject({
        x: node.x,
        y: node.y,
      });
    }
  });
});

describe("adding a node", () => {
  const queue = { id: "queue", emoji: "📮", name: "Queue", sub: "jobs" };

  it("writes the node into content and its point into layout", () => {
    const next = parse(addNode(settled(), queue, { x: 400, y: 400 }));

    expect(next.content.nodes.at(-1)).toEqual(queue);
    expect(next.layout.nodes.queue).toEqual({ x: 403, y: 403 });
  });

  it("puts a tile exactly where it was dropped, however far out", () => {
    // Nothing is clamped and nothing grows: there is no frame to be outside of.
    const next = parse(addNode(settled(), queue, { x: -900, y: 4000 }));

    expect(next.layout.nodes.queue).toEqual({ x: -897, y: 4004 });
    expect(next.layout.canvas, "adding a node re-introduced a fixed frame").toBeUndefined();
  });

  it("leaves a document that still validates", () => {
    expect(valid(addNode(settled(), queue, { x: 400, y: 400 }))).toBe(true);
  });
});

describe("removing a node", () => {
  it("takes every edge that touched it, in both halves", () => {
    const next = parse(removeNode(settled(), "api", resolved(settled())));

    expect(next.content.nodes.map((node: { id: string }) => node.id)).toEqual(["web", "db", "ci"]);
    expect(next.content.edges).toHaveLength(0);
    expect(next.layout.nodes.api).toBeUndefined();
    expect(next.layout.edges ?? {}).toEqual({});
  });

  it("takes it out of the group that held it", () => {
    const next = parse(removeNode(settled(), "db", resolved(settled())));
    const runtime = next.content.groups.find((group: { id: string }) => group.id === "runtime");

    expect(runtime.members).toEqual(["cf", "api"]);
  });

  it("dissolves a group left with nothing to keep together", () => {
    // `runtime` holds the boundary plus `api` and `db`. Take both tiles out and
    // the group has nothing left to frame — which is a document that does not
    // validate, so it must not be the one the editor leaves behind.
    const once = removeNode(settled(), "api", resolved(settled()));
    const next = parse(removeNode(once, "db", resolved(once)));

    expect(next.content.groups.some((group: { id: string }) => group.id === "runtime")).toBe(false);
    // The boundary survives, and is handed the rectangle it had on screen.
    expect(next.content.boundaries).toHaveLength(1);
    expect(next.layout.boundaries.cf).toMatchObject({ w: expect.any(Number) });
  });

  it("leaves a document that still validates, whichever node goes", () => {
    for (const id of ["web", "api", "db", "ci"]) {
      const next = removeNode(settled(), id, resolved(settled()));
      expect(valid(next), `deleting "${id}" produced a document that does not validate`).toBe(true);
    }
  });

  it("is a no-op for a node that does not exist", () => {
    const before = settled();
    expect(removeNode(before, "ghost", resolved(before))).toBe(before);
  });
});

describe("removing a boundary", () => {
  it("leaves the tiles and the group it framed", () => {
    const next = parse(removeBoundary(settled(), "cf", resolved(settled())));

    expect(next.content.boundaries).toHaveLength(0);
    expect(next.content.nodes).toHaveLength(4);
    expect(next.content.groups).toHaveLength(2);
  });

  it("leaves a document that still validates", () => {
    expect(valid(removeBoundary(settled(), "cf", resolved(settled())))).toBe(true);
  });
});

describe("edges", () => {
  it("appends without inventing an id when the endpoints are enough", () => {
    const next = parse(addEdge(contentOnly(), { from: "web", to: "db", label: "cache" }));

    expect(next.content.edges.at(-1)).toEqual({ from: "web", to: "db", label: "cache" });
  });

  it("writes an id when the pair is already connected", () => {
    const next = parse(addEdge(contentOnly(), { from: "web", to: "api", style: "dashed" }));

    // Two edges between the same tiles would otherwise have ids that depend on
    // array order, which is exactly the instability ids exist to remove.
    expect(next.content.edges.at(-1)).toMatchObject({ id: "web-api-2" });
  });

  it("removes by id, and takes its anchors with it", () => {
    const withAnchors = JSON.stringify(
      { ...EXAMPLE_DIAGRAM_DOCUMENT, layout: { edges: { "web-api": { out: "b", inn: "t" } } } },
      null,
      2,
    );

    const next = parse(removeEdge(withAnchors, "web-api"));

    expect(next.content.edges).toHaveLength(2);
    expect(next.layout?.edges?.["web-api"]).toBeUndefined();
  });

  it("reaches an edge whose id the document never wrote down", () => {
    // The seed omits every edge id: they are derived from the endpoints, and a
    // gesture has to reach an edge through the id the schema would give it.
    const next = parse(removeEdge(contentOnly(), "api-db"));

    expect(next.content.edges.map((edge: { to: string }) => edge.to)).toEqual(["api", "api"]);
  });
});

describe("content edits", () => {
  it("renames a node without touching layout", () => {
    const before = parse(settled()).layout;
    const next = parse(updateNodeFields(settled(), "api", { name: "Gateway" }));

    expect(next.content.nodes.find((node: { id: string }) => node.id === "api").name).toBe(
      "Gateway",
    );
    expect(next.layout).toEqual(before);
  });

  it("writes a change that breaks validation rather than blocking it", () => {
    // The user has to be able to see the problem in the normal error channel.
    const next = updateNodeFields(settled(), "api", { name: "x".repeat(40) });

    expect(valid(next)).toBe(false);
  });

  it("puts the paper tone in content, where arranging cannot lose it", () => {
    const next = parse(setBackground(contentOnly(), "cream"));

    expect(next.content.background).toBe("cream");
  });
});

describe("clearing the layout", () => {
  it("forgets every position and keeps everything else", () => {
    const next = parse(clearNodeLayout(settled()));

    expect(next.layout?.nodes).toBeUndefined();
    expect(next.content).toEqual(parse(contentOnly()).content);
  });

  it("drops the entries an id owned", () => {
    const next = parse(dropLayoutFor(settled(), ["api"]));

    expect(next.layout.nodes.api).toBeUndefined();
    expect(next.layout.nodes.web).toBeDefined();
  });
});
