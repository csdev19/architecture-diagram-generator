import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";
import type { ResolvedDiagram, DiagramBoundary, DiagramNode } from "@diagram-tool/domain/schemas";

/**
 * Turning a pointer into a node.
 *
 * Hit-testing reads the config's own coordinates rather than measuring the DOM.
 * The renderer already decided where every tile is; asking the browser where it
 * ended up would introduce a second source of truth that could disagree with
 * the first — and it would stop working the moment the SVG is scaled to fit.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * The node whose tile covers `point`, or `undefined`.
 *
 * Searched back to front because the renderer draws nodes in array order, so
 * the last one painted is the one visually on top of any overlap.
 */
export const hitTestNode = (config: ResolvedDiagram, point: Point): DiagramNode | undefined => {
  const half = DIAGRAM_GEOMETRY.TILE_SIZE / 2;

  for (let index = config.nodes.length - 1; index >= 0; index -= 1) {
    const node = config.nodes[index];
    if (!node) continue;
    if (Math.abs(point.x - node.x) <= half && Math.abs(point.y - node.y) <= half) return node;
  }

  return undefined;
};

/**
 * The boundary whose box covers `point`, or `undefined`.
 *
 * Searched back to front, like nodes: the renderer draws boundaries in array order,
 * so the last one painted is the one visually on top of any overlap. A nested
 * boundary is therefore hit before the one containing it, as long as it was
 * declared after — which is what `filled: false` nesting already requires.
 *
 * The whole box is a target, not just its border. These boxes are tinted, so
 * they read as surfaces; clicking one and getting nothing would be the surprise.
 */
export const hitTestBoundary = (
  config: ResolvedDiagram,
  point: Point,
): DiagramBoundary | undefined => {
  for (let index = config.boundaries.length - 1; index >= 0; index -= 1) {
    const boundary = config.boundaries[index];
    if (!boundary) continue;

    const inside =
      point.x >= boundary.x &&
      point.x <= boundary.x + boundary.w &&
      point.y >= boundary.y &&
      point.y <= boundary.y + boundary.h;
    if (inside) return boundary;
  }

  return undefined;
};

/**
 * Converts client (viewport) coordinates into the SVG's own coordinate system.
 *
 * The screen CTM of an inline SVG is a scale plus a translation — no rotation
 * or skew — so the inverse is solved directly instead of going through
 * `DOMPoint.matrixTransform`. That keeps the maths visible, and it works under
 * jsdom, which implements neither `DOMPoint` nor `DOMMatrix`.
 */
export const clientToViewBox = (
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point | undefined => {
  const ctm = svg.getScreenCTM?.();
  // A zero scale means the element is not laid out; there is nothing to map to.
  if (!ctm || ctm.a === 0 || ctm.d === 0) return undefined;

  return { x: (clientX - ctm.e) / ctm.a, y: (clientY - ctm.f) / ctm.d };
};
