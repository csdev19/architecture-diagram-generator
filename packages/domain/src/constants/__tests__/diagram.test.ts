import { describe, expect, it } from "vitest";
import {
  ANCHOR_SIDES,
  EDGE_STYLES,
  GROUP_TONES,
  GROUP_TONE_INFO,
  TILE_VARIANTS,
  isValidAnchorSide,
  isValidEdgeStyle,
  isValidGroupTone,
  isValidTileVariant,
} from "../diagram";

describe("diagram constants", () => {
  it("gives every tone a complete colour entry", () => {
    for (const tone of Object.values(GROUP_TONES)) {
      const info = GROUP_TONE_INFO[tone];
      expect(info, `missing GROUP_TONE_INFO entry for "${tone}"`).toBeDefined();
      expect(info.border).toMatch(/^#[0-9a-f]{6}$/i);
      expect(info.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(info.label).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("carries no colour entry for a tone that does not exist", () => {
    const tones: string[] = Object.values(GROUP_TONES);
    expect(Object.keys(GROUP_TONE_INFO).sort()).toEqual(tones.sort());
  });

  it("accepts its own values and rejects anything else", () => {
    expect(isValidGroupTone(GROUP_TONES.ORANGE)).toBe(true);
    expect(isValidGroupTone("purple")).toBe(false);

    expect(isValidTileVariant(TILE_VARIANTS.DARK)).toBe(true);
    expect(isValidTileVariant("translucent")).toBe(false);

    expect(isValidEdgeStyle(EDGE_STYLES.DASHED)).toBe(true);
    expect(isValidEdgeStyle("dotted")).toBe(false);

    expect(isValidAnchorSide(ANCHOR_SIDES.LEFT)).toBe(true);
    expect(isValidAnchorSide("left")).toBe(false);
  });
});
