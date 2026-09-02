import { DIAGRAM_GEOMETRY, DIAGRAM_TYPOGRAPHY } from "../constants/diagram";
import type { DiagramBoundary, DiagramNode } from "../schemas/diagram";
import { estimateMonoWidth } from "./svg";

/**
 * How much space a drawn thing takes up.
 *
 * Shared rather than private to `frame.ts` because two callers need the same
 * answer: sizing the exported document, and sizing a boundary around what it
 * encloses. Two implementations of "how wide is a node with a long label" would
 * eventually disagree, and the visible result would be a box clipping a word.
 */

export interface Bounds {
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
export const nodeBounds = (node: DiagramNode): Bounds => {
  const half = DIAGRAM_GEOMETRY.TILE_SIZE / 2;
  const reach = nodeReach(node);

  return {
    minX: node.x - reach,
    maxX: node.x + reach,
    minY: node.y - half,
    // The name and sublabel hang below the tile.
    maxY: node.y + half + DIAGRAM_GEOMETRY.NODE_TEXT_BLOCK,
  };
};

/**
 * How far a node extends either side of its centre.
 *
 * Split out from `nodeBounds` because auto-layout needs the same answer for a
 * node it has not placed yet: a wide label is what decides how much room its
 * column has to leave, and asking the question twice in two ways would put a
 * name through its neighbour.
 */
export const nodeReach = (node: { name: string; sub: string }): number => {
  const nameWidth = estimateMonoWidth(node.name, DIAGRAM_TYPOGRAPHY.NAME_SIZE);
  const subWidth = estimateMonoWidth(node.sub, DIAGRAM_TYPOGRAPHY.SUB_SIZE);

  return Math.max(DIAGRAM_GEOMETRY.TILE_SIZE / 2, nameWidth / 2, subWidth / 2);
};

/**
 * What a boundary covers. Its label sits *on* the top border rather than inside,
 * so the box's own top edge is the extent — the label rides along it.
 */
export const boundaryBounds = (boundary: DiagramBoundary): Bounds => ({
  minX: boundary.x,
  maxX: boundary.x + boundary.w,
  minY: boundary.y - DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE,
  maxY: boundary.y + boundary.h,
});

export const union = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});
