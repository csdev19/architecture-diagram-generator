/**
 * Small helpers shared by the render layers.
 *
 * The renderer builds SVG as a string so it runs identically in a browser and
 * in a Cloudflare Worker, with no DOM. That makes escaping this module's most
 * important job: any unescaped `&` or `<` from a config produces a document
 * that fails to parse, usually silently.
 */

/** Escapes text before it is interpolated into SVG markup. */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Formats a coordinate. Rounds to two decimals so floating-point drift cannot
 * change the output for equal inputs — `renderSVG` must be byte-stable to keep
 * snapshots meaningful and, later, to let the render cache key on content.
 */
export const num = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/**
 * Approximate rendered width of a monospace string.
 *
 * There is no text measurement outside a browser, so anything that needs to
 * size a box around text — a label's backing rect — estimates it from the
 * advance width of the monospace face (~0.6em per character). Overshooting is
 * harmless; the backing rect is painted in the colour behind it either way.
 */
export const estimateMonoWidth = (text: string, fontSize: number, letterSpacing = 0): number =>
  text.length * (fontSize * 0.6 + letterSpacing);
