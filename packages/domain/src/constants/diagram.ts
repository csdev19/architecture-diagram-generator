import type { ObjectProperties } from "../types";

/**
 * Diagram domain constants.
 *
 * Every enum-like set, colour, size and limit the diagram uses lives here, so
 * the schema and the renderer read from one source. The renderer must never
 * restate a hex value or a padding that already exists in this file.
 *
 * Colours are literal values rather than theme tokens on purpose: they are
 * written into SVG attributes and must survive rasterisation to PNG outside a
 * browser, where no stylesheet or CSS custom property is available.
 */

/**
 * Semantic tone of a group box. The config author picks meaning, never a
 * colour — that is what keeps every diagram in the same visual family.
 */
export const GROUP_TONES = {
  /** Cloud provider or primary runtime. */
  ORANGE: "orange",
  /** Tooling, monorepo, build. */
  BLUE: "blue",
  /** External services and data. */
  GREEN: "green",
  /** Anything else. */
  NEUTRAL: "neutral",
} as const;

export type GroupTone = ObjectProperties<typeof GROUP_TONES>;

export const isValidGroupTone = (value: unknown): value is GroupTone =>
  Object.values(GROUP_TONES).includes(value as GroupTone);

/** Border, fill and label colour for each group tone. */
export interface GroupToneInfo {
  border: string;
  fill: string;
  label: string;
}

export const GROUP_TONE_INFO: Record<GroupTone, GroupToneInfo> = {
  [GROUP_TONES.ORANGE]: { border: "#f6a04d", fill: "#fdf3e7", label: "#c2410c" },
  [GROUP_TONES.BLUE]: { border: "#93c5fd", fill: "#f3f8ff", label: "#1d4ed8" },
  [GROUP_TONES.GREEN]: { border: "#86efac", fill: "#f0fdf4", label: "#15803d" },
  [GROUP_TONES.NEUTRAL]: { border: "#cbd5e1", fill: "#f8fafc", label: "#475569" },
};

/**
 * The paper a diagram is drawn on.
 *
 * Five near-whites rather than a colour picker: the surface is meant to recede,
 * and the moment it can be any colour someone will pick one that fights the
 * tiles. These are the tints a notepad comes in — plain, cool, and two warm —
 * which is enough to make a diagram feel chosen without letting it get loud.
 */
export const CANVAS_TONES = {
  WHITE: "white",
  /** Faintest cool grey. The default: paper, without being a light box. */
  GREY: "grey",
  BLUE: "blue",
  /** Legal pad. */
  CREAM: "cream",
  BLUSH: "blush",
} as const;

export type CanvasTone = ObjectProperties<typeof CANVAS_TONES>;

export const isValidCanvasTone = (value: unknown): value is CanvasTone =>
  Object.values(CANVAS_TONES).includes(value as CanvasTone);

export const CANVAS_TONE_INFO: Record<CanvasTone, string> = {
  [CANVAS_TONES.WHITE]: "#ffffff",
  [CANVAS_TONES.GREY]: "#f8f9fa",
  [CANVAS_TONES.BLUE]: "#f5faff",
  [CANVAS_TONES.CREAM]: "#fffce8",
  [CANVAS_TONES.BLUSH]: "#fdf8f6",
};

/** Tile fill treatment for a node. `dark` is reserved for 2-3 key nodes. */
export const TILE_VARIANTS = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export type TileVariant = ObjectProperties<typeof TILE_VARIANTS>;

export const isValidTileVariant = (value: unknown): value is TileVariant =>
  Object.values(TILE_VARIANTS).includes(value as TileVariant);

/**
 * Edge semantics. `solid` is the primary request/data path; `dashed` marks
 * secondary relationships — auth, deploy, hooks, side channels.
 */
export const EDGE_STYLES = {
  SOLID: "solid",
  DASHED: "dashed",
} as const;

export type EdgeStyle = ObjectProperties<typeof EDGE_STYLES>;

