import {
  BOUNDARY_PADDING_SIZE,
  BOUNDARY_PADDINGS,
  DIAGRAM_GEOMETRY,
  DIAGRAM_TYPOGRAPHY,
  EDGE_STYLES,
} from "../constants/diagram";
import type { BoundaryPadding } from "../constants/diagram";
import type { ResolvedDiagram } from "../schemas/diagram";
import type { Point } from "./anchors";
import { nodeReach } from "./bounds";

/**
 * Auto-layout: coordinates derived from topology rather than typed by hand.
 *
 * The rule the guidelines give a model is the rule implemented here — the main
 * request path reads left to right in one row, and everything hanging off it
 * sits in a band below. So this is not a second opinion about layout; it is the
 * same opinion, executed.
 *
 * Two things make it more than the row-and-band rule. **Supplied positions are
 * obstacles**: a node someone has already placed keeps its coordinate exactly,
 * and everything computed steps around it. And **a group is laid out as one
 * block**: its members are placed among themselves and the whole block takes a
 * single slot, so nothing foreign can land between two members and a boundary
 * drawn around them cannot cover something that does not belong to them.
 *
 * Pure and deterministic: the same input gives the same output, with no clock,
 * no randomness and no dependence on object iteration order beyond the array
 * order the author wrote. A cyclic graph still terminates — it just stops being
 * able to layer, and the remainder is placed in declaration order.
 *
 * **Known limitation.** A document that pins some nodes and not others can put
 * a computed node somewhere a person would not have chosen: the pinned ones are
 * taken out of the topology before the rest are laid out, so a chain whose
 * middle is pinned lays its two ends out as if they were unrelated. The editor
 * never reaches that state — it materialises the whole layout on first touch —
 * and a hand-written document is one Arrange away from a clean one.
 */

const { LAYOUT_ORIGIN, LAYOUT_COLUMN_GAP, NODE_SPACING, TILE_SIZE, NODE_TEXT_BLOCK } =
  DIAGRAM_GEOMETRY;

/**
 * Clearance between two blocks whose own size already exceeds the grid step.
 *
 * Deliberately smaller than the slack the grid steps leave around a plain tile,
 * so a diagram of ordinary nodes lays out on exactly the grid the guidelines
 * describe. It only starts to matter once something is bigger than that — a
 * group's block, or a name long enough to need the room.
 */
const BLOCK_CLEARANCE = 36;

/** What auto-layout needs to know about a diagram: content, with no geometry. */
export interface LayoutInput {
  nodes: ReadonlyArray<{ id: string; name: string; sub: string }>;
  edges: ReadonlyArray<{ from: string; to: string; style: string }>;
  groups?: ReadonlyArray<{ id: string; members: readonly string[] }>;
  boundaries?: ReadonlyArray<{ id: string; padding?: BoundaryPadding }>;
}

/**
 * A placed thing, measured from a reference point rather than from a corner.
 *
 * A node's reference is its own centre, which is what a coordinate means in
 * this format — and the reason `above` and `below` differ: the tile is centred
 * on it while the label hangs underneath. A group's reference is the centre of
 * what it holds. Measuring from the reference is what lets a row of tiles and a
 * row of groups be spaced by the same arithmetic.
 */
interface Block {
  left: number;
  right: number;
  above: number;
  below: number;
  /** Every node inside, positioned relative to the reference point. */
  offsets: Map<string, Point>;
}

/** One thing to place at a level: a node, or a whole group treated as one. */
interface Item {
  id: string;
  /** Every node this item contains, for condensing the edges between items. */
  nodeIds: Set<string>;
  block: Block;
}

interface LevelEdge {
  from: string;
  to: string;
  style: string;
}

const nodeBlock = (node: { id: string; name: string; sub: string }): Block => {
  const reach = nodeReach(node);

  return {
    left: reach,
    right: reach,
    above: TILE_SIZE / 2,
    below: TILE_SIZE / 2 + NODE_TEXT_BLOCK,
    offsets: new Map([[node.id, { x: 0, y: 0 }]]),
  };
};

/**
 * Assigns each item a column, following the solid edges only.
 *
 * Solid edges are the primary flow by definition, so they are what a
 * left-to-right reading should follow; dashed edges are side channels and would
 * distort the spine if they counted. Layering is longest-path — an item sits one
 * column right of the furthest-right thing that feeds it — computed with a
 * queue so a cycle cannot recurse forever.
 */
