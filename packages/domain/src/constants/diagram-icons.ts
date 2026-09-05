import {
  siAngular,
  siAstro,
  siBetterauth,
  siBun,
  siCloudflare,
  siCloudflareworkers,
  siDocker,
  siDrizzle,
  siEffect,
  siExpo,
  siGithub,
  siGithubactions,
  siNestjs,
  siNodedotjs,
  siPostgresql,
  siReact,
  siReactquery,
  siRedis,
  siTailwindcss,
  siTanstack,
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
 *
 * `body` is inlined into the rendered SVG verbatim, unescaped — `renderIconMarkup`
 * interpolates it directly, and the palette feeds that markup to
 * `dangerouslySetInnerHTML`. That is safe only because `body` is trusted: it
 * must come from this repo, through `bun run icon:add`, and nowhere else. If
 * this registry ever admits an icon pack from outside the repo, its `art.body`
 * values have to be sanitised before they reach this type — treating them as
 * trusted the way curated entries are would turn this into stored XSS.
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
 *
 * The art below is the official two-flame logo, which is what the silhouette
 * was standing in for. On a dark tile the orange reads without help.
 */
const HONO_ICON: DiagramIcon = {
  title: "Hono",
  mono: {
    path:
      "M5.388 6.122l1.714 2.205s2.204-4.408 5.388-8.327c4.163 4.898 8.816 11.755 8.816 15.673 " +
      "0 4.898-4.653 8.327-9.061 8.327C6.857 24 2.694 19.837 2.694 14.939c0-1.469 0.735-5.878 2.694-8.817Z",
    hex: "E36002",
  },
  art: {
    viewBox: "0 0 256 330",
    body: '<path fill="#ff5b11" d="M134.129.029q1.315-.17 2.319.662a1256 1256 0 0 1 69.573 93.427q24.141 36.346 41.082 76.862q27.055 72.162-28.16 125.564q-48.313 40.83-111.318 31.805q-75.312-15.355-102.373-87.133Q-1.796 217.85.614 193.51q4.014-41.896 19.878-80.838q6.61-15.888 17.228-29.154a382 382 0 0 1 16.565 21.203q3.66 3.825 7.62 7.289Q92.138 52.013 134.13.029" opacity=".993"/><path fill="#ff9758" d="M129.49 53.7q36.47 42.3 65.93 90.114a187.3 187.3 0 0 1 15.24 33.13q12.507 49.206-26.836 81.169q-38.05 26.774-83.488 15.902q-48.999-15.205-56.653-65.929q-1.857-15.993 3.314-31.142a225.4 225.4 0 0 1 17.89-35.78l19.878-29.155a5510 5510 0 0 0 44.726-58.31"/>',
    onDark: true,
  },
};

export const DIAGRAM_ICONS = {
  angular: {
    ...toDiagramIcon(siAngular),
    art: {
      viewBox: "0 0 256 271",
      body: '<defs><linearGradient id="angular-0" x1="25.071%" x2="96.132%" y1="90.929%" y2="55.184%"><stop offset="0%" stop-color="#e40035"/><stop offset="24%" stop-color="#f60a48"/><stop offset="35.2%" stop-color="#f20755"/><stop offset="49.4%" stop-color="#dc087d"/><stop offset="74.5%" stop-color="#9717e7"/><stop offset="100%" stop-color="#6c00f5"/></linearGradient><linearGradient id="angular-1" x1="21.863%" x2="68.367%" y1="12.058%" y2="68.21%"><stop offset="0%" stop-color="#ff31d9"/><stop offset="100%" stop-color="#ff5be1" stop-opacity="0"/></linearGradient></defs><path fill="url(#angular-0)" d="m256 45.179l-9.244 145.158L158.373 0zm-61.217 187.697l-66.782 38.105l-66.784-38.105L74.8 199.958h106.4zM128.001 72.249l34.994 85.076h-69.99zM9.149 190.337L0 45.179L97.627 0z"/><path fill="url(#angular-1)" d="m256 45.179l-9.244 145.158L158.373 0zm-61.217 187.697l-66.782 38.105l-66.784-38.105L74.8 199.958h106.4zM128.001 72.249l34.994 85.076h-69.99zM9.149 190.337L0 45.179L97.627 0z"/>',
      onDark: true,
    },
  },
  astro: toDiagramIcon(siAstro),
  betterauth: toDiagramIcon(siBetterauth),
  bun: toDiagramIcon(siBun),
  cloudflare: toDiagramIcon(siCloudflare),
  cloudflareworkers: toDiagramIcon(siCloudflareworkers),
  docker: toDiagramIcon(siDocker),
  drizzle: toDiagramIcon(siDrizzle),
  effect: toDiagramIcon(siEffect),
  expo: toDiagramIcon(siExpo),
  github: toDiagramIcon(siGithub),
  githubactions: toDiagramIcon(siGithubactions),
  hono: HONO_ICON,
  nestjs: toDiagramIcon(siNestjs),
  nodedotjs: toDiagramIcon(siNodedotjs),
  postgresql: toDiagramIcon(siPostgresql),
  react: toDiagramIcon(siReact),
  reactquery: {
    ...toDiagramIcon(siReactquery),
    art: {
      viewBox: "0 0 256 230",
      body: '<path fill="#00435b" d="m157.98 142.487l-4.91 8.527a8.29 8.29 0 0 1-7.182 4.151H108.27a8.29 8.29 0 0 1-7.182-4.151l-4.911-8.527zm13.747-23.87l-8.658 15.034h-71.98l-8.658-15.034zm-8.34-23.342l8.354 14.506H82.417l8.354-14.506zm-17.5-22.066a8.29 8.29 0 0 1 7.183 4.151l5.228 9.079H95.86l5.229-9.079a8.29 8.29 0 0 1 7.182-4.151z"/><path fill="#002b3b" d="M53.523 69.252c-4.167-20.206-5.062-35.704-2.368-46.957c1.602-6.693 4.53-12.153 8.984-16.093c4.702-4.159 10.646-6.2 17.326-6.2c11.018 0 22.602 5.025 34.98 14.57c5.05 3.894 10.29 8.587 15.732 14.082c.434-.557.923-1.083 1.469-1.57c15.386-13.71 28.34-22.23 39.42-25.514c6.588-1.954 12.773-2.14 18.405-.244c5.946 2 10.683 6.137 14.026 11.93c5.516 9.561 6.97 22.124 4.914 37.637c-.838 6.323-2.271 13.21-4.296 20.673c.764.092 1.53.262 2.288.513c19.521 6.47 33.345 13.426 41.714 21.377c4.98 4.73 8.231 9.996 9.407 15.826c1.24 6.153.03 12.324-3.308 18.113c-5.506 9.548-15.63 17.077-30.052 23.041c-5.79 2.395-12.343 4.564-19.664 6.515c.334.754.594 1.555.767 2.395c4.167 20.206 5.061 35.704 2.368 46.957c-1.602 6.693-4.531 12.153-8.985 16.093c-4.701 4.159-10.646 6.2-17.325 6.2c-11.019 0-22.602-5.025-34.98-14.57c-5.104-3.936-10.402-8.687-15.907-14.258a11.7 11.7 0 0 1-2.084 2.442c-15.386 13.712-28.34 22.23-39.42 25.515c-6.588 1.954-12.773 2.14-18.405.244c-5.946-2-10.683-6.137-14.026-11.93c-5.516-9.561-6.97-22.124-4.914-37.637c.869-6.551 2.376-13.709 4.518-21.485a11.7 11.7 0 0 1-2.51-.537c-19.521-6.47-33.345-13.426-41.714-21.377c-4.98-4.73-8.231-9.996-9.407-15.826c-1.24-6.153-.03-12.325 3.308-18.114c5.506-9.547 15.63-17.077 30.052-23.04c5.963-2.467 12.734-4.693 20.32-6.689a12 12 0 0 1-.633-2.082"/><path fill="#ff4154" d="M189.647 161.333a3.684 3.684 0 0 1 4.235 2.81l.023.112l.207 1.075q10.065 52.915-14.18 52.915q-23.72 0-60.392-45.153a3.684 3.684 0 0 1 2.777-6.005h.114l1.288.009q15.432.084 30.004-1.076q17.2-1.37 35.924-4.687M78.646 134.667l.062.105l.646 1.127q7.765 13.5 16.18 25.627q9.912 14.28 22.29 28.914a3.684 3.684 0 0 1-.309 5.082l-.093.083l-.83.715q-40.96 35.096-53.244 14.012q-12.025-20.636 8.719-75.047a3.683 3.683 0 0 1 6.579-.618m124.857-52.054l.112.037l1.028.354q50.557 17.588 38.416 38.655q-11.874 20.605-69.041 30.004a3.683 3.683 0 0 1-3.773-5.501q8.188-13.928 14.749-27.717q7.44-15.638 13.965-33.57a3.684 3.684 0 0 1 4.432-2.295zM84.446 76.71a3.683 3.683 0 0 1 1.31 5.042q-8.19 13.927-14.75 27.717q-7.44 15.637-13.965 33.57a3.684 3.684 0 0 1-4.544 2.262l-.112-.037l-1.028-.355Q.8 127.322 12.941 106.255Q24.815 85.65 81.982 76.25c.85-.14 1.722.022 2.464.459m108.206-57.748q12.025 20.637-8.719 75.048a3.683 3.683 0 0 1-6.579.618l-.062-.105l-.646-1.127q-7.765-13.5-16.18-25.627q-9.912-14.28-22.29-28.914a3.684 3.684 0 0 1 .309-5.082l.093-.083l.83-.715q40.96-35.095 53.244-14.013M77.45 10.59q23.721 0 60.392 45.152a3.684 3.684 0 0 1-2.777 6.005h-.114l-1.288-.008q-15.431-.084-30.003 1.076q-17.202 1.37-35.925 4.687a3.684 3.684 0 0 1-4.234-2.81l-.024-.113l-.207-1.074Q53.204 10.59 77.45 10.59"/><path fill="#ffd94c" d="M111.295 73.67h31.576a12.89 12.89 0 0 1 11.181 6.475l15.855 27.626a12.89 12.89 0 0 1 0 12.834l-15.855 27.626a12.89 12.89 0 0 1-11.181 6.475h-31.576c-4.618 0-8.883-2.47-11.182-6.475L84.26 120.605a12.89 12.89 0 0 1 0-12.834l15.854-27.626a12.89 12.89 0 0 1 11.182-6.475m26.763 8.338c4.62 0 8.888 2.473 11.185 6.481l11.056 19.288a12.89 12.89 0 0 1 0 12.822l-11.056 19.288a12.89 12.89 0 0 1-11.185 6.48h-21.95c-4.62 0-8.888-2.472-11.185-6.48l-11.056-19.288a12.89 12.89 0 0 1 0-12.822l11.056-19.288a12.89 12.89 0 0 1 11.184-6.48zm-5.187 9.12h-11.576a12.89 12.89 0 0 0-11.179 6.47l-5.842 10.167a12.89 12.89 0 0 0 0 12.846l5.842 10.168a12.89 12.89 0 0 0 11.179 6.47h11.576c4.616 0 8.88-2.468 11.179-6.47l5.842-10.168a12.89 12.89 0 0 0 0-12.846l-5.842-10.168a12.89 12.89 0 0 0-11.179-6.47m-4.994 8.729c4.612 0 8.873 2.464 11.173 6.46l.829 1.44a12.89 12.89 0 0 1 0 12.862l-.829 1.44a12.89 12.89 0 0 1-11.173 6.46h-1.588a12.89 12.89 0 0 1-11.173-6.46l-.829-1.44a12.89 12.89 0 0 1 0-12.862l.829-1.44a12.89 12.89 0 0 1 11.173-6.46zm-.792 8.599a5.74 5.74 0 0 0-4.97 2.866a5.73 5.73 0 0 0 0 5.732a5.738 5.738 0 0 0 9.937 0a5.73 5.73 0 0 0 0-5.732a5.74 5.74 0 0 0-4.967-2.866m-46.509 5.732h10.32"/>',
      onDark: true,
    },
  },
  redis: toDiagramIcon(siRedis),
  tailwindcss: toDiagramIcon(siTailwindcss),
  tanstack: toDiagramIcon(siTanstack),
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
  // The simple-icons slug predates the product's rename to TanStack Query.
  reactquery: ["TanStack Query", "Query"],
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
