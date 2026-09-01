import { DIAGRAM_TYPOGRAPHY } from "../constants/diagram";
import type { DiagramConfig, DiagramNode } from "../schemas/diagram";
import { renderBackground, renderGridPattern } from "./background";
import { renderEdge, renderEdgeMarkers } from "./edge";
import { renderGroup } from "./group";
import { renderNode } from "./node";
import { num } from "./svg";

/**
 * Renders a validated `DiagramConfig` to a complete SVG document.
 *
 * Pure, deterministic, and free of DOM and Node APIs, so the browser preview
 * and a server-side rasteriser produce byte-identical output. That is the whole
 * point of the function: one renderer means the PNG can never disagree with
 * what the editor showed.
 *
 * Layer order matters — background, then groups, then edges, then nodes — so a
 * group tint never covers an edge and an edge never crosses over a tile.
 */
export const renderSVG = (config: DiagramConfig): string => {
  const { w, h } = config.canvas;
  const nodeById: ReadonlyMap<string, DiagramNode> = new Map(
    config.nodes.map((node) => [node.id, node]),
  );

  const defs = `<defs>${renderGridPattern()}${renderEdgeMarkers()}</defs>`;
  const groups = config.groups.map(renderGroup).join("");
  const edges = config.edges.map((edge) => renderEdge(edge, nodeById)).join("");
  const nodes = config.nodes.map(renderNode).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" ` +
    `viewBox="0 0 ${num(w)} ${num(h)}" font-family="${DIAGRAM_TYPOGRAPHY.NAME_FAMILY}">` +
    defs +
    renderBackground(w, h) +
    groups +
    edges +
    nodes +
    `</svg>`
  );
};

export { escapeXml } from "./svg";
export { DIAGRAM_GUIDELINES } from "./guidelines";
