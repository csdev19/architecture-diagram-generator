import {
  CANVAS_TONES,
  CANVAS_TONE_INFO,
  DIAGRAM_TYPOGRAPHY,
  ICON_STYLES,
} from "../constants/diagram";
import type { ResolvedDiagram, DiagramNode } from "../schemas/diagram";
import { renderBackground, renderGridPattern } from "./background";
import { renderEdge, renderEdgeMarkers } from "./edge";
import { resolveFrame } from "./frame";
import type { DiagramFrame } from "./frame";
import { renderBoundary } from "./boundary";
import { renderNode } from "./node";
import { num } from "./svg";

export interface RenderOptions {
  /**
   * The rectangle to draw into, overriding the one the config implies.
   *
   * The editor passes the part of the world it is showing, so the drawing fills
   * the window and stays put while a tile is dragged — a frame that tracked the
   * contents would shift the whole picture on every pixel of movement. Export
   * passes nothing and gets the frame the diagram itself defines.
   */
  frame?: DiagramFrame;
  /**
   * Paint the background and the grid. Defaults to true.
   *
   * An editor draws its own, across the whole window rather than the frame, so
   * it turns this off and composites the scene over it.
   */
  background?: boolean;
}

/**
 * Renders a validated `ResolvedDiagram` to a complete SVG document.
 *
 * Pure, deterministic, and free of DOM and Node APIs, so the browser preview
 * and a server-side rasteriser produce byte-identical output. That is the whole
 * point of the function: one renderer means the PNG can never disagree with
 * what the editor showed. `options` changes only the framing — which part of
 * the drawing is in view — never the drawing.
 *
 * Layer order matters — background, then boundaries, then edges, then nodes — so a
 * boundary tint never covers an edge and an edge never crosses over a tile.
 */
export const renderSVG = (config: ResolvedDiagram, options: RenderOptions = {}): string => {
  const frame = options.frame ?? resolveFrame(config);
  const nodeById: ReadonlyMap<string, DiagramNode> = new Map(
    config.nodes.map((node) => [node.id, node]),
  );

  // The paper every layer that punches through it has to match.
  const paper = CANVAS_TONE_INFO[config.background ?? CANVAS_TONES.GREY];

  const defs = `<defs>${renderGridPattern()}${renderEdgeMarkers()}</defs>`;
  const boundaries = config.boundaries.map((boundary) => renderBoundary(boundary, paper)).join("");
  const edges = config.edges.map((edge) => renderEdge(edge, nodeById, paper)).join("");
  // One style for every mark: it is a property of the drawing, not of a tile.
  const iconStyle = config.iconStyle ?? ICON_STYLES.COLOR;
  const nodes = config.nodes.map((node) => renderNode(node, iconStyle)).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(frame.w)}" height="${num(frame.h)}" ` +
    `viewBox="${num(frame.x)} ${num(frame.y)} ${num(frame.w)} ${num(frame.h)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.NAME_FAMILY}">` +
    defs +
    (options.background === false ? "" : renderBackground(frame, paper)) +
    boundaries +
    edges +
    nodes +
    `</svg>`
  );
};

export { escapeXml } from "./svg";
export { DIAGRAM_GUIDELINES, DIAGRAM_SKETCH_PROMPT } from "./guidelines";
export { layoutDiagram } from "./layout";
export { contentFrame, resolveFrame, FRAME_PADDING } from "./frame";
export type { DiagramFrame } from "./frame";
export { boundaryBounds, nodeBounds, union } from "./bounds";
export type { Bounds } from "./bounds";
export { resolveDiagram } from "./resolve";
export { facingSides } from "./anchors";
export type { EdgeAnchors, Point } from "./anchors";
export { renderIconMarkup } from "./icon-markup";
export type { IconPlacement } from "./icon-markup";
