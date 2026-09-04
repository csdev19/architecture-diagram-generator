import { DIAGRAM_GEOMETRY, DIAGRAM_TYPOGRAPHY, BOUNDARY_TONE_INFO } from "../constants/diagram";
import type { DiagramBoundary } from "../schemas/diagram";
import { escapeXml, num } from "./svg";

/**
 * Approximate width of the label text.
 *
 * There is no text measurement outside a browser, so the backing rect that
 * punches the label through the boundary's top border is sized from a per-character
 * estimate for the monospace face at its label size, plus letter-spacing. Being
 * a little generous is harmless — the rect is the boundary's own fill colour.
 */
const LABEL_CHAR_WIDTH = 7.4;
const LABEL_PADDING = 8;
const LABEL_LETTER_SPACING = 0.8;
/** The boundary's emoji, sized to read as an icon rather than as small text. */
const ICON_SIZE = 13;
const ICON_GAP = 5;

/** Distance from the box's left edge to the start of the label's backing rect. */
export const LABEL_INSET = 18;

/**
 * How much horizontal room a boundary's label occupies, backing rect included.
 *
 * Exported because layout needs the same number: a grouped boundary is sized by
 * what it holds, which says nothing about how long its name is, so `resolve`
 * widens the box to carry the label. Two estimates of that width would be two
 * answers to whether the label fits, one of them wrong.
 */
export const boundaryLabelWidth = (label: string, icon: string): number => {
  if (!label) return 0;

  const iconWidth = icon ? ICON_SIZE + ICON_GAP : 0;
  return iconWidth + label.length * LABEL_CHAR_WIDTH + LABEL_PADDING * 2;
};

/**
 * A boundary box: a rounded rect tinted by tone, with its label sitting on the top
 * border rather than inside the box, so the border appears to break around it.
 */
export const renderBoundary = (boundary: DiagramBoundary, paper: string): string => {
  const tone = BOUNDARY_TONE_INFO[boundary.tone];
  const labelSize = DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE;

  const box =
    `<rect x="${num(boundary.x)}" y="${num(boundary.y)}" width="${num(boundary.w)}" height="${num(boundary.h)}" ` +
    `rx="${DIAGRAM_GEOMETRY.BOUNDARY_RADIUS}" fill="${boundary.filled ? tone.fill : "none"}" ` +
    `stroke="${tone.border}" stroke-width="1.5"` +
    (boundary.dashed ? ` stroke-dasharray="6 4"` : "") +
    `/>`;

  if (!boundary.label) return box;

  // The icon is drawn separately from the label: an emoji set in the label's
  // 11px monospace face renders as an illegible smudge, so it gets its own,
  // larger element and the text starts after it.
  const iconWidth = boundary.icon ? ICON_SIZE + ICON_GAP : 0;
  const labelWidth = boundaryLabelWidth(boundary.label, boundary.icon);
  const labelX = boundary.x + LABEL_INSET;
  const labelHeight = labelSize + 6;
  const baseline = boundary.y + 4;

  // Covers the border where the label sits. A `filled: false` boundary sits on the
  // paper, so its cover has to match the paper rather than the boundary's tint.
  const cover =
    `<rect x="${num(labelX)}" y="${num(boundary.y - labelHeight / 2)}" ` +
    `width="${num(labelWidth)}" height="${num(labelHeight)}" ` +
    `fill="${boundary.filled ? tone.fill : paper}"/>`;

  const icon = boundary.icon
    ? `<text x="${num(labelX + LABEL_PADDING)}" y="${num(baseline + 1)}" ` +
      `font-size="${ICON_SIZE}">${escapeXml(boundary.icon)}</text>`
    : "";

  const text =
    `<text x="${num(labelX + LABEL_PADDING + iconWidth)}" y="${num(baseline)}" ` +
    `font-family="${DIAGRAM_TYPOGRAPHY.MONO_FAMILY}" font-size="${labelSize}" ` +
    `font-weight="600" letter-spacing="${LABEL_LETTER_SPACING}" fill="${tone.label}">` +
    `${escapeXml(boundary.label)}</text>`;

  return box + cover + icon + text;
};
