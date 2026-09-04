import {
  siAngular,
  siAstro,
  siBetterauth,
  siBun,
  siCloudflare,
  siCloudflareworkers,
  siDocker,
  siDrizzle,
  siExpo,
  siGithub,
  siGithubactions,
  siNestjs,
  siNodedotjs,
  siPostgresql,
  siReact,
  siRedis,
  siTailwindcss,
  siTurborepo,
  siTypescript,
  siVite,
  siZod,
} from "simple-icons";
import { DIAGRAM_COLORS, TILE_VARIANTS, type TileVariant } from "./diagram";

/**
 * The curated brand-icon registry.
 *
 * `simple-icons` ships every mark as plain data — a title, a single SVG path
 * authored in a 24x24 viewBox, and the official brand hex — which is why it is
 * admissible in the domain where an `.svg` asset folder would not be: there is
 * no loader, no bundler magic and no DOM, so this works unchanged inside a
 * Cloudflare Worker. That single path is every icon's `mono` mark. An icon may
 * also carry `art` — colour, several fills, gradients — curated by hand from the
 * brand's own SVG; the mono mark stays, because it is the one that is readable
 * on any tile. The package is CC0-1.0 and side-effect free, so only the
 * marks imported below reach a bundle.
 *
 * Keys are the upstream `simple-icons` slug, lowercase, with no separator. One
 * naming rule means a model can guess a key and usually be right; the
 * guidelines interpolate the full list from here so it can also just read it.
 *
 * Adding an icon is one import plus one line — the test in `__tests__` is the
 * gate that a renamed or dropped upstream export fails loudly at build time.
 */

/** The single-path mark every icon carries, drawn in a 24x24 viewBox. */
export interface DiagramIconMono {
  /** The mark as one SVG path. */
  path: string;
  /** Official brand colour: six hex digits, no leading `#`. */
  hex: string;
}

/**
 * Colour art, drawn as authored.
 *
 * The inner markup of an SVG — paths, groups, `<defs>` with gradients — and
 * the box it was authored in. Every `id` inside `body` is prefixed with the
 * icon's key, because a diagram inlines every mark into one document and two
 * icons sharing an `id` would draw with each other's gradients.
 */
export interface DiagramIconArt {
  viewBox: string;
  body: string;
  /**
   * Whether the art reads on the dark tile. A judgment made at 32px by whoever
   * curated it; when false, the dark tile falls back to the mono mark in white.
   */
  onDark: boolean;
}

/** A brand mark: the mono silhouette it always has, and the colour art it may have. */
export interface DiagramIcon {
  /** Brand name as `simple-icons` records it. */
  title: string;
  mono: DiagramIconMono;
  art?: DiagramIconArt;
}

/**
 * Narrows an upstream icon to this registry's contract. Copying the three
 * fields rather than storing the whole object keeps the registry's shape ours,
 * so an upstream field being added or renamed cannot leak into the renderer.
 */
const toDiagramIcon = ({
  title,
  path,
  hex,
}: {
  title: string;
  path: string;
  hex: string;
}): DiagramIcon => ({ title, mono: { path, hex } });

/**
 * Hono, drawn from the official logo rather than from `simple-icons`.
 *
 * The one entry in this registry that is not an upstream re-export, and it is
 * deliberate. Hono's mark is a solid flame with a lighter flame inside it —
 * two paths, two colours, in a 76x98 box. `simple-icons` has to flatten every
 * mark to one path in one colour, and it does that by cutting the inner flame
 * out as a hole. At 32px the result reads as a ring, not as a flame.
 *
 * This is the logo's outer path alone, scaled to fit the 24x24 box every other
 * entry is authored in and centred across it. Dropping the inner flame loses a
 * highlight; drawing a hole loses the shape. The silhouette is what identifies
 * a technology at this size, so the silhouette is what is kept.
 *
 * `hex` stays the brand orange `simple-icons` records, which is also what the
 * contrast gate has always measured this mark against.
 */
const HONO_ICON: DiagramIcon = {
  title: "Hono",
  mono: {
    path:
      "M5.388 6.122l1.714 2.205s2.204-4.408 5.388-8.327c4.163 4.898 8.816 11.755 8.816 15.673 " +
      "0 4.898-4.653 8.327-9.061 8.327C6.857 24 2.694 19.837 2.694 14.939c0-1.469 0.735-5.878 2.694-8.817Z",
    hex: "E36002",
  },
};

