import {
  DIAGRAM_COLORS,
  DIAGRAM_GEOMETRY,
  DIAGRAM_TYPOGRAPHY,
  TILE_VARIANTS,
} from "../constants/diagram";
import type { DiagramNode } from "../schemas/diagram";
import { escapeXml, num } from "./svg";

/** Baseline of the name, measured down from the bottom edge of the tile. */
const NAME_BASELINE_OFFSET = 17;
/** Baseline of the sublabel, measured down from the name's baseline. */
const SUB_BASELINE_OFFSET = 14;

/**
 * A node: a rounded tile with a centred emoji, its name and sublabel stacked
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

  // Nudged below the tile's centre so the glyph's optical centre lands on it.
  const emoji =
    `<text x="${num(node.x)}" y="${num(node.y + DIAGRAM_TYPOGRAPHY.EMOJI_SIZE / 3)}" ` +
    `font-size="${DIAGRAM_TYPOGRAPHY.EMOJI_SIZE}" text-anchor="middle">` +
    `${escapeXml(node.emoji)}</text>`;

  const nameY = node.y + half + NAME_BASELINE_OFFSET;
  const name =
    `<text x="${num(node.x)}" y="${num(nameY)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.NAME_FAMILY}" font-size="${DIAGRAM_TYPOGRAPHY.NAME_SIZE}" ` +
    `font-weight="700" text-anchor="middle" fill="${DIAGRAM_COLORS.NAME_TEXT}">` +
    `${escapeXml(node.name)}</text>`;

  if (!node.sub) return tile + emoji + name;

  const sub =
    `<text x="${num(node.x)}" y="${num(nameY + SUB_BASELINE_OFFSET)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.MONO_FAMILY}" font-size="${DIAGRAM_TYPOGRAPHY.SUB_SIZE}" ` +
    `text-anchor="middle" fill="${DIAGRAM_COLORS.SUB_TEXT}">` +
    `${escapeXml(node.sub)}</text>`;

  return tile + emoji + name + sub;
};
