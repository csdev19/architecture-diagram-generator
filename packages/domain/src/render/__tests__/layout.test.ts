import { describe, expect, it } from "vitest";
import { BOUNDARY_PADDING_SIZE, DIAGRAM_GEOMETRY } from "../../constants/diagram";
import type { BoundaryPadding } from "../../constants/diagram";
import {
  EXAMPLE_RESOLVED_DIAGRAM,
  resolvedDiagramSchema,
  validateResolvedDiagram,
  type ResolvedDiagramInput,
} from "../../schemas/diagram";
import type { Point } from "../anchors";
import { layoutDiagram, layoutNodes } from "../layout";

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

/** A content-shaped diagram: nodes with no geometry, plus its relations. */
const content = (
  ids: string[],
  extra: Partial<{
    edges: Array<{ from: string; to: string; style: string }>;
    groups: Array<{ id: string; members: string[] }>;
    boundaries: Array<{ id: string; padding: BoundaryPadding }>;
  }> = {},
) => ({
  nodes: ids.map((id) => ({ id, name: id, sub: "" })),
  edges: ids.slice(1).map((id, index) => ({
    from: ids[index] as string,
    to: id,
    style: "solid",
  })),
  ...extra,
});

/** The rectangle a set of placed nodes covers, tiles and labels included. */
const boxAround = (placed: Map<string, Point>, ids: string[]) => {
  const points = ids.map((id) => placed.get(id) as Point);
  const half = DIAGRAM_GEOMETRY.TILE_SIZE / 2;

  return {
    minX: Math.min(...points.map((point) => point.x)) - half,
    maxX: Math.max(...points.map((point) => point.x)) + half,
    minY: Math.min(...points.map((point) => point.y)) - half,
    maxY: Math.max(...points.map((point) => point.y)) + half + DIAGRAM_GEOMETRY.NODE_TEXT_BLOCK,
  };
};

const inside = (box: ReturnType<typeof boxAround>, point: Point) =>
  point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;

