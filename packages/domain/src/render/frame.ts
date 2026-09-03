import type { ResolvedDiagram } from "../schemas/diagram";
import { boundaryBounds, nodeBounds, union } from "./bounds";

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
 * `validateResolvedDiagram` — it exists so the function is total rather than
 * returning something meaningless like a zero-sized document.
 */
const EMPTY_FRAME: DiagramFrame = { x: 0, y: 0, w: 400, h: 300 };

/**
 * The frame that holds everything the config draws, plus `FRAME_PADDING`.
 *
 * Rounded outward to whole pixels so the same config always produces the same
 * document: `renderSVG` has to be byte-stable for snapshots to mean anything
 * and for a render cache to be able to key on content.
 */
export const contentFrame = (config: ResolvedDiagram): DiagramFrame => {
  const all = [...config.nodes.map(nodeBounds), ...config.boundaries.map(boundaryBounds)];
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
export const resolveFrame = (config: ResolvedDiagram): DiagramFrame =>
  config.canvas ? { x: 0, y: 0, w: config.canvas.w, h: config.canvas.h } : contentFrame(config);