export const DIAGRAM_ICONS = {
  angular: toDiagramIcon(siAngular),
  astro: toDiagramIcon(siAstro),
  betterauth: toDiagramIcon(siBetterauth),
  bun: toDiagramIcon(siBun),
  cloudflare: toDiagramIcon(siCloudflare),
  cloudflareworkers: toDiagramIcon(siCloudflareworkers),
  docker: toDiagramIcon(siDocker),
  drizzle: toDiagramIcon(siDrizzle),
  expo: toDiagramIcon(siExpo),
  github: toDiagramIcon(siGithub),
  githubactions: toDiagramIcon(siGithubactions),
  hono: HONO_ICON,
  nestjs: toDiagramIcon(siNestjs),
  nodedotjs: toDiagramIcon(siNodedotjs),
  postgresql: toDiagramIcon(siPostgresql),
  react: toDiagramIcon(siReact),
  redis: toDiagramIcon(siRedis),
  tailwindcss: toDiagramIcon(siTailwindcss),
  turborepo: toDiagramIcon(siTurborepo),
  typescript: toDiagramIcon(siTypescript),
  vite: toDiagramIcon(siVite),
  zod: toDiagramIcon(siZod),
} as const satisfies Record<string, DiagramIcon>;

export type DiagramIconKey = keyof typeof DIAGRAM_ICONS;

/**
 * Derived, never hand-written: the schema validates against this list and the
 * guidelines interpolate it, so a registry entry cannot exist without being
 * both accepted and advertised.
 */
export const DIAGRAM_ICON_KEYS = Object.keys(DIAGRAM_ICONS) as DiagramIconKey[];

/**
 * The words a person actually writes, mapped to the key that draws them.
 *
 * A registry key is a `simple-icons` slug, and several of them are nothing
 * anybody would put in a box on a whiteboard: `nodedotjs`, `cloudflareworkers`,
 * `githubactions`. Handed only the slug list, a model reading a sketch labelled
 * "Node" has to invent the key — and an invented key is rejected, which costs a
 * whole correction round before the author sees a diagram.
 *
 * Only the keys a label cannot be guessed into are listed. `react` needs no
 * alias because a box labelled "React" already spells its key, and an entry
 * that restates the obvious is one more line to keep true for no gain.
 *
 * An alias belongs to exactly one key. An ambiguous one is worse than none: it
 * turns the mapping into a coin flip the author cannot see being tossed.
 */
export const DIAGRAM_ICON_ALIASES = {
  cloudflareworkers: ["CF Workers", "Workers"],
  githubactions: ["GH Actions"],
  nodedotjs: ["Node", "Node.js", "NodeJS"],
  postgresql: ["Postgres", "PG"],
  tailwindcss: ["Tailwind"],
} as const satisfies Partial<Record<DiagramIconKey, readonly string[]>>;

/** `hasOwn`, not `in`: `"toString" in DIAGRAM_ICONS` is true and is not an icon. */
export const isValidDiagramIconKey = (value: unknown): value is DiagramIconKey =>
  typeof value === "string" && Object.hasOwn(DIAGRAM_ICONS, value);

/**
 * Minimum contrast a brand colour must reach against the light tile before the
 * renderer will use it.
 *
 * Brand palettes are chosen for logos on their own backgrounds, not for a 32px
 * solid mark on white: Better Auth's white and Drizzle's lime score 1.00 and
 * 1.25, which is invisible and near-invisible. Below this floor the near-black
 * tile colour takes over — the shape still identifies the technology, which is
 * the point of drawing a logo at all. 2 sits below the readable brand colours
 * (Cloudflare's orange scores 2.65) and above the ones that vanish.
 */
export const DIAGRAM_ICON_CONTRAST_MIN = 2;

const stripHash = (hex: string): string => (hex.startsWith("#") ? hex.slice(1) : hex);

/** WCAG relative luminance of a six-digit hex colour. */
const relativeLuminance = (hex: string): number => {
  const bare = stripHash(hex);
  const channel = (offset: number): number => {
    const value = Number.parseInt(bare.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

/** WCAG contrast ratio between two six-digit hex colours, 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

/**
 * The fill a mark is drawn with on a given tile.
 *
 * A dark tile always gets the light tile's colour: the marks that would keep
 * their brand hue there are a minority, and the ones that would not — GitHub's
 * near-black scores 1.00 on the dark tile — disappear completely. One rule is
 * worth more than a marginal gain in brand fidelity on the two or three tiles a
 * diagram is allowed to make dark.
 */
/**
 * The fill for a mark that has no brand colour to keep — a monogram.
 *
 * The same two values `resolveDiagramIconFill` falls back to, reached without
 * inventing a hex for a mark that never had one: the tile's opposite colour,
 * which is the highest contrast available and the one every logo that loses its
 * brand hue is already drawn in.
 */
export const resolveMonogramFill = (tile: TileVariant): string =>
  tile === TILE_VARIANTS.DARK ? DIAGRAM_COLORS.TILE_LIGHT_FILL : DIAGRAM_COLORS.TILE_DARK_FILL;

export const resolveDiagramIconFill = (icon: DiagramIcon, tile: TileVariant): string => {
  if (tile === TILE_VARIANTS.DARK) return DIAGRAM_COLORS.TILE_LIGHT_FILL;

  const readable =
    contrastRatio(icon.mono.hex, DIAGRAM_COLORS.TILE_LIGHT_FILL) >= DIAGRAM_ICON_CONTRAST_MIN;
  return readable ? `#${icon.mono.hex}` : DIAGRAM_COLORS.TILE_DARK_FILL;
};
