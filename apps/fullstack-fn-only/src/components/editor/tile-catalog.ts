import {
  DIAGRAM_ICONS,
  DIAGRAM_ICON_KEYS,
  resolveDiagramIconFill,
  resolveMonogramFill,
  TILE_VARIANTS,
} from "@diagram-tool/domain/constants";
import type { DiagramIconKey } from "@diagram-tool/domain/constants";

/**
 * Everything the tile palette can place, as one flat list.
 *
 * The brand half is derived from `DIAGRAM_ICONS` rather than restated, so a
 * mark added to the registry appears in the palette without being listed twice.
 * The emoji half is hand-written because it has no registry: the schema's
 * `emoji` field accepts any glyph, and a palette that offered "any glyph" would
 * offer nothing. These six are the roles a diagram keeps needing that no brand
 * mark covers — the fallback the schema designed for, not a gap in it.
 *
 * The monogram tile at the end is the same argument taken one step further: an
 * emoji names a role, and some things are a named product with no logo here.
 * One card, because what distinguishes those tiles is the two characters the
 * author types, not a choice the palette could have made for them.
 */

export interface BrandTile {
  kind: "icon";
  /** Stable identity within the palette, and the seed for a placed node's id. */
  key: string;
  /** Human name, and the `name` a freshly placed node gets. */
  label: string;
  iconKey: DiagramIconKey;
  /** simple-icons path, drawn in a 24x24 viewBox. */
  path: string;
  /** Fill for the mark on a light tile, already through the contrast rule. */
  fill: string;
}

export interface EmojiTile {
  kind: "emoji";
  key: string;
  label: string;
  emoji: string;
}

export interface InitialsTile {
  kind: "initials";
  key: string;
  label: string;
  /** The monogram a freshly placed tile carries until it is typed over. */
  initials: string;
  /** Fill for the letters on a light tile — the call the renderer makes. */
  fill: string;
}

export type PaletteTile = BrandTile | EmojiTile | InitialsTile;

/** The mark field a placed tile writes. Exactly one, chosen by its kind. */
export const markOf = (tile: PaletteTile): Record<string, string> => {
  if (tile.kind === "icon") return { iconKey: tile.iconKey };
  if (tile.kind === "initials") return { initials: tile.initials };
  return { emoji: tile.emoji };
};

/**
 * Names `simple-icons` records that read wrong as a node label.
 *
 * The upstream title is a legal brand string, not a diagram label: "Cloudflare
 * Workers" overruns the schema's 26-character limit far less gracefully than
 * "Workers", and the platform is already named by its own tile beside it.
 */
const LABEL_OVERRIDES: Partial<Record<DiagramIconKey, string>> = {
  cloudflareworkers: "Workers",
  githubactions: "Actions",
  nodedotjs: "Node.js",
  betterauth: "Better Auth",
};

const BRAND_TILES: BrandTile[] = DIAGRAM_ICON_KEYS.map((iconKey) => {
  const icon = DIAGRAM_ICONS[iconKey];
  return {
    kind: "icon",
    key: iconKey,
    label: LABEL_OVERRIDES[iconKey] ?? icon.title,
    iconKey,
    path: icon.path,
    // Palette thumbnails are the light tile in miniature, so the mark is
    // resolved against the light tile — the same call the renderer makes.
    fill: resolveDiagramIconFill(icon, TILE_VARIANTS.LIGHT),
  };
});

const EMOJI_TILES: EmojiTile[] = [
  { kind: "emoji", key: "desktop", label: "Desktop", emoji: "🖥️" },
  { kind: "emoji", key: "mobile", label: "Mobile app", emoji: "📱" },
  { kind: "emoji", key: "auth", label: "Auth provider", emoji: "🔐" },
  { kind: "emoji", key: "queue", label: "Queue", emoji: "📬" },
  { kind: "emoji", key: "model", label: "Model", emoji: "🧠" },
  { kind: "emoji", key: "storage", label: "Storage", emoji: "🗄️" },
];

const INITIALS_TILES: InitialsTile[] = [
  {
    kind: "initials",
    key: "custom",
    label: "Custom",
    initials: "AB",
    fill: resolveMonogramFill(TILE_VARIANTS.LIGHT),
  },
];

export const PALETTE_TILES: PaletteTile[] = [...BRAND_TILES, ...EMOJI_TILES, ...INITIALS_TILES];

/**
 * The drag payload a palette card carries: the tile's key, nothing else.
 *
 * A custom MIME type rather than `text/plain` so a stray drag from a text field
 * cannot be mistaken for a tile, and so the stage can tell whether a drop is
 * one of ours before it accepts it.
 */
export const TILE_DRAG_MIME = "application/x-diagram-tile";

export const BRAND_TILE_COUNT = BRAND_TILES.length;

export const findPaletteTile = (key: string): PaletteTile | undefined =>
  PALETTE_TILES.find((tile) => tile.key === key);

/** Matches on both the human name and the key an author would type. */
export const matchesQuery = (tile: PaletteTile, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return tile.label.toLowerCase().includes(needle) || tile.key.includes(needle);
};

/**
 * A node id that no node in `taken` already uses.
 *
 * Ids are the handle every edge holds, so a collision would silently re-point
 * existing edges at the tile that was just placed. The suffix starts at 2
 * because `hono`, `hono2` reads as a list where `hono1` reads as a mistake.
 */
export const uniqueNodeId = (base: string, taken: Iterable<string>): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
};
