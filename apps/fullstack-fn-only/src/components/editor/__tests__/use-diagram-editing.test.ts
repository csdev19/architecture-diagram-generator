import { EXAMPLE_DIAGRAM_CONFIG, validateDiagramConfig } from "@diagram-tool/domain/schemas";
import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  moveNode,
  removeEdge,
  removeNode,
  setNodePosition,
  snapToGrid,
  updateEdgeFields,
  updateNodeFields,
} from "../use-diagram-editing";

const seed = () => JSON.stringify(EXAMPLE_DIAGRAM_CONFIG, null, 2);

/** The config a piece of editor text represents, for asserting on. */
const parse = (text: string) => JSON.parse(text) as Record<string, any>;

const nodeById = (text: string, id: string) =>
  parse(text).nodes.find((node: { id: string }) => node.id === id);

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

describe("moveNode", () => {
  it("rewrites only the moved node's coordinates", () => {
    const before = seed();
    const after = moveNode(before, "hono", 300, 200);

    expect(nodeById(after, "hono")).toMatchObject({ x: 299, y: 195 });
    // Every other node is untouched, field for field.
    expect(nodeById(after, "user")).toEqual(nodeById(before, "user"));
    expect(nodeById(after, "d1")).toEqual(nodeById(before, "d1"));
  });

  it("leaves everything that is not a node alone", () => {
    const before = seed();
    const after = moveNode(before, "hono", 300, 200);

    expect(parse(after).edges).toEqual(parse(before).edges);
    expect(parse(after).boundaries).toEqual(parse(before).boundaries);
    expect(parse(after).canvas).toEqual(parse(before).canvas);
  });

  it("keeps the node's other fields", () => {
    const after = moveNode(seed(), "hono", 300, 200);

    expect(nodeById(after, "hono")).toMatchObject({ name: "Hono", iconKey: "hono" });
  });

  it("snaps the coordinates it is given", () => {
    const after = moveNode(seed(), "hono", 301, 197);

    expect(nodeById(after, "hono")).toMatchObject({ x: 299, y: 195 });
  });

  it("is a no-op for a node that does not exist", () => {
    const before = seed();

    expect(moveNode(before, "ghost", 300, 200)).toBe(before);
  });

  it("stays valid after a move inside the canvas", () => {
    const after = moveNode(seed(), "hono", 300, 200);

    expect(validateDiagramConfig(parse(after)).ok).toBe(true);
  });
});

describe("setNodePosition", () => {
  it("writes the coordinates verbatim, off-grid included", () => {
    // Cancelling a drag restores through this. Snapping here would relocate a
    // node whose original position was never on the grid — as the seed's are
    // not: 350 snaps to 351, and 180 to 182.
    const after = setNodePosition(seed(), "hono", 350, 180);

    expect(nodeById(after, "hono")).toMatchObject({ x: 350, y: 180 });
  });
});

describe("updateNodeFields", () => {
  it("patches only the named fields", () => {
    const after = updateNodeFields(seed(), "hono", { name: "Hono v4", sub: "edge router" });
    const node = nodeById(after, "hono");

    expect(node).toMatchObject({ name: "Hono v4", sub: "edge router" });
    expect(node.x).toBe(350);
    expect(node.iconKey).toBe("hono");
  });

  it("swaps an emoji node to an icon and back", () => {
    const toIcon = updateNodeFields(seed(), "user", { iconKey: "react", emoji: undefined });
    expect(nodeById(toIcon, "user")).toMatchObject({ iconKey: "react" });
    expect(nodeById(toIcon, "user")).not.toHaveProperty("emoji");

    const toEmoji = updateNodeFields(toIcon, "user", { emoji: "🖥️", iconKey: undefined });
    expect(nodeById(toEmoji, "user")).toMatchObject({ emoji: "🖥️" });
    expect(nodeById(toEmoji, "user")).not.toHaveProperty("iconKey");
  });

  it("writes a change that breaks validation rather than blocking it", () => {
    // The user has to be able to see the problem in the normal error channel.
    const after = updateNodeFields(seed(), "hono", { name: "x".repeat(40) });

    expect(nodeById(after, "hono").name).toHaveLength(40);
    expect(validateDiagramConfig(parse(after)).ok).toBe(false);
  });
});

describe("addNode", () => {
  const redis = (x: number, y: number) => ({
    id: "redis",
    x,
    y,
    iconKey: "redis" as const,
    name: "Redis",
    sub: "cache",
  });

  it("appends a node and leaves the existing ones untouched", () => {
    const before = seed();
    const after = addNode(before, redis(130, 200));

    expect(parse(after).nodes).toHaveLength(parse(before).nodes.length + 1);
    expect(parse(after).nodes.slice(0, -1)).toEqual(parse(before).nodes);
    expect(validateDiagramConfig(parse(after)).ok).toBe(true);
  });

  it("snaps the point it is given, like every other write of a coordinate", () => {
    const after = addNode(seed(), redis(131, 197));

    expect(parse(after).nodes.at(-1)).toMatchObject({ x: 130, y: 195 });
  });

  it("puts a tile exactly where it was dropped, however far out", () => {
    // Nothing is clamped and nothing grows: there is no frame to be outside of,
    // and the exported document simply covers wherever the tile ended up.
    const after = addNode(seed(), redis(-900, 4000));

    expect(parse(after).nodes.at(-1)).toMatchObject({ x: -897, y: 4004 });
    expect(parse(after).canvas, "addNode re-introduced a fixed frame").toBeUndefined();
    expect(validateDiagramConfig(parse(after)).ok).toBe(true);
  });
});

