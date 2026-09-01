import {
  ANCHOR_SIDES,
  DIAGRAM_COLORS,
  DIAGRAM_GEOMETRY,
  DIAGRAM_TYPOGRAPHY,
  EDGE_STYLES,
  type AnchorSide,
} from "../constants/diagram";
import type { DiagramEdge, DiagramNode } from "../schemas/diagram";
import { escapeXml, estimateMonoWidth, num } from "./svg";

const MARKER_IDS = {
  [EDGE_STYLES.SOLID]: "arrow-solid",
  [EDGE_STYLES.DASHED]: "arrow-dashed",
} as const;

const STROKES = {
  [EDGE_STYLES.SOLID]: DIAGRAM_COLORS.EDGE_SOLID,
  [EDGE_STYLES.DASHED]: DIAGRAM_COLORS.EDGE_DASHED,
} as const;

const arrowMarker = (id: string, fill: string): string =>
  `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
  `<path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/>` +
  `</marker>`;

/** Both arrowheads. Belongs inside `<defs>`; emitted whether or not both are used. */
export const renderEdgeMarkers = (): string =>
  arrowMarker(MARKER_IDS.solid, DIAGRAM_COLORS.EDGE_SOLID) +
  arrowMarker(MARKER_IDS.dashed, DIAGRAM_COLORS.EDGE_DASHED);

/**
 * Where an edge meets a tile.
 *
 * Sides sit one `ANCHOR_OFFSET` clear of the tile, except the bottom: the
 * node's name and sublabel live directly under the tile, so a bottom anchor
 * drops past them too.
 */
const anchorPoint = (node: DiagramNode, side: AnchorSide): { x: number; y: number } => {
  const half = DIAGRAM_GEOMETRY.TILE_SIZE / 2;
  const gap = half + DIAGRAM_GEOMETRY.ANCHOR_OFFSET;

  switch (side) {
    case ANCHOR_SIDES.LEFT:
      return { x: node.x - gap, y: node.y };
    case ANCHOR_SIDES.RIGHT:
      return { x: node.x + gap, y: node.y };
    case ANCHOR_SIDES.TOP:
      return { x: node.x, y: node.y - gap };
    case ANCHOR_SIDES.BOTTOM:
      return { x: node.x, y: node.y + gap + DIAGRAM_GEOMETRY.BOTTOM_ANCHOR_OFFSET };
  }
};

/**
 * One edge: a straight line between two tile anchors, with an arrowhead and an
 * optional label. Straight lines plus a deliberate layout cover the cases that
 * matter; orthogonal routing around obstacles is explicitly out of scope.
 */
export const renderEdge = (
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>,
): string => {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);

  // The schema guarantees both endpoints resolve; this keeps the renderer
  // total for anyone who reaches it without validating first.
  if (!from || !to) return "";

  const start = anchorPoint(from, edge.out);
  const end = anchorPoint(to, edge.inn);
  const stroke = STROKES[edge.style];

  const line =
    `<line x1="${num(start.x)}" y1="${num(start.y)}" x2="${num(end.x)}" y2="${num(end.y)}" ` +
    `stroke="${stroke}" stroke-width="1.6" ` +
    (edge.style === EDGE_STYLES.DASHED ? `stroke-dasharray="5 4" ` : "") +
    `marker-end="url(#${MARKER_IDS[edge.style]})"/>`;

  if (!edge.label) return line;

  const isVertical = Math.abs(end.x - start.x) < Math.abs(end.y - start.y);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // A vertical run has no room for a centred label, so it sits beside the line.
  const labelX = isVertical ? midX + 10 : midX;
  const labelY = isVertical ? midY : midY - 7;
  const anchor = isVertical ? "start" : "middle";

  const width = estimateMonoWidth(edge.label, DIAGRAM_TYPOGRAPHY.EDGE_LABEL_SIZE) + 10;
  const height = DIAGRAM_TYPOGRAPHY.EDGE_LABEL_SIZE + 4;
  const backingX = isVertical ? labelX - 5 : labelX - width / 2;

  // Without this the label collides with the background grid and is unreadable.
  const backing =
    `<rect x="${num(backingX)}" y="${num(labelY - height + 3)}" ` +
    `width="${num(width)}" height="${num(height)}" fill="${DIAGRAM_COLORS.CANVAS_BG}"/>`;

  const text =
    `<text x="${num(labelX)}" y="${num(labelY)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.MONO_FAMILY}" font-size="${DIAGRAM_TYPOGRAPHY.EDGE_LABEL_SIZE}" ` +
    `text-anchor="${anchor}" fill="${DIAGRAM_COLORS.EDGE_LABEL}">${escapeXml(edge.label)}</text>`;

  return line + backing + text;
};
