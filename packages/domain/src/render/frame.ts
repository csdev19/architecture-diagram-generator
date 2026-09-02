import { DIAGRAM_GEOMETRY, DIAGRAM_TYPOGRAPHY } from "../constants/diagram";
import type { DiagramConfig, DiagramGroup, DiagramNode } from "../schemas/diagram";
import { estimateMonoWidth } from "./svg";

/**
 * The rectangle a diagram is drawn into.
 *
 * An SVG document has finite bounds, and so does the PNG rasterised from it, so
 * something has to decide them. This module decides them from the drawing
 * itself rather than from a number the author had to pick in advance.
 *
 * That is the whole point: a declared canvas is a wall you can push a node
 * against, and an editor then has to explain the wall — a grey table, a white
 * sheet, a margin rule, a "grow the canvas" error. Deriving the frame deletes
 * all of it. Coordinates become free, negatives included, and a diagram is
 * exactly as big as what is on it.
 *
 * `config.canvas` survives as an optional override for a config that wants a
 * fixed frame — a slide of an exact size, or a file written before this
 * existed. Absent, which is the default the editor writes, the frame is
 * computed here.
 */

export interface DiagramFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whitespace left around the drawing, on every side. */
export const FRAME_PADDING = 60;

/**
 * The frame a config with nothing in it gets.
 *
 * The schema requires at least one node, so this is unreachable through
 * `validateDiagramConfig` — it exists so the function is total rather than
 * returning something meaningless like a zero-sized document.
 */
const EMPTY_FRAME: DiagramFrame = { x: 0, y: 0, w: 400, h: 300 };

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * What a node covers.
 *
 * Wider than its tile whenever the name is: the label is centred under the tile
 * and a 26-character name runs well past 62px. Estimated rather than measured —
 * there is no text measurement outside a browser — and deliberately generous,
 * because overshooting costs whitespace while undershooting clips a word.
 */
const nodeBounds = (node: DiagramNode): Bounds => {
  const half = DIAGRAM_GEOMETRY.TILE_SIZE / 2;

  const nameWidth = estimateMonoWidth(node.name, DIAGRAM_TYPOGRAPHY.NAME_SIZE);
  const subWidth = estimateMonoWidth(node.sub, DIAGRAM_TYPOGRAPHY.SUB_SIZE);
  const reach = Math.max(half, nameWidth / 2, subWidth / 2);

  return {
    minX: node.x - reach,
    maxX: node.x + reach,
    minY: node.y - half,
    // The name and sublabel hang below the tile.
    maxY: node.y + half + DIAGRAM_GEOMETRY.NODE_TEXT_BLOCK,
  };
};

/**
 * What a group covers. Its label sits *on* the top border rather than inside,
 * so the box's own top edge is the extent — the label rides along it.
 */
const groupBounds = (group: DiagramGroup): Bounds => ({
  minX: group.x,
  maxX: group.x + group.w,
  minY: group.y - DIAGRAM_TYPOGRAPHY.GROUP_LABEL_SIZE,
  maxY: group.y + group.h,
});

const union = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/**
 * The frame that holds everything the config draws, plus `FRAME_PADDING`.
 *
 * Rounded outward to whole pixels so the same config always produces the same
 * document: `renderSVG` has to be byte-stable for snapshots to mean anything
 * and for a render cache to be able to key on content.
 */
export const contentFrame = (config: DiagramConfig): DiagramFrame => {
  const all = [...config.nodes.map(nodeBounds), ...config.groups.map(groupBounds)];
  const first = all[0];
  if (!first) return EMPTY_FRAME;

  const bounds = all.reduce(union, first);

  const x = Math.floor(bounds.minX - FRAME_PADDING);
  const y = Math.floor(bounds.minY - FRAME_PADDING);

  return {
    x,
    y,
    w: Math.ceil(bounds.maxX + FRAME_PADDING) - x,
    h: Math.ceil(bounds.maxY + FRAME_PADDING) - y,
  };
};

/**
 * The frame to draw a config in: the author's fixed one if they declared it,
 * otherwise the one its own contents imply.
 */
export const resolveFrame = (config: DiagramConfig): DiagramFrame =>
  config.canvas ? { x: 0, y: 0, w: config.canvas.w, h: config.canvas.h } : contentFrame(config);