const assignColumns = (items: Item[], edges: LevelEdge[]): Map<string, number> => {
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>(items.map((item) => [item.id, 0]));

  for (const edge of edges) {
    successors.set(edge.from, [...(successors.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const column = new Map<string, number>();
  // Seeded in declaration order so the output does not depend on Map ordering.
  const queue = items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
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
  // it. Those items go one column past everything that could be layered, in
  // declaration order, which is arbitrary but stable and never overlaps.
  const placed = [...column.values()];
  let next = placed.length > 0 ? Math.max(...placed) + 1 : 0;

  for (const item of items) {
    if (column.has(item.id)) continue;
    column.set(item.id, next);
    next += 1;
  }

  return column;
};

/** The widest reach on one side of every column, or of every row. */
const extentsBy = (
  cells: Array<{ item: Item; col: number; row: number }>,
  axis: "col" | "row",
  side: keyof Pick<Block, "left" | "right" | "above" | "below">,
): Map<number, number> => {
  const extents = new Map<number, number>();

  for (const cell of cells) {
    const index = cell[axis];
    extents.set(index, Math.max(extents.get(index) ?? 0, cell.item.block[side]));
  }

  return extents;
};

/**
 * Where each slot's reference sits along one axis.
 *
 * A slot moves further than the grid step only when something in it needs the
 * room — so a diagram of plain tiles keeps the exact spacing the guidelines
 * promise, and a group's block pushes its neighbour out by however much it
 * actually covers.
 */
const centresAlong = (
  before: Map<number, number>,
  after: Map<number, number>,
  step: number,
): Map<number, number> => {
  const indexes = [...before.keys()].sort((a, b) => a - b);
  const positions = new Map<number, number>();

  let cursor = 0;
  let previous: number | undefined;

  for (const index of indexes) {
    if (previous !== undefined) {
      const gaps = index - previous;
      const needed = (after.get(previous) ?? 0) + (before.get(index) ?? 0) + BLOCK_CLEARANCE;
      cursor += Math.max(step * gaps, needed);
    }

    positions.set(index, cursor);
    previous = index;
  }

  return positions;
};

/**
 * Places a list of items among themselves and returns them as one block.
 *
 * Items touched by a solid edge form the flow and take the top row, one column
 * each. Everything else drops into the band below, keeping the column of
 * whatever it attaches to so it reads as hanging off that item. Where several
 * want the same cell, they stack downward.
 */
const placeItems = (items: Item[], edges: LevelEdge[]): Block => {
  const ids = new Set(items.map((item) => item.id));
  const flowEdges = edges.filter(
    (edge) => edge.style === EDGE_STYLES.SOLID && ids.has(edge.from) && ids.has(edge.to),
  );

  const column = assignColumns(items, flowEdges);

  const inFlow = new Set<string>();
  for (const edge of flowEdges) {
    inFlow.add(edge.from);
    inFlow.add(edge.to);
  }

  // A level with no solid edges at all has no spine to hang anything off, so
  // every item is treated as flow and simply laid out in a row.
  const treatAllAsFlow = inFlow.size === 0;

  // A secondary item carries no solid edge, so the layering above left it in
  // column 0 by default — which would drag every cache and CI box to the far
  // left and make its dashed line cross the whole diagram. It belongs under
  // whatever it attaches to, so it takes that item's column.
  if (!treatAllAsFlow) {
    for (const item of items) {
      if (inFlow.has(item.id)) continue;

      const anchor = edges.find(
        (edge) =>
          (edge.from === item.id && inFlow.has(edge.to)) ||
          (edge.to === item.id && inFlow.has(edge.from)),
      );
      if (!anchor) continue;

      const anchorId = anchor.from === item.id ? anchor.to : anchor.from;
      const anchorColumn = column.get(anchorId);
      if (anchorColumn !== undefined) column.set(item.id, anchorColumn);
    }
  }

  /** How many items already occupy each column, so collisions stack downward. */
  const depth = new Map<string, number>();

  const cells = items.map((item, index) => {
    // With no spine to layer against, every item is its own column: the row is
    // the documented shape for a level of unconnected tiles, and the layering
    // above leaves them all in column 0, which would stack them into a tower.
    const col = treatAllAsFlow ? index : (column.get(item.id) ?? 0);
    const secondary = !treatAllAsFlow && !inFlow.has(item.id);

    // Secondary items start one row below the flow, then stack from there.
    const key = `${col}:${secondary ? "secondary" : "flow"}`;
    const stacked = depth.get(key) ?? 0;
    depth.set(key, stacked + 1);

    return { item, col, row: (secondary ? 1 : 0) + stacked };
  });

  const x = centresAlong(
    extentsBy(cells, "col", "left"),
    extentsBy(cells, "col", "right"),
    LAYOUT_COLUMN_GAP,
  );
  const y = centresAlong(
    extentsBy(cells, "row", "above"),
    extentsBy(cells, "row", "below"),
    NODE_SPACING,
  );

  const offsets = new Map<string, Point>();
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let above = Number.POSITIVE_INFINITY;
  let below = Number.NEGATIVE_INFINITY;

  for (const cell of cells) {
    const cx = x.get(cell.col) ?? 0;
    const cy = y.get(cell.row) ?? 0;

    for (const [id, offset] of cell.item.block.offsets) {
      offsets.set(id, { x: cx + offset.x, y: cy + offset.y });
    }

    left = Math.min(left, cx - cell.item.block.left);
    right = Math.max(right, cx + cell.item.block.right);
    above = Math.min(above, cy - cell.item.block.above);
    below = Math.max(below, cy + cell.item.block.below);
  }

  // Re-based on what was placed, so a parent can space this block with the same
  // arithmetic it uses for a single tile.
  //
  // Horizontally that is the centre. Vertically it is the flow row — never the
  // geometric centre, which sits lower than the tiles because a label hangs
  // under each one and a boundary reserves room above. Referencing the centre
  // is what makes a bare tile beside a group land half a label-block low, and
  // the main path visibly kink as it crosses into the box.
  const centreX = (left + right) / 2;
  const centreY = 0;

  for (const [id, offset] of offsets) {
    offsets.set(id, { x: offset.x - centreX, y: offset.y - centreY });
  }

  return {
    left: centreX - left,
    right: right - centreX,
    above: centreY - above,
    below: below - centreY,
    offsets,
  };
};

/**
 * Grows a group's block by the rectangle its boundary is going to be given.
 *
 * The boundary is derived after placement, from where its group siblings ended
 * up — but the room for it has to be reserved during placement. Measuring the
 * members alone leaves the box drawn outside its own slot, and one level of
 * nesting or a `loose` padding is enough to push it across a neighbour.
 */
const withBoundaryRoom = (block: Block, padding: BoundaryPadding): Block => {
  const room = BOUNDARY_PADDING_SIZE[padding];

  return {
    ...block,
    left: block.left + room,
    right: block.right + room,
    above: block.above + room + DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE,
    below: block.below + room,
  };
};

/**
 * Pushes a computed position down until it clears everything already there.
 *
 * Only computed positions move: a supplied one is the author's answer and is
 * never second-guessed. Stepping by `NODE_SPACING` keeps the result on the same
 * rhythm as the rest of the layout rather than nudging a tile just far enough
 * to stop touching.
 */
const avoidingOccupied = (point: Point, placed: ReadonlyMap<string, Point>): Point => {
  const occupied = [...placed.values()];
  const collides = (candidate: Point) =>
    occupied.some(
      (other) =>
        Math.abs(other.x - candidate.x) < NODE_SPACING &&
        Math.abs(other.y - candidate.y) < NODE_SPACING,
    );

  let candidate = point;
  // Bounded by the node limit: each step clears one occupied row, and there are
  // never more rows to clear than there are nodes.
  for (let attempt = 0; attempt < DIAGRAM_GEOMETRY.TILE_SIZE && collides(candidate); attempt += 1) {
    candidate = { x: candidate.x, y: candidate.y + NODE_SPACING };
  }

  return candidate;
};

/**
 * Every node's position: the ones already supplied, and the rest computed.
 *
 * Supplied positions are used verbatim and never re-placed. Everything else is
 * laid out among the elements that are also free, then pushed clear of whatever
 * already occupies the space.
 */
export const layoutNodes = (
  content: LayoutInput,
  pinned: Readonly<Record<string, Point>> = {},
): Map<string, Point> => {
  const placed = new Map<string, Point>();
  for (const node of content.nodes) {
    const point = pinned[node.id];
    if (point) placed.set(node.id, { x: point.x, y: point.y });
  }

  const free = content.nodes.filter((node) => !placed.has(node.id));
  if (free.length === 0) return placed;

  const freeById = new Map(free.map((node) => [node.id, node]));
  const groups = content.groups ?? [];
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  const paddingOf = new Map(
    (content.boundaries ?? []).map(
      (boundary) => [boundary.id, boundary.padding ?? BOUNDARY_PADDINGS.NORMAL] as const,
    ),
  );

  const parent = new Map<string, string>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!parent.has(member)) parent.set(member, group.id);
    }
  }

  /**
   * The edges between items at one level.
   *
   * An edge joins two items when a node inside one connects to a node inside
   * the other; an edge with both ends inside the same item is invisible here,
   * because that item's own placement already accounted for it.
   */
  const condense = (items: Item[]): LevelEdge[] => {
    const owner = new Map<string, string>();
    for (const item of items) for (const nodeId of item.nodeIds) owner.set(nodeId, item.id);

    const seen = new Set<string>();
    const condensed: LevelEdge[] = [];

    for (const edge of content.edges) {
      const from = owner.get(edge.from);
      const to = owner.get(edge.to);
      if (from === undefined || to === undefined || from === to) continue;

      const key = `${from}->${to}:${edge.style}`;
      if (seen.has(key)) continue;
      seen.add(key);

      condensed.push({ from, to, style: edge.style });
    }

    return condensed;
  };

  /**
   * Builds an item, recursing into a group so its members are placed among
   * themselves before the group takes a single slot at this level.
   *
   * A group with nothing free inside it — every member pinned, or a group of
   * boundaries alone — is skipped rather than placed: there is nothing left to
   * position, and an empty block would still claim a column. `guard` stops a
   * cyclic document, which the validator rejects, from recursing forever here.
   */
  const buildItem = (id: string, guard: Set<string>): Item | null => {
    if (guard.has(id)) return null;

    const node = freeById.get(id);
    if (node) return { id, nodeIds: new Set([id]), block: nodeBlock(node) };

    const group = groupsById.get(id);
    if (!group) return null;

    const nested = new Set(guard).add(id);
    const items = group.members
      .map((member) => buildItem(member, nested))
      .filter((item): item is Item => item !== null);

    if (items.length === 0) return null;

    const inner = placeItems(items, condense(items));
    const framed = group.members.find((member) => paddingOf.has(member));
    const padding = framed === undefined ? undefined : paddingOf.get(framed);

    const nodeIds = new Set<string>();
    for (const item of items) for (const nodeId of item.nodeIds) nodeIds.add(nodeId);

    return { id, nodeIds, block: padding ? withBoundaryRoom(inner, padding) : inner };
  };

  // The top level is everything with no group above it, in declaration order:
  // the free nodes as the author wrote them, then the groups they are not in.
  const items = [
    ...free.filter((node) => !parent.has(node.id)).map((node) => node.id),
    ...groups.filter((group) => !parent.has(group.id)).map((group) => group.id),
  ]
    .map((id) => buildItem(id, new Set()))
    .filter((item): item is Item => item !== null);

  // A free node whose group chain never reaches the top level cannot be laid
  // out with its group — the document is cyclic, which the validator rejects —
  // so it is placed on its own rather than dropped.
  for (const node of free) {
    if (items.some((item) => item.nodeIds.has(node.id))) continue;
    items.push({ id: node.id, nodeIds: new Set([node.id]), block: nodeBlock(node) });
  }

  const root = placeItems(items, condense(items));

  // The first tile's centre sits at the layout origin, so a plain diagram lands
  // exactly where the guidelines say it will. Measured from the nodes rather
  // than from the block, whose edges include the room reserved for a boundary.
  const offsets = [...root.offsets.values()];
  const originX = LAYOUT_ORIGIN - Math.min(...offsets.map((offset) => offset.x));
  const originY = LAYOUT_ORIGIN - Math.min(...offsets.map((offset) => offset.y));

  for (const node of content.nodes) {
    const offset = root.offsets.get(node.id);
    if (!offset) continue;

    placed.set(node.id, avoidingOccupied({ x: originX + offset.x, y: originY + offset.y }, placed));
  }

  return placed;
};

/**
 * Re-places every node of a resolved diagram from its topology.
 *
 * What the editor's Arrange runs until the editor speaks the document format:
 * it throws every coordinate away and asks for them all again, which is the
 * same thing as resolving a document whose layout is empty.
 */
export const layoutDiagram = (config: ResolvedDiagram): ResolvedDiagram => {
  if (config.nodes.length === 0) return config;

  const placed = layoutNodes(config);

  return {
    ...config,
    nodes: config.nodes.map((node) => {
      const point = placed.get(node.id);
      return point ? { ...node, x: point.x, y: point.y } : node;
    }),
  };
};