describe("removeNode", () => {
  it("takes every edge that touched the node with it", () => {
    // Both seeded edges touch `hono`, so removing it must leave none behind:
    // an edge naming a node that no longer exists does not validate.
    const after = removeNode(seed(), "hono");

    expect(parse(after).nodes.map((node: { id: string }) => node.id)).toEqual(["user", "d1"]);
    expect(parse(after).edges).toEqual([]);
  });

  it("keeps the edges that did not touch it", () => {
    const after = removeNode(seed(), "user");

    expect(parse(after).edges).toEqual([
      { from: "hono", to: "d1", out: "r", inn: "l", label: "SQL" },
    ]);
  });

  it("is a no-op for a node that does not exist", () => {
    const before = seed();

    expect(removeNode(before, "ghost")).toBe(before);
  });
});

describe("addEdge", () => {
  it("appends the edge and leaves the existing ones untouched", () => {
    const before = seed();
    const after = addEdge(before, { from: "user", to: "d1", out: "b", inn: "b", style: "dashed" });

    expect(parse(after).edges).toHaveLength(parse(before).edges.length + 1);
    expect(parse(after).edges.slice(0, -1)).toEqual(parse(before).edges);
    expect(parse(after).edges.at(-1)).toMatchObject({ from: "user", to: "d1", style: "dashed" });
  });

  it("produces a config the schema still accepts", () => {
    const after = addEdge(seed(), { from: "user", to: "d1", out: "b", inn: "b" });

    expect(validateDiagramConfig(parse(after)).ok).toBe(true);
  });
});

describe("removeEdge", () => {
  it("drops the edge with that id and keeps the rest in order", () => {
    // The seed writes no edge ids: they are derived from the endpoints, and a
    // gesture has to reach an edge through the id the schema would give it.
    const before = seed();
    const after = removeEdge(before, "user-hono");

    expect(parse(after).edges).toEqual(parse(before).edges.slice(1));
  });

  it("is a no-op for an id no edge carries", () => {
    const before = seed();

    expect(removeEdge(before, "nope")).toBe(before);
  });
});

describe("updateEdgeFields", () => {
  /** Two edges between the same pair, so only the id can tell them apart. */
  const twoWay = () =>
    JSON.stringify(
      {
        version: 1,
        title: "t",
        boundaries: [],
        nodes: [
          { id: "a", x: 0, y: 0, emoji: "a", name: "A" },
          { id: "b", x: 200, y: 0, emoji: "b", name: "B" },
        ],
        edges: [
          { id: "a-b", from: "a", to: "b", out: "r", inn: "l" },
          { id: "b-a", from: "b", to: "a", out: "l", inn: "r" },
        ],
      },
      null,
      2,
    );

  it("edits the edge with the given id, whatever its position", () => {
    const next = parse(updateEdgeFields(twoWay(), "b-a", { label: "retry" }));

    expect((next.edges as Array<Record<string, unknown>>)[1]?.label).toBe("retry");
    expect((next.edges as Array<Record<string, unknown>>)[0]?.label).toBeUndefined();
  });

  it("is a no-op when no edge carries that id", () => {
    const before = twoWay();
    expect(updateEdgeFields(before, "nope", { label: "x" })).toBe(before);
  });
});

describe("editing text that is not valid JSON", () => {
  const broken = '{ "version": 1, oops';

  it("is a no-op for every mutation rather than throwing", () => {
    // The parse error is already on screen; a drag must not replace it with a
    // crash, and must not silently discard what the user typed.
    expect(moveNode(broken, "hono", 10, 10)).toBe(broken);
    expect(updateNodeFields(broken, "hono", { name: "x" })).toBe(broken);
    expect(addEdge(broken, { from: "a", to: "b", out: "r", inn: "l" })).toBe(broken);
    expect(removeEdge(broken, "a-b")).toBe(broken);
  });

  it("is a no-op when the JSON parses but has no nodes array", () => {
    const shapeless = JSON.stringify({ version: 1 }, null, 2);

    expect(moveNode(shapeless, "hono", 10, 10)).toBe(shapeless);
    expect(removeEdge(shapeless, "a-b")).toBe(shapeless);
  });
});

describe("round-tripping", () => {
  it("re-prints with two-space indentation, like the seed", () => {
    const after = moveNode(seed(), "hono", 300, 200);

    expect(after).toContain('\n  "version": 1');
    expect(after.split("\n").length).toBeGreaterThan(10);
  });
});
