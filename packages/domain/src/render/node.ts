import {
  DIAGRAM_COLORS,
  DIAGRAM_GEOMETRY,
  DIAGRAM_TYPOGRAPHY,
  TILE_VARIANTS,
} from "../constants/diagram";
import {
  DIAGRAM_ICONS,
  resolveDiagramIconFill,
  resolveMonogramFill,
} from "../constants/diagram-icons";
import type { DiagramNode } from "../schemas/diagram";
import { escapeXml, num } from "./svg";

/** Baseline of the name, measured down from the bottom edge of the tile. */
const NAME_BASELINE_OFFSET = 17;
/** Baseline of the sublabel, measured down from the name's baseline. */
const SUB_BASELINE_OFFSET = 14;
/**
 * Baseline of a monogram, as a fraction of its size below the tile's centre.
 *
 * Capitals sit entirely above the baseline, so a glyph centred by its baseline
 * would ride high in the tile. Half a cap height — about 0.36em for the sans
 * stack — puts the letterforms' own middle on the middle of the tile.
 */
const INITIALS_CAP_CENTRE = 0.36;

/**
 * The mark inside a tile.
 *
 * Three kinds, drawn in one order: `iconKey`, then `initials`, then `emoji`.
 * A real logo identifies a technology faster than any glyph, and a monogram
 * names a specific product where an emoji only names a role — so each kind
 * yields to the more specific one above it. Letting them coexist is what lets a
 * config keep a fallback without the renderer drawing two marks on top of each
 * other. The schema guarantees at least one is present.
 */
const renderMark = (node: DiagramNode): string => {
  if (node.iconKey) {
    const { ICON_SIZE, ICON_VIEWBOX } = DIAGRAM_GEOMETRY;
    const icon = DIAGRAM_ICONS[node.iconKey];
    const offset = ICON_SIZE / 2;

    // simple-icons paths are authored at 24x24 from the origin, so the boundary is
    // moved to where the mark's top-left corner belongs and scaled up from there.
    return (
      `<g transform="translate(${num(node.x - offset)} ${num(node.y - offset)}) ` +
      `scale(${num(ICON_SIZE / ICON_VIEWBOX)})">` +
      `<path d="${escapeXml(icon.path)}" fill="${resolveDiagramIconFill(icon, node.tile)}"/>` +
      `</g>`
    );
  }

  if (node.initials) {
    const { INITIALS_SIZE, NAME_FAMILY } = DIAGRAM_TYPOGRAPHY;

    return (
      `<text x="${num(node.x)}" y="${num(node.y + INITIALS_SIZE * INITIALS_CAP_CENTRE)}" ` +
      `font-family="${NAME_FAMILY}" font-size="${INITIALS_SIZE}" font-weight="700" ` +
      `text-anchor="middle" fill="${resolveMonogramFill(node.tile)}">` +
      `${escapeXml(node.initials)}</text>`
    );
  }

  if (!node.emoji) return "";

  // Nudged below the tile's centre so the glyph's optical centre lands on it.
  return (
    `<text x="${num(node.x)}" y="${num(node.y + DIAGRAM_TYPOGRAPHY.EMOJI_SIZE / 3)}" ` +
    `font-size="${DIAGRAM_TYPOGRAPHY.EMOJI_SIZE}" text-anchor="middle">` +
    `${escapeXml(node.emoji)}</text>`
  );
};

/**
 * A node: a rounded tile with a centred mark, its name and sublabel stacked
 * underneath. `x`/`y` is the centre of the tile, not its corner.
 */
export const renderNode = (node: DiagramNode): string => {
  const { TILE_SIZE, TILE_RADIUS } = DIAGRAM_GEOMETRY;
  const half = TILE_SIZE / 2;
  const isDark = node.tile === TILE_VARIANTS.DARK;

  const tile =
    `<rect x="${num(node.x - half)}" y="${num(node.y - half)}" ` +
    `width="${TILE_SIZE}" height="${TILE_SIZE}" rx="${TILE_RADIUS}" ` +
    `fill="${isDark ? DIAGRAM_COLORS.TILE_DARK_FILL : DIAGRAM_COLORS.TILE_LIGHT_FILL}" ` +
    `stroke="${isDark ? DIAGRAM_COLORS.TILE_DARK_BORDER : DIAGRAM_COLORS.TILE_LIGHT_BORDER}"/>`;

  const mark = renderMark(node);

  const nameY = node.y + half + NAME_BASELINE_OFFSET;
  const name =
    `<text x="${num(node.x)}" y="${num(nameY)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.NAME_FAMILY}" font-size="${DIAGRAM_TYPOGRAPHY.NAME_SIZE}" ` +
    `font-weight="700" text-anchor="middle" fill="${DIAGRAM_COLORS.NAME_TEXT}">` +
    `${escapeXml(node.name)}</text>`;

  if (!node.sub) return tile + mark + name;

  const sub =
    `<text x="${num(node.x)}" y="${num(nameY + SUB_BASELINE_OFFSET)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.MONO_FAMILY}" font-size="${DIAGRAM_TYPOGRAPHY.SUB_SIZE}" ` +
    `text-anchor="middle" fill="${DIAGRAM_COLORS.SUB_TEXT}">` +
    `${escapeXml(node.sub)}</text>`;

  return tile + mark + name + sub;
};
