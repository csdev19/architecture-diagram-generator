import { describe, expect, it } from "vitest";
import { DIAGRAM_GEOMETRY } from "../../constants/diagram";
import {
  EXAMPLE_RESOLVED_DIAGRAM,
  resolvedDiagramSchema,
  validateResolvedDiagram,
  type ResolvedDiagramInput,
} from "../../schemas/diagram";
import { layoutDiagram } from "../layout";

const layout = (input: ResolvedDiagramInput) => layoutDiagram(resolvedDiagramSchema.parse(input));

/** A chain of nodes joined by solid edges, which is the shape layout is for. */
const chain = (ids: string[], extra: Partial<ResolvedDiagramInput> = {}): ResolvedDiagramInput => ({
  boundaries: [],
  nodes: ids.map((id, index) => ({ id, x: 100 + index, y: 100, emoji: "🔥", name: id })),
  edges: ids.slice(1).map((id, index) => ({
    from: ids[index] as string,
    to: id,
    out: "r" as const,
    inn: "l" as const,
  })),
  ...extra,
});

const positionOf = (config: ReturnType<typeof layout>, id: string) => {
  const node = config.nodes.find((candidate) => candidate.id === id);
  return { x: node?.x, y: node?.y };
};

describe("layoutDiagram", () => {
  it("lays a solid chain out left to right on one row", () => {
    const result = layout(chain(["a", "b", "c"]));
    const { LAYOUT_ORIGIN, LAYOUT_COLUMN_GAP } = DIAGRAM_GEOMETRY;

    expect(positionOf(result, "a")).toEqual({ x: LAYOUT_ORIGIN, y: LAYOUT_ORIGIN });
    expect(positionOf(result, "b")).toEqual({
      x: LAYOUT_ORIGIN + LAYOUT_COLUMN_GAP,
      y: LAYOUT_ORIGIN,
    });
    expect(positionOf(result, "c")).toEqual({
      x: LAYOUT_ORIGIN + 2 * LAYOUT_COLUMN_GAP,
      y: LAYOUT_ORIGIN,
    });
  });

  it("follows the longest path, not the first one found", () => {
    // a → b → c and also a → c. `c` belongs after `b`, not beside it.
    const result = layout({
      ...chain(["a", "b", "c"]),
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        { from: "b", to: "c", out: "r", inn: "l" },
        { from: "a", to: "c", out: "b", inn: "b" },
      ],
    });

    expect(positionOf(result, "c").x).toBeGreaterThan(positionOf(result, "b").x ?? 0);
  });

  it("drops a node with no solid edges into the band below", () => {
    const result = layout({
      ...chain(["a", "b"]),
      nodes: [
        { id: "a", x: 100, y: 100, emoji: "🔥", name: "a" },
        { id: "b", x: 200, y: 100, emoji: "🔥", name: "b" },
        { id: "cache", x: 300, y: 100, emoji: "⚡", name: "cache" },
      ],
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        { from: "b", to: "cache", out: "b", inn: "t", style: "dashed" },
      ],
    });

    expect(positionOf(result, "cache").y).toBeGreaterThan(positionOf(result, "a").y ?? 0);
  });

  it("puts a secondary node under the node it attaches to, not at the far left", () => {
    // Without this, `cache` keeps column 0 — it carries no solid edge, so the
    // layering never reaches it — and its dashed line crosses the whole diagram.
    const result = layout({
      ...chain(["a", "b", "c"]),
      nodes: [
        { id: "a", x: 100, y: 100, emoji: "🔥", name: "a" },
        { id: "b", x: 200, y: 100, emoji: "🔥", name: "b" },
        { id: "c", x: 300, y: 100, emoji: "🔥", name: "c" },
        { id: "cache", x: 400, y: 100, emoji: "⚡", name: "cache" },
      ],
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        { from: "b", to: "c", out: "r", inn: "l" },
        { from: "c", to: "cache", out: "b", inn: "t", style: "dashed" },
      ],
    });

    expect(positionOf(result, "cache").x).toBe(positionOf(result, "c").x);
    expect(positionOf(result, "cache").y).toBeGreaterThan(positionOf(result, "c").y ?? 0);
  });

  it("anchors a secondary node whichever way the dashed edge points", () => {
    const result = layout({
      ...chain(["a", "b"]),
      nodes: [
        { id: "a", x: 100, y: 100, emoji: "🔥", name: "a" },
        { id: "b", x: 200, y: 100, emoji: "🔥", name: "b" },
        { id: "ci", x: 300, y: 100, emoji: "⚙️", name: "ci" },
      ],
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        // Points *into* the flow rather than out of it.
        { from: "ci", to: "b", out: "t", inn: "b", style: "dashed" },
      ],
    });

    expect(positionOf(result, "ci").x).toBe(positionOf(result, "b").x);
  });

  it("keeps every node clear of every other", () => {
    const result = layout(chain(["a", "b", "c", "d", "e"]));
    const { TILE_SIZE } = DIAGRAM_GEOMETRY;

    for (const first of result.nodes) {
      for (const second of result.nodes) {
        if (first.id === second.id) continue;
        const apart =
          Math.abs(first.x - second.x) >= TILE_SIZE || Math.abs(first.y - second.y) >= TILE_SIZE;
        expect(apart, `"${first.id}" overlaps "${second.id}"`).toBe(true);
      }
    }
  });

  it("stacks rather than overlaps when two nodes want the same column", () => {
    // Both `b` and `c` are fed only by `a`, so both want column 1.
    const result = layout({
      ...chain(["a", "b", "c"]),
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        { from: "a", to: "c", out: "r", inn: "l" },
      ],
    });

    expect(positionOf(result, "b").x).toBe(positionOf(result, "c").x);
    expect(positionOf(result, "b").y).not.toBe(positionOf(result, "c").y);
  });

  it("leaves the frame alone — placing the nodes is what resizes the diagram", () => {
    const result = layout(chain(["a", "b", "c", "d", "e", "f"]));

    expect(result.canvas, "layout re-introduced a fixed canvas").toBeUndefined();
    expect(validateResolvedDiagram(result).ok, "layout produced a config it rejects").toBe(true);
  });

  it("produces a config the schema accepts, for the canonical example too", () => {
    const result = layoutDiagram(resolvedDiagramSchema.parse(EXAMPLE_RESOLVED_DIAGRAM));

    expect(validateResolvedDiagram(result).ok).toBe(true);
  });

  it("is deterministic", () => {
    const first = layout(chain(["a", "b", "c"]));
    const second = layout(chain(["a", "b", "c"]));

    expect(first).toEqual(second);
  });

  it("terminates on a cycle instead of hanging", () => {
    const result = layout({
      ...chain(["a", "b", "c"]),
      edges: [
        { from: "a", to: "b", out: "r", inn: "l" },
        { from: "b", to: "c", out: "r", inn: "l" },
        { from: "c", to: "a", out: "b", inn: "b" },
      ],
    });

    expect(result.nodes).toHaveLength(3);
    // Every node still got a distinct position rather than piling on the origin.
    expect(new Set(result.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(3);
  });

  it("leaves everything that is not a position alone", () => {
    const before = resolvedDiagramSchema.parse(EXAMPLE_RESOLVED_DIAGRAM);
    const after = layoutDiagram(before);

    expect(after.edges).toEqual(before.edges);
    expect(after.boundaries).toEqual(before.boundaries);
    expect(after.title).toBe(before.title);
    expect(after.nodes.map((node) => node.name)).toEqual(before.nodes.map((node) => node.name));
    expect(after.nodes.map((node) => node.iconKey)).toEqual(
      before.nodes.map((node) => node.iconKey),
    );
  });

  it("handles a single node without a flow to hang it off", () => {
    const result = layout({
      canvas: { w: 700, h: 360 },
      boundaries: [],
      nodes: [{ id: "solo", x: 300, y: 200, emoji: "🔥", name: "Solo" }],
      edges: [],
    });

    expect(validateResolvedDiagram(result).ok).toBe(true);
    expect(positionOf(result, "solo")).toEqual({
      x: DIAGRAM_GEOMETRY.LAYOUT_ORIGIN,
      y: DIAGRAM_GEOMETRY.LAYOUT_ORIGIN,
    });
  });
});
