import { DIAGRAM_COLORS, DIAGRAM_GEOMETRY } from "../constants/diagram";
import { num } from "./svg";

/** Id of the grid pattern, referenced by the background rect. */
const GRID_PATTERN_ID = "diagram-grid";

/** The `<pattern>` that paints the background grid. Belongs inside `<defs>`. */
export const renderGridPattern = (): string => {
  const cell = DIAGRAM_GEOMETRY.GRID_CELL;

  return (
    `<pattern id="${GRID_PATTERN_ID}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="${DIAGRAM_COLORS.GRID_LINE}" stroke-width="1"/>` +
    `</pattern>`
  );
};

/** The base colour and the grid on top of it — the bottom two layers. */
export const renderBackground = (width: number, height: number): string =>
  `<rect width="${num(width)}" height="${num(height)}" fill="${DIAGRAM_COLORS.CANVAS_BG}"/>` +
  `<rect width="${num(width)}" height="${num(height)}" fill="url(#${GRID_PATTERN_ID})"/>`;
