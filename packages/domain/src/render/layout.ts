import { DIAGRAM_GEOMETRY, DIAGRAM_LIMITS, EDGE_STYLES } from "../constants/diagram";
import type { DiagramConfig, DiagramNode } from "../schemas/diagram";

/**
 * Auto-layout: coordinates derived from topology rather than typed by hand.
 *
 * The rule the guidelines give a model is the rule implemented here — the main
 * request path reads left to right in one row, and everything hanging off it
 * sits in a band below. So this is not a second opinion about layout; it is the
 * same opinion, executed.
 *
 * Pure and deterministic: the same config in gives the same config out, with no
 * clock, no randomness and no dependence on object iteration order beyond the
 * array order the author wrote. A config whose edges form a cycle still
 * terminates — it just stops being able to layer, and the remainder is placed
 * in the order the nodes were declared.
 */

const { LAYOUT_ORIGIN, LAYOUT_COLUMN_GAP, NODE_SPACING, NODE_TEXT_BLOCK } = DIAGRAM_GEOMETRY;

/** Clamps a canvas dimension into what the schema will accept. */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Assigns each node a column, following the solid edges only.
 *
 * Solid edges are the primary flow by definition, so they are what a
 * left-to-right reading should follow; dashed edges are side channels and would
 * distort the spine if they counted. Layering is longest-path — a node sits one
 * column right of the furthest-right thing that feeds it — computed with a
 * queue so a cycle cannot recurse forever.
 */
const assignColumns = (config: DiagramConfig): Map<string, number> => {
  const ids = new Set(config.nodes.map((node) => node.id));
  const flow = config.edges.filter(
    (edge) => edge.style === EDGE_STYLES.SOLID && ids.has(edge.from) && ids.has(edge.to),
  );

  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>(config.nodes.map((node) => [node.id, 0]));

  for (const edge of flow) {
    successors.set(edge.from, [...(successors.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const column = new Map<string, number>();
  // Seeded in declaration order so the output does not depend on Map ordering.
  const queue = config.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  for (const id of queue) column.set(id, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === undefined) continue;

    for (const next of successors.get(id) ?? []) {
      column.set(next, Math.max(column.get(next) ?? 0, (column.get(id) ?? 0) + 1));

      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  // Anything still unplaced sits inside a cycle: Kahn's algorithm never drains
  // it. Those nodes go one column past everything that could be layered, in
  // declaration order, which is arbitrary but stable and never overlaps.
  const placed = [...column.values()];
  let next = placed.length > 0 ? Math.max(...placed) + 1 : 0;

  for (const node of config.nodes) {
    if (column.has(node.id)) continue;
    column.set(node.id, next);
    next += 1;
  }

  return column;
};

/**
 * Re-places every node from the topology, and grows the canvas to fit.
 *
 * Nodes touched by a solid edge form the flow and are laid out on the top row,
 * one column each. Everything else drops into the band below, keeping the
 * column of whatever it attaches to so it reads as hanging off that node.
 * Where several nodes want the same cell, they stack downward.
 */
export const layoutDiagram = (config: DiagramConfig): DiagramConfig => {
  if (config.nodes.length === 0) return config;

  const column = assignColumns(config);
  const inFlow = new Set<string>();
  for (const edge of config.edges) {
    if (edge.style !== EDGE_STYLES.SOLID) continue;
    inFlow.add(edge.from);
    inFlow.add(edge.to);
  }

  // A diagram with no solid edges at all has no spine to hang anything off, so
  // every node is treated as flow and simply laid out in a row.
  const treatAllAsFlow = inFlow.size === 0;

  // A secondary node carries no solid edge, so the layering above left it in
  // column 0 by default — which would drag every cache and CI box to the far
  // left and make its dashed line cross the whole diagram. It belongs under
  // whatever it attaches to, so it takes that node's column.
  if (!treatAllAsFlow) {
    for (const node of config.nodes) {
      if (inFlow.has(node.id)) continue;

      const anchor = config.edges.find(
        (edge) =>
          (edge.from === node.id && inFlow.has(edge.to)) ||
          (edge.to === node.id && inFlow.has(edge.from)),
      );
      if (!anchor) continue;

      const anchorId = anchor.from === node.id ? anchor.to : anchor.from;
      const anchorColumn = column.get(anchorId);
      if (anchorColumn !== undefined) column.set(node.id, anchorColumn);
    }
  }

  /** How many nodes already occupy each column, so collisions stack downward. */
  const depth = new Map<string, number>();

  const placed: DiagramNode[] = config.nodes.map((node) => {
    const col = column.get(node.id) ?? 0;
    const secondary = !treatAllAsFlow && !inFlow.has(node.id);

    // Secondary nodes start one row below the flow, then stack from there.
    const key = `${col}:${secondary ? "secondary" : "flow"}`;
    const stacked = depth.get(key) ?? 0;
    depth.set(key, stacked + 1);

    const row = (secondary ? 1 : 0) + stacked;

    return {
      ...node,
      x: LAYOUT_ORIGIN + col * LAYOUT_COLUMN_GAP,
      y: LAYOUT_ORIGIN + row * NODE_SPACING,
    };
  });

  const right = Math.max(...placed.map((node) => node.x));
  const bottom = Math.max(...placed.map((node) => node.y));

  return {
    ...config,
    nodes: placed,
    canvas: {
      w: clamp(
        right + LAYOUT_ORIGIN,
        DIAGRAM_LIMITS.CANVAS_MIN_WIDTH,
        DIAGRAM_LIMITS.CANVAS_MAX_WIDTH,
      ),
      // The text block hangs below a tile, so the bottom margin has to clear it.
      h: clamp(
        bottom + NODE_TEXT_BLOCK + LAYOUT_ORIGIN,
        DIAGRAM_LIMITS.CANVAS_MIN_HEIGHT,
        DIAGRAM_LIMITS.CANVAS_MAX_HEIGHT,
      ),
    },
  };
};
