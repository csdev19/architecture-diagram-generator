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
 * Semantic tone of a boundary — the box drawn around what shares a perimeter.
 * The author picks meaning, never a colour, which is what keeps every diagram
 * in the same visual family.
 */
export const BOUNDARY_TONES = {
  /** Cloud provider or primary runtime. */
  ORANGE: "orange",
  /** Tooling, monorepo, build. */
  BLUE: "blue",
  /** External services and data. */
  GREEN: "green",
  /** Anything else. */
  NEUTRAL: "neutral",
} as const;

export type BoundaryTone = ObjectProperties<typeof BOUNDARY_TONES>;

export const isValidBoundaryTone = (value: unknown): value is BoundaryTone =>
  Object.values(BOUNDARY_TONES).includes(value as BoundaryTone);

/**
 * How much room a derived boundary leaves around what it encloses.
 *
 * Named rather than numeric, like every other visual choice in the format: the
 * author says how tightly the box should read and the renderer owns the pixels.
 * This is what replaces resizing a grouped boundary by hand — its rectangle is
 * computed from its members, so there is nothing to drag.
 */
export const BOUNDARY_PADDINGS = {
  TIGHT: "tight",
  NORMAL: "normal",
  LOOSE: "loose",
} as const;

export type BoundaryPadding = ObjectProperties<typeof BOUNDARY_PADDINGS>;

export const isValidBoundaryPadding = (value: unknown): value is BoundaryPadding =>
  Object.values(BOUNDARY_PADDINGS).includes(value as BoundaryPadding);

/** Whitespace a derived boundary leaves on each side, per padding. */
export const BOUNDARY_PADDING_SIZE: Record<BoundaryPadding, number> = {
  [BOUNDARY_PADDINGS.TIGHT]: 30,
  [BOUNDARY_PADDINGS.NORMAL]: 60,
  [BOUNDARY_PADDINGS.LOOSE]: 90,
};

/** Border, fill and label colour for each boundary tone. */
export interface BoundaryToneInfo {
  border: string;
  fill: string;
  label: string;
}

export const BOUNDARY_TONE_INFO: Record<BoundaryTone, BoundaryToneInfo> = {
  [BOUNDARY_TONES.ORANGE]: { border: "#f6a04d", fill: "#fdf3e7", label: "#c2410c" },
  [BOUNDARY_TONES.BLUE]: { border: "#93c5fd", fill: "#f3f8ff", label: "#1d4ed8" },
  [BOUNDARY_TONES.GREEN]: { border: "#86efac", fill: "#f0fdf4", label: "#15803d" },
  [BOUNDARY_TONES.NEUTRAL]: { border: "#cbd5e1", fill: "#f8fafc", label: "#475569" },
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

/**
 * How every brand mark in a diagram is coloured.
 *
 * Two values, not three: "black" and "white" are what the tile decides, and a
 * mark forced to one of them would vanish on the other tile. `mono` means the
 * silhouette in whichever of the two reads; `color` means the art when there
 * is some, and the brand colour when it is legible.
 */
export const ICON_STYLES = {
  COLOR: "color",
  MONO: "mono",
} as const;

export type IconStyle = ObjectProperties<typeof ICON_STYLES>;

export const isValidCanvasTone = (value: unknown): value is CanvasTone =>
  Object.values(CANVAS_TONES).includes(value as CanvasTone);

export const CANVAS_TONE_INFO: Record<CanvasTone, string> = {
  [CANVAS_TONES.WHITE]: "#ffffff",
  [CANVAS_TONES.GREY]: "#f8f9fa",
  [CANVAS_TONES.BLUE]: "#f5faff",
  [CANVAS_TONES.CREAM]: "#fffce8",
  [CANVAS_TONES.BLUSH]: "#fdf8f6",
};

/** Tile fill treatment for a node. `dark` is emphasis, and works only while rare. */
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
  BOUNDARY_RADIUS: 14,
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
   * `NODE_NAME_MAX` characters, which is around 180px set at `NAME_SIZE`, so
   * columns spaced at the bare minimum would overlap their own labels.
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
  /**
   * A monogram, sized to carry the weight a 32px logo carries beside it.
   *
   * Smaller than the emoji: two bold capitals at 24px already occupy about the
   * width of an icon, and matching the emoji's 28px would make the one tile
   * without a real mark the loudest thing on the sheet.
   */
  INITIALS_SIZE: 24,
  NAME_SIZE: 13.5,
  SUB_SIZE: 10.5,
  BOUNDARY_LABEL_SIZE: 11,
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
  MAX_BOUNDARIES: 12,
  /** Groups are the relation, not the box: a diagram may name as many as boxes. */
  MAX_GROUPS: 12,
  MIN_NODES: 1,
  MAX_NODES: 40,
  MAX_EDGES: 80,
  /**
   * Text bounds, one per field, because the three places a diagram draws text
   * are not the same shape.
   *
   * A node's name and sublabel are centred under a 62px tile in a column stepped
   * at `LAYOUT_COLUMN_GAP`, so what bounds them is the column: a longer label
   * runs into its neighbour's. The sublabel gets a few more characters than the
   * name because it is set smaller — 28 characters of `SUB_SIZE` monospace and
   * 26 of `NAME_SIZE` sans occupy about the same 180px.
   *
   * A boundary's label is not in a box at all: it rides the top border of a
   * rectangle that `resolveDiagram` widens to carry it. Nothing overflows, so
   * the bound is legibility rather than fit — long enough for a real perimeter
   * name like "Monorepo — Turborepo + Bun workspaces", short enough that a
   * sentence is still refused.
   *
   * An edge label sits on a line whose length nothing guarantees, so it stays
   * the tightest of the three.
   */
  NODE_NAME_MAX: 26,
  NODE_SUB_MAX: 28,
  BOUNDARY_LABEL_MAX: 48,
  EDGE_LABEL_MAX: 32,
  /**
   * Characters a monogram may hold.
   *
   * Two is what fits inside a 62px tile at the weight a logo carries there. It
   * is also the honest ceiling on the idea: a monogram stands in for a mark, and
   * three letters have stopped standing in for anything and become a word.
   */
  INITIALS_MAX: 2,
} as const;
