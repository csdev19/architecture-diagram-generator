# Colour Icons Design

**Status:** accepted, not yet implemented on `main`.
**Scope:** the brand-icon registry in `packages/domain`, the renderer's mark
drawing, the palette thumbnails, and one new diagram-level style option.

## Problem

Every brand mark is one SVG path in one colour. That is a property of the
registry's own shape — `{ title, path, hex }` — not of SVG, and it is what makes
the current Hono a silhouette, Drizzle's lime a near-black on a light tile, and
Angular's gradient logo impossible.

The constraint was inherited from `simple-icons`, which flattens every logo to
a single path so it can ship as data. That trade was right for shipping 22 marks
with no loader, no DOM and no bundler magic inside a Worker. It is wrong as the
ceiling: logos are multi-coloured, and a diagram tool whose logos are all
silhouettes reads as unfinished.

Two things stay true. The registry must remain plain data — the renderer is a
pure function that has to produce byte-identical output in the browser and in a
Worker. And the marks are drawn at 32px, which is the limit on detail that no
format changes: a 3D illustration is out of scope regardless of how it is
stored.

## Decision

### Colour art is an optional layer over a mandatory mono mark

```ts
interface DiagramIcon {
  title: string;
  /** Always present: simple-icons or a hand-drawn silhouette, one path in 24x24. */
  mono: { path: string; hex: string };
  /** Optional colour art, drawn as authored. */
  art?: { viewBox: string; body: string; onDark: boolean };
}
```

`mono` is what the registry holds today, renamed. Every existing entry
migrates as `mono: toDiagramIcon(siX)` and draws identically until it is given
`art`. `art.body` is the inner markup of an SVG — paths, groups, `<defs>` with
gradients — and `art.viewBox` is the box it was authored in.

Why a layer rather than a replacement: the mono mark is the one representation
that is guaranteed readable on either tile, because it passes through the
existing contrast rule. Near-black and near-white logos — GitHub, Effect, Better
Auth — are the most common marks in a developer diagram and the ones colour art
cannot help. Keeping `mono` mandatory means no icon can ever be added without a
legible fallback.

### Which mark is drawn is a function of style and tile

A new diagram-level option, `iconStyle`, with two values:

| `iconStyle`         | Light tile                                                                                 | Dark tile                                   |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `color` _(default)_ | `art` if present; else `mono` in brand hex if it passes the contrast gate, else near-black | `art` if `art.onDark`; else `mono` in white |
| `mono`              | `mono` in near-black. Never the brand hex, never `art`                                     | `mono` in white                             |

The author's choice is binary. "Black" and "white" are not options because the
tile already decides them: a black mark forced onto a dark tile vanishes, and
the point of a style setting is that it cannot be set wrong. An author who wants
a monochrome diagram picks `mono` and gets black on light and white on dark.

`onDark` is a per-icon judgment made by whoever curates the art, looking at it
at 32px on the dark tile. It is a boolean rather than a second piece of art
because no icon needs one yet; the shape does not preclude `dark?: Art` later.

`iconStyle` lives beside `background` in the document's `content` half: it is a
semantic choice about the drawing, it exports with it, and arranging must never
lose it. It is optional and defaults to `color`, so no existing document
changes. The AI guidelines do not mention it — the model chooses `iconKey`, and
how a key is coloured is the author's business.

### One helper draws every mark, everywhere

`renderIconMarkup(icon, tile, style, placement)` in the domain's render layer
returns a self-contained `<svg x y width height viewBox>` fragment: the mono
path inside a `0 0 24 24` box, or the art body inside its own box. A nested
`<svg>` rather than the current `<g transform>` because art has an arbitrary
viewBox and possibly a non-square aspect, and `preserveAspectRatio` handles
both where a computed scale would not.

Both consumers use it: the scene renderer, and the palette thumbnail (which
today draws its own `<path>` in React). The palette follows the diagram's
`iconStyle`, so what the author sees in the palette is what they will place.