export const isValidEdgeStyle = (value: unknown): value is EdgeStyle =>
  Object.values(EDGE_STYLES).includes(value as EdgeStyle);

/** Side of a tile an edge leaves from or arrives at. */
export const ANCHOR_SIDES = {
  LEFT: "l",
  RIGHT: "r",
  TOP: "t",
  BOTTOM: "b",
} as const;

export type AnchorSide = ObjectProperties<typeof ANCHOR_SIDES>;

export const isValidAnchorSide = (value: unknown): value is AnchorSide =>
  Object.values(ANCHOR_SIDES).includes(value as AnchorSide);

/** Pixel geometry. A node's `x`/`y` is the centre of its tile. */
export const DIAGRAM_GEOMETRY = {
  /** Tile is a square of this side. */
  TILE_SIZE: 62,
  TILE_RADIUS: 14,
  GROUP_RADIUS: 14,
  /** Background grid cell. */
  GRID_CELL: 26,
  /** Gap between a tile edge and the start of its edge line. */
  ANCHOR_OFFSET: 6,
  /** Extra clearance below a tile so a bottom edge clears the node's text. */
  BOTTOM_ANCHOR_OFFSET: 34,
  /** Vertical space the name + sublabel occupy under a tile. */
  NODE_TEXT_BLOCK: 40,
  /**
   * Minimum distance between node centres. The guidelines ask for this in both
   * directions, and auto-layout uses it as its vertical step.
   */
  NODE_SPACING: 140,
  /**
   * Horizontal step for auto-layout, wider than the minimum: a name may run to
   * `TEXT_MAX` characters, which is around 180px set at `NAME_SIZE`, so columns
   * spaced at the bare minimum would overlap their own labels.
   */
  LAYOUT_COLUMN_GAP: 200,
  /**
   * Centre of the first column and row. Clears the `CANVAS_MARGIN` validation
   * limit and the 70px the guidelines ask for, with the tile's half-width on top.
   */
  LAYOUT_ORIGIN: 110,
  /** Rendered side of a brand icon, centred on the tile like the emoji it replaces. */
  ICON_SIZE: 32,
  /** simple-icons paths are authored in a square viewBox of this side. */
  ICON_VIEWBOX: 24,
} as const;

export const DIAGRAM_TYPOGRAPHY = {
  NAME_FAMILY: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  MONO_FAMILY: "ui-monospace, SFMono-Regular, 'JetBrains Mono', monospace",
  EMOJI_SIZE: 28,
  NAME_SIZE: 13.5,
  SUB_SIZE: 10.5,
  GROUP_LABEL_SIZE: 11,
  EDGE_LABEL_SIZE: 10.5,
} as const;

export const DIAGRAM_COLORS = {
  /**
   * Neutral, not blue, and drawn dashed rather than solid.
   *
   * The grid covers the whole editor window now, so a solid line at any useful
   * weight reads as a mesh laid over the drawing. Dashing it drops the ink by
   * more than half while keeping the alignment cue, which is the only thing the
   * grid is for — and a neutral grey sits under all five paper tones without
   * tinting any of them.
   */
  GRID_LINE: "#dcdcdc",
  TILE_LIGHT_FILL: "#ffffff",
  TILE_LIGHT_BORDER: "#e2e8f0",
  TILE_DARK_FILL: "#0f172a",
  TILE_DARK_BORDER: "#0f172a",
  NAME_TEXT: "#0f172a",
  SUB_TEXT: "#64748b",
  EDGE_SOLID: "#3b82f6",
  EDGE_DASHED: "#94a3b8",
  EDGE_LABEL: "#475569",
} as const;

/**
 * Schema bounds. They exist here rather than inline in the schema so the
 * renderer and any future layout code read the same numbers.
 */
export const DIAGRAM_LIMITS = {
  MAX_GROUPS: 12,
  MIN_NODES: 1,
  MAX_NODES: 40,
  MAX_EDGES: 80,
  /** Longer labels overflow the tile, so the schema rejects them. */
  TEXT_MAX: 26,
} as const;
