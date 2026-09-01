import {
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
  siHono,
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
 * Cloudflare Worker. The package is CC0-1.0 and side-effect free, so only the
 * marks imported below reach a bundle.
 *
 * Keys are the upstream `simple-icons` slug, lowercase, with no separator. One
 * naming rule means a model can guess a key and usually be right; the
 * guidelines interpolate the full list from here so it can also just read it.
 *
 * Adding an icon is one import plus one line — the test in `__tests__` is the
 * gate that a renamed or dropped upstream export fails loudly at build time.
 */

/** A brand mark, reduced to the three fields the renderer needs. */
export interface DiagramIcon {
  /** Brand name as `simple-icons` records it. */
  title: string;
  /** The mark as a single SVG path, drawn in a 24x24 viewBox. */
  path: string;
  /** Official brand colour: six hex digits, no leading `#`. */
  hex: string;
}

/**
 * Narrows an upstream icon to this registry's contract. Copying the three
 * fields rather than storing the whole object keeps the registry's shape ours,
 * so an upstream field being added or renamed cannot leak into the renderer.
 */
const toDiagramIcon = ({ title, path, hex }: DiagramIcon): DiagramIcon => ({ title, path, hex });

export const DIAGRAM_ICONS = {
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
  hono: toDiagramIcon(siHono),
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
export const resolveDiagramIconFill = (icon: DiagramIcon, tile: TileVariant): string => {
  if (tile === TILE_VARIANTS.DARK) return DIAGRAM_COLORS.TILE_LIGHT_FILL;

  const readable =
    contrastRatio(icon.hex, DIAGRAM_COLORS.TILE_LIGHT_FILL) >= DIAGRAM_ICON_CONTRAST_MIN;
  return readable ? `#${icon.hex}` : DIAGRAM_COLORS.TILE_DARK_FILL;
};