describe("layoutNodes", () => {
  it("places every node when nothing is supplied", () => {
    const placed = layoutNodes(content(["a", "b", "c"]));

    expect([...placed.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves a supplied position exactly where it was put", () => {
    const placed = layoutNodes(content(["a", "b", "c"]), { b: { x: -400, y: 900 } });

    expect(placed.get("b")).toEqual({ x: -400, y: 900 });
  });

  it("never places a node on top of a supplied one", () => {
    const placed = layoutNodes(content(["a", "b", "c"]), {
      b: { x: DIAGRAM_GEOMETRY.LAYOUT_ORIGIN, y: DIAGRAM_GEOMETRY.LAYOUT_ORIGIN },
    });

    for (const [id, point] of placed) {
      if (id === "b") continue;
      const clash =
        Math.abs(point.x - DIAGRAM_GEOMETRY.LAYOUT_ORIGIN) < DIAGRAM_GEOMETRY.NODE_SPACING &&
        Math.abs(point.y - DIAGRAM_GEOMETRY.LAYOUT_ORIGIN) < DIAGRAM_GEOMETRY.NODE_SPACING;

      expect(clash, `"${id}" landed on the supplied position`).toBe(false);
    }
  });

  it("returns the supplied positions untouched when everything is pinned", () => {
    const pinned = { a: { x: 0, y: 0 }, b: { x: 500, y: 0 } };
    const placed = layoutNodes(content(["a", "b"]), pinned);

    expect(Object.fromEntries(placed)).toEqual(pinned);
  });

  it("is deterministic", () => {
    const first = layoutNodes(content(["a", "b", "c"]));
    const second = layoutNodes(content(["a", "b", "c"]));

    expect([...first]).toEqual([...second]);
  });

  it("terminates on a cycle", () => {
    const cyclic = {
      ...content(["a", "b", "c"]),
      edges: [
        { from: "a", to: "b", style: "solid" },
        { from: "b", to: "c", style: "solid" },
        { from: "c", to: "a", style: "solid" },
      ],
    };

    expect(() => layoutNodes(cyclic)).not.toThrow();
    expect(layoutNodes(cyclic).size).toBe(3);
  });

  it("keeps a group's members together, with nothing else between them", () => {
    const placed = layoutNodes(
      content(["web", "api", "db", "ci"], {
        edges: [
          { from: "web", to: "api", style: "solid" },
          { from: "api", to: "db", style: "solid" },
          { from: "ci", to: "api", style: "dashed" },
        ],
        groups: [{ id: "runtime", members: ["api", "db"] }],
      }),
    );

    const box = boxAround(placed, ["api", "db"]);

    expect(inside(box, placed.get("web") as Point)).toBe(false);
    expect(inside(box, placed.get("ci") as Point)).toBe(false);
  });

  it("lays out a group nested inside a group", () => {
    const placed = layoutNodes(
      content(["api", "db", "cache", "web"], {
        edges: [
          { from: "web", to: "api", style: "solid" },
          { from: "api", to: "db", style: "solid" },
          { from: "db", to: "cache", style: "solid" },
        ],
        groups: [
          { id: "runtime", members: ["api", "storage"] },
          { id: "storage", members: ["db", "cache"] },
        ],
      }),
    );

    const outer = boxAround(placed, ["api", "db", "cache"]);
    const inner = boxAround(placed, ["db", "cache"]);

    expect(inner.minX).toBeGreaterThanOrEqual(outer.minX);
    expect(inner.maxX).toBeLessThanOrEqual(outer.maxX);
    expect(inside(outer, placed.get("web") as Point)).toBe(false);
  });

  it("reserves room for the rectangle a boundary will be given", () => {
    // Two groups side by side, each framed at its loosest. Their derived boxes
    // are the members' extent plus the padding — if placement ignored that
    // padding, the two boxes would overlap even though no tile does.
    const placed = layoutNodes(
      content(["a", "b", "c", "d"], {
        edges: [
          { from: "a", to: "b", style: "solid" },
          { from: "b", to: "c", style: "solid" },
          { from: "c", to: "d", style: "solid" },
        ],
        groups: [
          { id: "left", members: ["cf", "a", "b"] },
          { id: "right", members: ["aws", "c", "d"] },
        ],
        boundaries: [
          { id: "cf", padding: "loose" },
          { id: "aws", padding: "loose" },
        ],
      }),
    );

    const room = BOUNDARY_PADDING_SIZE.loose;
    const left = boxAround(placed, ["a", "b"]);
    const right = boxAround(placed, ["c", "d"]);

    expect(right.minX - room, "the two derived boundaries overlap").toBeGreaterThan(
      left.maxX + room,
    );
  });

  it("lays a level with no solid edges out in a row, not a column", () => {
    // Tooling boxes are the ordinary shape here: a monorepo's runtime, build
    // system and linter share a perimeter without any flow between them. With
    // no spine to layer against, every item stayed in column 0 and the group
    // stacked into a tower taller than the diagram it belonged to.
    const placed = layoutNodes(
      content(["a", "bun", "turbo", "lint", "hooks"], {
        edges: [{ from: "hooks", to: "lint", style: "dashed" }],
        groups: [{ id: "tooling", members: ["repo", "bun", "turbo", "lint", "hooks"] }],
        boundaries: [{ id: "repo", padding: "normal" }],
      }),
    );

    const row = ["bun", "turbo", "lint", "hooks"].map((id) => placed.get(id) as Point);

    for (const point of row) {
      expect(point.y, "the group stacked vertically instead of laying out in a row").toBe(
        row[0]?.y,
      );
    }
    expect(new Set(row.map((point) => point.x)).size).toBe(row.length);
  });

  it("aligns a group's flow row with a node placed beside it", () => {
    // A node's reference is the centre of its tile, but a block's used to be
    // its geometric centre — which sits lower, because a label hangs under
    // every tile and a boundary reserves room for its own above. Aligning the
    // two put the bare node half a label-block low and visibly kinked the
    // main path where it crossed into the box.
    const placed = layoutNodes(
      content(["web", "api", "db"], {
        groups: [{ id: "cloud", members: ["aws", "api", "db"] }],
        boundaries: [{ id: "aws", padding: "normal" }],
      }),
    );

    const web = placed.get("web") as Point;
    const api = placed.get("api") as Point;
    const db = placed.get("db") as Point;

    expect(web.y, "the spine bends where it enters the boundary").toBe(api.y);
    expect(db.y).toBe(api.y);
  });
});
