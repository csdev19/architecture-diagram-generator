import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, TILE_VARIANTS } from "../diagram";
import {
  DIAGRAM_ICON_ALIASES,
  DIAGRAM_ICON_CONTRAST_MIN,
  DIAGRAM_ICON_KEYS,
  DIAGRAM_ICONS,
  type DiagramIconKey,
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

describe("DIAGRAM_ICON_ALIASES", () => {
  /**
   * The map keeps its literal type in production, so looking a key up by a
   * variable is a type error there. Widening it here rather than loosening the
   * export is the difference between a test that adapts and a contract that
   * gives way to one.
   */
  const aliases: Partial<Record<DiagramIconKey, readonly string[]>> = DIAGRAM_ICON_ALIASES;

  /** Letters and digits only, so "Better Auth" and "betterauth" compare equal. */
  const bare = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

  it("never lists an alias that is only its own key respelled", () => {
    // The map exists for labels a key cannot be guessed from. "PostgreSQL" is
    // `postgresql` with a shift key held down; carrying it is a line to keep
    // true for no gain, which is what this module's own comment forbids.
    for (const [key, written] of Object.entries(DIAGRAM_ICON_ALIASES)) {
      for (const alias of written ?? []) {
        expect(bare(alias), `"${alias}" is "${key}" respelled`).not.toBe(key);
      }
    }
  });

  it("covers the keys a person would never write on a whiteboard", () => {
    // These are the slugs a sketch label cannot be guessed into: nobody draws a
    // box and writes "nodedotjs". Without an alias the model has to invent the
    // key, and an invented key is rejected.
    for (const key of ["nodedotjs", "postgresql", "githubactions", "cloudflareworkers"]) {
      expect(aliases[key as DiagramIconKey], `"${key}" has no alias`).toBeTruthy();
    }
  });

  it("never gives one written word to two different marks", () => {
    // An ambiguous alias is worse than none: it makes the mapping a coin flip.
    const seen = new Set<string>();
    for (const aliases of Object.values(DIAGRAM_ICON_ALIASES)) {
      for (const alias of aliases ?? []) {
        const needle = alias.toLowerCase();
        expect(seen.has(needle), `"${alias}" is claimed by two keys`).toBe(false);
        seen.add(needle);
      }
    }
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
