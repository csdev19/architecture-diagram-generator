import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, TILE_VARIANTS } from "../diagram";
import {
  DIAGRAM_ICON_CONTRAST_MIN,
  DIAGRAM_ICON_KEYS,
  DIAGRAM_ICONS,
  contrastRatio,
  isValidDiagramIconKey,
  resolveDiagramIconFill,
} from "../diagram-icons";

/**
 * The registry is the gate on `simple-icons`: upstream renames and drops an
 * export from time to time, and a missing import would otherwise surface as an
 * icon that silently fails to draw. Iterating every curated entry turns that
 * into a build-time failure naming the key.
 */
describe("DIAGRAM_ICONS", () => {
  it("curates at least one icon", () => {
    expect(DIAGRAM_ICON_KEYS.length).toBeGreaterThan(0);
  });

  it("resolves every curated key to a complete mark", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      const icon = DIAGRAM_ICONS[key];
      expect(icon, `no icon resolved for "${key}" — check the simple-icons export`).toBeDefined();
      expect(icon.title.length, `"${key}" has an empty title`).toBeGreaterThan(0);
      expect(icon.hex, `"${key}" has a malformed hex`).toMatch(/^[0-9a-f]{6}$/i);
      expect(icon.path.length, `"${key}" has an empty path`).toBeGreaterThan(0);
    }
  });

  it("carries path data an SVG renderer can draw", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      // Path data opens with a moveto. Either case is valid — a leading `m` is
      // relative to an implicit origin, so it draws identically to `M`.
      expect(DIAGRAM_ICONS[key].path, `"${key}" is not SVG path data`).toMatch(/^[Mm]/);
    }
  });

  it("keeps keys lowercase, separator-free and alphabetically ordered", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      expect(key, `"${key}" breaks the slug convention`).toMatch(/^[a-z0-9]+$/);
    }
    expect(DIAGRAM_ICON_KEYS).toEqual([...DIAGRAM_ICON_KEYS].sort());
  });

  it("accepts its own keys and rejects anything else", () => {
    expect(isValidDiagramIconKey("react")).toBe(true);
    expect(isValidDiagramIconKey("not-a-real-icon")).toBe(false);
    expect(isValidDiagramIconKey(undefined)).toBe(false);
    // Inherited object members must not read as icons.
    expect(isValidDiagramIconKey("toString")).toBe(false);
  });
});

describe("resolveDiagramIconFill", () => {
  it("draws every mark legibly on a light tile", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      const fill = resolveDiagramIconFill(DIAGRAM_ICONS[key], TILE_VARIANTS.LIGHT);
      expect(
        contrastRatio(fill, DIAGRAM_COLORS.TILE_LIGHT_FILL),
        `"${key}" washes out on a light tile`,
      ).toBeGreaterThanOrEqual(DIAGRAM_ICON_CONTRAST_MIN);
    }
  });

  it("keeps a brand colour that reads on white", () => {
    // Cloudflare's orange scores 2.65 against the light tile.
    expect(resolveDiagramIconFill(DIAGRAM_ICONS.cloudflare, TILE_VARIANTS.LIGHT)).toBe(
      `#${DIAGRAM_ICONS.cloudflare.hex}`,
    );
  });

  it("replaces a brand colour that would vanish on white", () => {
    // Better Auth's mark is pure white: 1.00 against the light tile.
    expect(resolveDiagramIconFill(DIAGRAM_ICONS.betterauth, TILE_VARIANTS.LIGHT)).toBe(
      DIAGRAM_COLORS.TILE_DARK_FILL,
    );
  });

  it("draws every mark in the light tile colour on a dark tile", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      expect(resolveDiagramIconFill(DIAGRAM_ICONS[key], TILE_VARIANTS.DARK)).toBe(
        DIAGRAM_COLORS.TILE_LIGHT_FILL,
      );
    }
  });
});

describe("contrastRatio", () => {
  it("scores identical colours 1 and opposites 21", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
  });

  it("reads a hex with or without its hash", () => {
    expect(contrastRatio("f38020", "#ffffff")).toBeCloseTo(contrastRatio("#f38020", "#ffffff"));
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0f172a", "#61dafb")).toBeCloseTo(contrastRatio("#61dafb", "#0f172a"));
  });
});
