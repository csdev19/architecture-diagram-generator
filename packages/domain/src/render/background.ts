import { DIAGRAM_COLORS, DIAGRAM_GEOMETRY } from "../constants/diagram";
import type { DiagramFrame } from "./frame";
import { num } from "./svg";

/** Id of the grid pattern, referenced by the background rect. */
const GRID_PATTERN_ID = "diagram-grid";

/**
 * The `<pattern>` that paints the background grid. Belongs inside `<defs>`.
 *
 * `userSpaceOnUse` anchors the tiling at the diagram's origin rather than at
 * the frame's corner, so the grid stays put when the frame moves — which it
 * does on every edit, now that the frame follows the drawing.
 */
/** Dash and gap of a grid line, in diagram pixels. */
const GRID_DASH = "2 3";

export const renderGridPattern = (): string => {
  const cell = DIAGRAM_GEOMETRY.GRID_CELL;

  return (
    `<pattern id="${GRID_PATTERN_ID}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="${DIAGRAM_COLORS.GRID_LINE}" ` +
    `stroke-width="1" stroke-dasharray="${GRID_DASH}"/>` +
    `</pattern>`
  );
};

/**
 * The paper and the grid on top of it — the bottom two layers.
 *
 * `paper` is passed rather than read from a constant because the author picks
 * it, and two other places have to match it exactly: an unfilled boundary's label
 * cover and an edge label's backing rect both punch a hole in whatever is
 * behind them.
 */
export const renderBackground = (frame: DiagramFrame, paper: string): string => {
  const box = `x="${num(frame.x)}" y="${num(frame.y)}" width="${num(frame.w)}" height="${num(frame.h)}"`;

  return `<rect ${box} fill="${paper}"/><rect ${box} fill="url(#${GRID_PATTERN_ID})"/>`;
};
