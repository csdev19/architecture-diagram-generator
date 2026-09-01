import {
  DIAGRAM_COLORS,
  DIAGRAM_GEOMETRY,
  DIAGRAM_TYPOGRAPHY,
  GROUP_TONE_INFO,
} from "../constants/diagram";
import type { DiagramGroup } from "../schemas/diagram";
import { escapeXml, num } from "./svg";

/**
 * Approximate width of the label text.
 *
 * There is no text measurement outside a browser, so the backing rect that
 * punches the label through the group's top border is sized from a per-character
 * estimate for the monospace face at its label size, plus letter-spacing. Being
 * a little generous is harmless — the rect is the group's own fill colour.
 */
const LABEL_CHAR_WIDTH = 7.4;
const LABEL_PADDING = 8;
const LABEL_LETTER_SPACING = 0.8;
/** The group's emoji, sized to read as an icon rather than as small text. */
const ICON_SIZE = 13;
const ICON_GAP = 5;

/**
 * A group box: a rounded rect tinted by tone, with its label sitting on the top
 * border rather than inside the box, so the border appears to break around it.
 */
export const renderGroup = (group: DiagramGroup): string => {
  const tone = GROUP_TONE_INFO[group.tone];
  const labelSize = DIAGRAM_TYPOGRAPHY.GROUP_LABEL_SIZE;

  const box =
    `<rect x="${num(group.x)}" y="${num(group.y)}" width="${num(group.w)}" height="${num(group.h)}" ` +
    `rx="${DIAGRAM_GEOMETRY.GROUP_RADIUS}" fill="${group.filled ? tone.fill : "none"}" ` +
    `stroke="${tone.border}" stroke-width="1.5"` +
    (group.dashed ? ` stroke-dasharray="6 4"` : "") +
    `/>`;

  if (!group.label) return box;

  // The icon is drawn separately from the label: an emoji set in the label's
  // 11px monospace face renders as an illegible smudge, so it gets its own,
  // larger element and the text starts after it.
  const iconWidth = group.icon ? ICON_SIZE + ICON_GAP : 0;
  const textWidth = group.label.length * LABEL_CHAR_WIDTH;
  const labelWidth = iconWidth + textWidth + LABEL_PADDING * 2;
  const labelX = group.x + 18;
  const labelHeight = labelSize + 6;
  const baseline = group.y + 4;

  // Covers the border where the label sits. A `filled: false` group sits on the
  // canvas, so its cover has to match the canvas rather than the group's tint.
  const cover =
    `<rect x="${num(labelX)}" y="${num(group.y - labelHeight / 2)}" ` +
    `width="${num(labelWidth)}" height="${num(labelHeight)}" ` +
    `fill="${group.filled ? tone.fill : DIAGRAM_COLORS.CANVAS_BG}"/>`;

  const icon = group.icon
    ? `<text x="${num(labelX + LABEL_PADDING)}" y="${num(baseline + 1)}" ` +
      `font-size="${ICON_SIZE}">${escapeXml(group.icon)}</text>`
    : "";

  const text =
    `<text x="${num(labelX + LABEL_PADDING + iconWidth)}" y="${num(baseline)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.MONO_FAMILY}" font-size="${labelSize}" ` +
    `font-weight="600" letter-spacing="${LABEL_LETTER_SPACING}" fill="${tone.label}">` +
    `${escapeXml(group.label)}</text>`;

  return box + cover + icon + text;
};
