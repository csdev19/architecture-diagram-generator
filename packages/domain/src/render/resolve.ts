import { BOUNDARY_PADDING_SIZE, DIAGRAM_TYPOGRAPHY } from "../constants/diagram";
import type { DiagramDocument } from "../schemas/diagram-document";
import type { DiagramBoundary, DiagramNode, ResolvedDiagram } from "../schemas/diagram";
import { facingSides } from "./anchors";
import type { Point } from "./anchors";
import { boundaryBounds, nodeBounds, union } from "./bounds";
import type { Bounds } from "./bounds";
import { layoutNodes } from "./layout";

/**
 * Composes a document's content and layout into the renderer's input.
 *
 * The only place in the system that invents geometry. Everything the author or
 * the model left out is decided here — positions from auto-layout, a grouped
 * boundary's rectangle from what its group holds, an edge's anchors from where
 * its endpoints ended up — and `renderSVG` receives a diagram in which every
 * coordinate is already settled. That is what lets the renderer stay ignorant
 * of whether a position came from a model, from a drag or from this function.
 *
 * Pure, deterministic, and **total over any document that validates**: it never
 * throws and never reports a problem. Reporting is `validateDiagramDocument`'s
 * job, and the invariants it enforces — one boundary per group, at least one
 * node per group, no stale layout key — are exactly the ones that leave this
 * function with an answer for every case.
 */

/** The default an ungrouped boundary falls back to if its rectangle is missing. */
const PLACEHOLDER_RECT = { x: 0, y: 0, w: 200, h: 140 };

export const resolveDiagram = (document: DiagramDocument): ResolvedDiagram => {
  const { content, layout } = document;

  const positions = layoutNodes(content, layout.nodes);

  const nodes: DiagramNode[] = content.nodes.map((node) => {
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    return { ...node, x: point.x, y: point.y };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groupById = new Map(content.groups.map((group) => [group.id, group]));
  const boundaryById = new Map(content.boundaries.map((boundary) => [boundary.id, boundary]));

  /** The group each element sits in directly, which decides how it is sized. */
  const parent = new Map<string, string>();
  for (const group of content.groups) {
    for (const member of group.members) {
      if (!parent.has(member)) parent.set(member, group.id);
    }
  }

  const rects = new Map<string, DiagramBoundary>();

  /**
   * What an element covers, whatever kind it is.
   *
   * A node covers its tile and the label under it; a boundary covers the
   * rectangle it has just been given; a group covers everything inside it,
   * recursively. `seen` keeps a cyclic document — which the validator rejects,
   * but which this function must survive — from recursing forever.
   */
  const extentOf = (id: string, seen: Set<string>): Bounds | null => {
    if (seen.has(id)) return null;
    const guard = new Set(seen).add(id);

    const node = nodeById.get(id);
    if (node) return nodeBounds(node);

    const boundary = boundaryById.get(id);
    if (boundary) {
      const rect = resolveBoundary(id, guard);
      return rect ? boundaryBounds(rect) : null;
    }

    const group = groupById.get(id);
    if (!group) return null;

    let bounds: Bounds | null = null;
    for (const member of group.members) {
      const memberBounds = extentOf(member, guard);
      if (!memberBounds) continue;
      bounds = bounds ? union(bounds, memberBounds) : memberBounds;
    }

    return bounds;
  };

  /**
   * A boundary's rectangle: derived from its group siblings, or the one it was
   * given when it belongs to no group.
   *
   * Being grouped is what decides the direction: a grouped boundary is sized by
   * what it frames and has no rectangle of its own to contradict, while an
   * ungrouped one is a box someone placed and is drawn where they put it.
   */
  const resolveBoundary = (id: string, seen: Set<string>): DiagramBoundary | undefined => {
    const cached = rects.get(id);
    if (cached) return cached;

    const boundary = boundaryById.get(id);
    if (!boundary) return undefined;

    const { padding, ...drawn } = boundary;
    const groupId = parent.get(id);
    const group = groupId === undefined ? undefined : groupById.get(groupId);

    if (!group) {
      const rect = layout.boundaries[id] ?? PLACEHOLDER_RECT;
      const resolved = { ...drawn, ...rect };
      rects.set(id, resolved);
      return resolved;
    }

    let bounds: Bounds | null = null;
    for (const sibling of group.members) {
      if (sibling === id) continue;

      const siblingBounds = extentOf(sibling, seen);
      if (!siblingBounds) continue;
      bounds = bounds ? union(bounds, siblingBounds) : siblingBounds;
    }

    // A group with nothing else in it does not validate, so this is the shape
    // of a document nobody can save — drawn as a placeholder rather than as a
    // rectangle of nonsense.
    if (!bounds) {
      const resolved = { ...drawn, ...PLACEHOLDER_RECT };
      rects.set(id, resolved);
      return resolved;
    }

    const room = BOUNDARY_PADDING_SIZE[padding];
    // The label rides the top border, so the box starts below where it would
    // otherwise sit — the same allowance `boundaryBounds` reads back out.
    const top = bounds.minY - room + DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE;

    const resolved = {
      ...drawn,
      x: Math.round(bounds.minX - room),
      y: Math.round(top),
      w: Math.round(bounds.maxX + room) - Math.round(bounds.minX - room),
      h: Math.round(bounds.maxY + room) - Math.round(top),
    };

    rects.set(id, resolved);
    return resolved;
  };

  /** How deep a boundary is nested, so an outer box is painted under an inner one. */
  const depthOf = (id: string): number => {
    const seen = new Set<string>([id]);
    let depth = 0;
    let current = parent.get(id);

    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      depth += 1;
      current = parent.get(current);
    }

    return depth;
  };

  const boundaries = content.boundaries
    .map((boundary, index) => ({
      index,
      depth: depthOf(boundary.id),
      resolved: resolveBoundary(boundary.id, new Set()),
    }))
    .filter(
      (entry): entry is { index: number; depth: number; resolved: DiagramBoundary } =>
        entry.resolved !== undefined,
    )
    // Outermost first: the renderer paints in array order, so a box nested
    // inside another has to come later to sit on top of it — which is also what
    // makes the editor's back-to-front hit-testing select the innermost one.
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map((entry) => entry.resolved);

  const edges = content.edges.map((edge) => {
    const anchors =
      layout.edges[edge.id] ??
      facingSides(pointOf(nodeById, edge.from), pointOf(nodeById, edge.to));
    return { ...edge, ...anchors };
  });

  return {
    title: content.title,
    ...(content.background ? { background: content.background } : {}),
    ...(layout.canvas ? { canvas: layout.canvas } : {}),
    nodes,
    boundaries,
    edges,
  };
};

/** Where a node ended up, or the origin for an edge naming one that is gone. */
const pointOf = (nodes: ReadonlyMap<string, DiagramNode>, id: string): Point =>
  nodes.get(id) ?? { x: 0, y: 0 };
