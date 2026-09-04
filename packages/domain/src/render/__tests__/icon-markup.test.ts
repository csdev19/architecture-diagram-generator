import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, ICON_STYLES, TILE_VARIANTS } from "../../constants/diagram";
import type { DiagramIcon } from "../../constants/diagram-icons";
import { renderIconMarkup } from "../icon-markup";

/**
 * Fixtures rather than registry entries: the table under test is about what
 * the helper does with an icon's shape, and a registry entry can gain art at
 * any time and quietly change which row a test is exercising.
 */
const SQUARE = "M0 0h24v24H0z";

/** Cloudflare's orange, which scores 2.65 against the light tile. */
const readable: DiagramIcon = { title: "Readable", mono: { path: SQUARE, hex: "f38020" } };
/** Pure white, which scores 1.00 and must fall back. */
const faint: DiagramIcon = { title: "Faint", mono: { path: SQUARE, hex: "ffffff" } };

const ART_BODY = '<rect width="10" height="10" fill="#ff0000"/>';
const withArt: DiagramIcon = {
  ...readable,
  art: { viewBox: "0 0 10 10", body: ART_BODY, onDark: true },
};
const artNotOnDark: DiagramIcon = {
  ...readable,
  art: { viewBox: "0 0 10 10", body: ART_BODY, onDark: false },
};

const at = { x: 4, y: 6, size: 32 };
const draw = (icon: DiagramIcon, tile: "light" | "dark", style: "color" | "mono") =>
  renderIconMarkup(icon, tile, style, at);

describe("renderIconMarkup", () => {
  it("places the mark as a nested svg of the requested size", () => {
    const svg = draw(readable, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

    expect(svg).toMatch(/^<svg x="4" y="6" width="32" height="32" /);
    expect(svg).toMatch(/<\/svg>$/);
  });

  describe("in colour", () => {
    it("draws the mono mark in its brand colour when that reads on a light tile", () => {
      const svg = draw(readable, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain(`<path d="${SQUARE}" fill="#f38020"/>`);
    });

    it("draws the mono mark near-black when the brand colour would vanish on a light tile", () => {
      const svg = draw(faint, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_DARK_FILL}"`);
    });

    it("draws the mono mark in white on a dark tile", () => {
      const svg = draw(readable, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"`);
      expect(svg).not.toContain("#f38020");
    });

    it("draws the art, in its own viewBox, on a light tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain('viewBox="0 0 10 10"');
      expect(svg).toContain(ART_BODY);
      expect(svg).not.toContain("<path d=");
    });

    /**
     * `onDark` is a judgment about the dark tile only — it must not gate the
     * light tile too. Every other light-tile test above happens to use art
     * fixtures with `onDark: true`, so without this one a regression that
     * narrowed the light-tile-or-onDark check to an AND would still pass.
     */
    it("draws the art on a light tile even when it was judged not to read on dark", () => {
      const svg = draw(artNotOnDark, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain(ART_BODY);
    });

    it("draws the art on a dark tile when it was judged to read there", () => {
      const svg = draw(withArt, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).toContain(ART_BODY);
    });

    it("falls back to the mono mark in white on a dark tile when the art was not", () => {
      const svg = draw(artNotOnDark, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`<path d="${SQUARE}" fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"/>`);
    });
  });

  describe("in mono", () => {
    it("ignores the art and the brand colour on a light tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.LIGHT, ICON_STYLES.MONO);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`<path d="${SQUARE}" fill="${DIAGRAM_COLORS.TILE_DARK_FILL}"/>`);
    });

    it("draws the silhouette in white on a dark tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.DARK, ICON_STYLES.MONO);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"`);
    });
  });
});
