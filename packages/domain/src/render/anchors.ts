import { ANCHOR_SIDES } from "../constants/diagram";
import type { AnchorSide } from "../constants/diagram";

/**
 * Which sides an edge should leave from and arrive at.
 *
 * Domain rather than editor code: resolution has to answer this for every edge
 * whose anchors the author left out, and it runs on the server as readily as in
 * the browser. The editor calls the same function when a two-click gesture
 * makes an edge, so a drawn edge and a derived one are anchored alike.
 */

export interface Point {
  x: number;
  y: number;
}

export interface EdgeAnchors {
  out: AnchorSide;
  inn: AnchorSide;
}

/**
 * The anchor pair that faces the other node.
 *
 * Horizontal anchors win ties and near-ties: a bottom anchor has to drop past
 * the node's text block before it can turn, so it draws a noticeably longer
 * line. The author can change either side afterwards.
 */
export const facingSides = (source: Point, target: Point): EdgeAnchors => {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { out: ANCHOR_SIDES.RIGHT, inn: ANCHOR_SIDES.LEFT }
      : { out: ANCHOR_SIDES.LEFT, inn: ANCHOR_SIDES.RIGHT };
  }

  return dy >= 0
    ? { out: ANCHOR_SIDES.BOTTOM, inn: ANCHOR_SIDES.TOP }
    : { out: ANCHOR_SIDES.TOP, inn: ANCHOR_SIDES.BOTTOM };
};