### Ids inside art are prefixed with the icon's key

Every `id="…"` in an `art.body`, and every `url(#…)` or `href="#…"` referring
to one, is rewritten to `{key}-{n}` at curation time, numbered in order of first
appearance. Numbered rather than keeping the original name because sources do
not agree on one — iconify generates a fresh random id per request — and a
registry entry should come out the same every time it is regenerated. Two
different icons can then never share an id in one document; the same icon twice
in a diagram duplicates identical definitions, which every renderer resolves to
the first.

A registry test iterates every `art.body` and fails on an unprefixed id. That
test — not discipline — is what makes gradient logos safe.

### Curation is manual, and a script makes it mechanical

Sources are the brand's official SVG, a Figma export, or the body of an
`@iconify-json/logos` entry, copied — never a runtime dependency. A script,
`bun run icon:add <key> <file.svg>`, normalises any of them: extracts `viewBox`
and body, strips `width`, `height` and `xmlns`, prefixes ids, and prints an
`art` entry ready to paste. The curator pastes it, sets `onDark` by looking at
the result, and the registry tests do the rest.

The normaliser is a pure function in `src/tooling/`, tested like any other
domain code and shipped in no bundle. The CLI around it lives outside `src`,
because it reads files.

### The first three colour marks prove the model

- **Hono** — two flat fills, the inner flame the mono had to cut away.
- **Angular** — two `<linearGradient>` definitions, which is what the id rule
  exists for.
- **TanStack Query** — four flat fills and a non-square viewBox.

Plus **TanStack** and **Effect** as mono-only entries from `simple-icons`, whose
official emblems are monochrome. No other icons are added in this change.

## Alternatives rejected

- **Replace `mono` with art and compute a dark-tile fallback.** Throws away 22
  guaranteed-readable silhouettes; "dominant fill" is a heuristic that
  gradients, strokes and opacity break; and recolouring a body is a regex over
  `fill=` that cannot touch a gradient. GitHub on a dark tile has no clean
  answer under this model.
- **Full art per tile variant (`variants: { light, dark }`).** Matches how
  brand kits ship, and doubles curation for every icon. Not needed by any of
  the first three; `art.onDark` becomes `art.dark` if one ever does.
- **`@iconify-json/logos` as a dependency.** ~1900 logos as data, and the same
  admissibility argument as `simple-icons`. But it does not tree-shake (one
  JSON, no per-icon exports), coverage is uneven (no `tanstack`; a different
  Drizzle rendition), many entries are wordmarks rather than marks, and it
  leaves id collisions to the consumer. Used as a source to copy from, not as a
  package.
- **Embedded raster (`<image href="data:…">`).** Any artwork at all, and at
  32px it is mush — verified with the TanStack illustration. Soft at export,
  no tile adaptation, 3–30KB each shipped to the Worker, and brand
  illustrations are not licensed the way `simple-icons` is.
- **Three author-facing styles: black, white, colour.** Two of them are what
  the tile already decides; exposing them is exposing a way to make the mark
  invisible.

## Non-goals

User-supplied icon packs (the data shape is JSON-serialisable so a pack can be
an array of it, but no loader, dynamic schema or import UI is built); raster
marks; dedicated dark-tile art; tile sizes larger than today's; adding icons
beyond the five named above; any change to the AI guidelines or to
`z.enum(DIAGRAM_ICON_KEYS)`.

## What would reopen this

- A brand whose light and dark marks genuinely differ in shape, not just fill —
  that is the case for `art.dark`.
- A request for icons the author did not curate in the repo — that is the
  pack loader, and it starts with `iconKey` validation moving from a static
  enum to a runtime registry.
- PNG export failing on a nested `<svg>` or an inline gradient in some
  rasteriser. Both are plain SVG 1.1 and both rendered correctly through
  macOS's rasteriser during design; the browser path that PNG export actually
  uses is checked by hand in the plan's final task, and a server-side
  rasteriser would need its own check.
