import { DIAGRAM_GEOMETRY, ICON_STYLES, TILE_VARIANTS } from "../constants/diagram";
import type { IconStyle, TileVariant } from "../constants/diagram";
import { resolveDiagramIconFill, resolveMonogramFill } from "../constants/diagram-icons";
import type { DiagramIcon } from "../constants/diagram-icons";
import { escapeXml, num } from "./svg";

/** Where a mark goes: its top-left corner and its side, in the parent's units. */
export interface IconPlacement {
  x: number;
  y: number;
  size: number;
}

/**
 * The one place a brand mark is drawn.
 *
 * Returns a nested `<svg>` rather than a transformed `<g>`: colour art comes in
 * whatever viewBox the brand authored it in, square or not, and a nested svg
 * fits any of them into the tile by relying on SVG's default fitting behaviour
 * (`xMidYMid meet`, applied when no `preserveAspectRatio` is given) where a
 * computed scale would fit only the square ones. The mono mark goes through
 * the same element so that the renderer and the palette cannot drift apart.
 *
 * Which of the two is drawn is the whole of the style decision, in one table:
 *
 * - `mono`: the silhouette, in the tile's opposite colour. Never the brand hex,
 *   never the art. The author asked for a monochrome diagram.
 * - `color`, light tile: the art if there is any, else the silhouette in its
 *   brand colour when that reads on paper, else near-black.
 * - `color`, dark tile: the art if it was judged to read there, else the
 *   silhouette in white.
 */
export const renderIconMarkup = (
  icon: DiagramIcon,
  tile: TileVariant,
  style: IconStyle,
  place: IconPlacement,
): string => {
  const open =
    `<svg x="${num(place.x)}" y="${num(place.y)}" ` +
    `width="${num(place.size)}" height="${num(place.size)}" `;

  const art = style === ICON_STYLES.COLOR ? icon.art : undefined;
  if (art && (tile === TILE_VARIANTS.LIGHT || art.onDark)) {
    // The body is trusted registry markup, not text: it is inlined verbatim.
    return `${open}viewBox="${escapeXml(art.viewBox)}">${art.body}</svg>`;
  }

  const { ICON_VIEWBOX } = DIAGRAM_GEOMETRY;
  const fill =
    style === ICON_STYLES.MONO ? resolveMonogramFill(tile) : resolveDiagramIconFill(icon, tile);
  return (
    `${open}viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}">` +
    `<path d="${escapeXml(icon.mono.path)}" fill="${fill}"/></svg>`
  );
};
