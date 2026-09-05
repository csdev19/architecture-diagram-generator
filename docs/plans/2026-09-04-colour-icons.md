# Colour Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a brand mark be drawn in full colour — several fills, gradients, its
own viewBox — as an optional layer over the single-path mono mark every icon
keeps, with one diagram-level switch between colour and monochrome.

**Architecture:** The registry's `DiagramIcon` becomes `{ title, mono, art? }`.
One new helper, `renderIconMarkup`, decides which of the two to draw from the
tile and the diagram's `iconStyle`, and returns a nested `<svg>` fragment that
both the scene renderer and the palette thumbnail use. Art is curated by hand
through a script that normalises any SVG source and prefixes every id with the
icon's key, and a registry test enforces the prefix. Three icons get art to
prove the model; two more arrive mono-only.

**Tech Stack:** TypeScript, Bun, Zod, Vitest (jsdom in the app, node in the
domain), React 19, `simple-icons` 16.x as data.

**Spec:** `docs/specs/2026-09-04-colour-icons-design.md`

## Global Constraints

- **English only** in code, comments, tests, docs, commits, branch names and PR text.
- **`packages/domain/src` stays free of DOM and Node built-ins.** The renderer must produce byte-identical output in a browser and in a Cloudflare Worker. The one file that reads the filesystem — the `icon:add` CLI — lives in `packages/domain/scripts/`, outside `src`.
- **The dependency rule:** `domain` never imports from `application` or `infra-*`; the app imports domain only through its published subpaths (`@diagram-tool/domain/constants`, `/render`, `/schemas`).
- **Every existing icon must render byte-identically** after the registry refactor, until it is given `art`. `DIAGRAM_ICON_KEYS` stays alphabetical, lowercase, separator-free — a test enforces it.
- **Every `id="…"` inside an `art.body` is prefixed `{key}-`.** A test enforces it. No exceptions, no bare ids.
- **`iconStyle` defaults to `color`** and is optional in the document, so no existing document changes. The AI guidelines (`packages/domain/src/render/guidelines.ts`) do **not** mention it.
- **Exactly five icons are added:** `effect` and `tanstack` (mono only), and art for `hono`, `angular` and `reactquery` (TanStack Query, under its `simple-icons` slug). No others.
- **Commit format:** conventional commits. Scopes: `domain` for `packages/domain`, `editor` for the app's editor, `docs` for documentation.
- **Comments explain why, not what.** Both packages carry an unusually careful house style: full sentences naming the reason a line exists. Match it; the plan's code already carries the right comments — use them verbatim.
- **Every task is TDD.** The test is written and seen to fail before the implementation exists. For a pure refactor (Task 1) the red is the type checker, and the plan says so.
- **Test commands.** Domain, from `packages/domain/`: `bunx vitest run <path>`. App, from `apps/fullstack-fn-only/`: `bunx vitest run <path>`. Whole monorepo, from the root: `bun run check-types && bun run test && bun run lint`.
- **A pre-commit hook** (lint-staged + oxfmt) reformats staged files on commit. Expected; let it. **A pre-push hook** runs `format:check` over the whole tree — if it fails on files under `.superpowers/`, that is the SDD workspace, not the branch; delete the workspace before pushing.
- **Work lands as a PR.** Task 0 creates the branch; Task 9 opens the PR.

## Background an implementer needs

**The registry.** `packages/domain/src/constants/diagram-icons.ts` maps a key to
`{ title, path, hex }` today. `path` is one SVG path drawn in a 24×24 box;
`hex` is the brand colour without `#`. Twenty-one entries are `simple-icons`
re-exports narrowed through `toDiagramIcon`; one, `HONO_ICON`, is a hand-drawn
silhouette. `DIAGRAM_ICON_KEYS` is derived from the object's keys and feeds the
schema's `z.enum`, the AI guidelines, the palette and the inspector — so adding
an entry propagates everywhere with no second edit.

**The contrast rule.** `resolveDiagramIconFill(icon, tile)` returns the brand
hex on a light tile if it scores ≥ 2 against white, else near-black
(`#0f172a`); on a dark tile it always returns white. `resolveMonogramFill(tile)`
is the same two fallbacks without a brand colour.

**The renderer.** `renderSVG(config)` in `packages/domain/src/render/index.ts`
maps `config.nodes` through `renderNode(node)`, which calls `renderMark(node)`,
which today emits `<g transform="translate(…) scale(…)"><path …/></g>`. Geometry:
`DIAGRAM_GEOMETRY.ICON_SIZE = 32`, `ICON_VIEWBOX = 24`. A node's `x`/`y` is the
**centre** of its tile.

**Diagram-level style lives in `content`.** `background` (the paper tone) is the
precedent: a `z.enum(CANVAS_TONES)` in `diagramContentSchema`
(`schemas/diagram-document.ts`), mirrored in `resolvedDiagramShape`
(`schemas/diagram.ts`), carried across in `resolve.ts`, edited by
`setBackground` in the app's `edits/content-edits.ts`, and offered by
`DiagramPanel`. `iconStyle` follows the same path exactly.

**The palette.** `tile-catalog.ts` builds `BRAND_TILES` from the registry and
today copies `path` and a pre-resolved `fill` onto each tile; `TileThumbnail` in
`tile-palette.tsx` draws them as a React `<svg><path/></svg>`.

**Tooling conventions.** The domain's `tsconfig.json` includes only `src/**/*`
and its vitest only `src/**/*.test.ts`. A root `scripts/` directory holds
Bun-run scripts with their own minimal `tsconfig.json`; the domain's `scripts/`
directory created in Task 6 copies that shape. `tsdown` bundles only the entry
points named in `tsdown.config.ts`, so a module under `src/tooling/` is
type-checked and tested but ships in no bundle.

**Verifying art by eye.** jsdom cannot rasterise. To look at a mark at 32px,
write an SVG that places the icon markup on a white and a dark tile and open
it — on macOS `qlmanage -t -s 800 -o . file.svg` writes a PNG beside it. Task 7
gives the exact script.

---

## Task 0: Branch

**Files:** none.

- [ ] **Step 1: Start from `main`**

```bash
git checkout main && git pull --ff-only
git status --short
```

Expected: nothing modified under `apps/` or `packages/`. Two untracked files
under `docs/specs/` named `2026-09-03-ai-diagram-*` may appear — they predate
this work and are not committed here.

- [ ] **Step 2: Create the branch and commit the design and the plan**

```bash
git checkout -b feat/colour-icons
git add docs/specs/2026-09-04-colour-icons-design.md docs/plans/2026-09-04-colour-icons.md
git commit -m "docs(specs): design colour brand marks as a layer over the mono ones"
```

---

## Task 1: The registry holds a `mono` mark, and may hold `art`

A pure refactor: the shape changes, nothing renders differently. The type
checker is the failing test here — changing the interface first makes every
consumer fail to compile, and the task is done when they all compile and every
existing test passes untouched in behaviour.

**Files:**

- Modify: `packages/domain/src/constants/diagram-icons.ts` (the `DiagramIcon` interface, `toDiagramIcon`, `HONO_ICON`, `resolveDiagramIconFill`)
- Modify: `packages/domain/src/constants/index.ts:33-44` (export the two new types)
- Modify: `packages/domain/src/render/node.ts:41-52` (`icon.path` → `icon.mono.path`)
- Modify: `apps/fullstack-fn-only/src/components/editor/tile-catalog.ts:79-89` (`icon.path` → `icon.mono.path`)
- Test: `packages/domain/src/constants/__tests__/diagram-icons.test.ts`
- Test: `packages/domain/src/render/__tests__/render.test.ts:97-131`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:

  ```ts
  export interface DiagramIconMono { path: string; hex: string }
  export interface DiagramIconArt { viewBox: string; body: string; onDark: boolean }
  export interface DiagramIcon { title: string; mono: DiagramIconMono; art?: DiagramIconArt }
  ```

  `resolveDiagramIconFill(icon: DiagramIcon, tile: TileVariant): string` keeps its signature and reads `icon.mono.hex`.

- [ ] **Step 1: Update the registry tests to the new shape**

In `packages/domain/src/constants/__tests__/diagram-icons.test.ts`, inside
`it("resolves every curated key to a complete mark")`, replace the two field
assertions:

```ts
      expect(icon.mono.hex, `"${key}" has a malformed hex`).toMatch(/^[0-9a-f]{6}$/i);
      expect(icon.mono.path.length, `"${key}" has an empty path`).toBeGreaterThan(0);
```

In `it("carries path data an SVG renderer can draw")`:

```ts
      expect(DIAGRAM_ICONS[key].mono.path, `"${key}" is not SVG path data`).toMatch(/^[Mm]/);
```

In `it("keeps a brand colour that reads on white")`:

```ts
    expect(resolveDiagramIconFill(DIAGRAM_ICONS.cloudflare, TILE_VARIANTS.LIGHT)).toBe(
      `#${DIAGRAM_ICONS.cloudflare.mono.hex}`,
    );
```

Then add a new test at the end of the `describe("DIAGRAM_ICONS", …)` block:

```ts
  it("prefixes every id inside colour art with the icon's own key", () => {
    // Art is inlined into one SVG document per diagram, so two icons that both
    // ship an `id="a"` gradient would silently draw with each other's colours.
    // The prefix is what makes that impossible; this is the test that keeps it.
    for (const key of DIAGRAM_ICON_KEYS) {
      const art = DIAGRAM_ICONS[key].art;
      if (!art) continue;
      for (const [, id] of art.body.matchAll(/\bid="([^"]+)"/g)) {
        expect(id, `"${key}" carries an unprefixed id`).toMatch(new RegExp(`^${key}-`));
      }
      expect(art.viewBox, `"${key}" has a malformed viewBox`).toMatch(
        /^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/,
      );
    }
  });
```

- [ ] **Step 2: Update the render tests to the new shape**

In `packages/domain/src/render/__tests__/render.test.ts`, inside
`describe("brand icons")`, replace every `DIAGRAM_ICONS.hono.path` with
`DIAGRAM_ICONS.hono.mono.path`, every `DIAGRAM_ICONS.hono.hex` with
`DIAGRAM_ICONS.hono.mono.hex`, and likewise for `react` (`.path` → `.mono.path`,
`.hex` → `.mono.hex`). There are seven occurrences between lines 97 and 131. Do
not touch the scaling test at line 132 yet — Task 4 replaces it.

- [ ] **Step 3: Run the domain tests to see the type errors**

Run, from `packages/domain/`:

```bash
bunx vitest run src/constants/__tests__/diagram-icons.test.ts src/render/__tests__/render.test.ts
```

Expected: FAIL. Vitest transpiles without type-checking, so the failures are
runtime: `Cannot read properties of undefined (reading 'hex')` and similar —
`icon.mono` does not exist yet.

- [ ] **Step 4: Change the registry's shape**

In `packages/domain/src/constants/diagram-icons.ts`, replace the `DiagramIcon`
interface and `toDiagramIcon`:

```ts
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
```

Change `HONO_ICON` to the new shape, keeping its comment block as it is:

```ts
const HONO_ICON: DiagramIcon = {
  title: "Hono",
  mono: {
    path:
      "M5.388 6.122l1.714 2.205s2.204-4.408 5.388-8.327c4.163 4.898 8.816 11.755 8.816 15.673 " +
      "0 4.898-4.653 8.327-9.061 8.327C6.857 24 2.694 19.837 2.694 14.939c0-1.469 0.735-5.878 2.694-8.817Z",
    hex: "E36002",
  },
};
```

In `resolveDiagramIconFill`, read the hex through `mono`:

```ts
  const readable =
    contrastRatio(icon.mono.hex, DIAGRAM_COLORS.TILE_LIGHT_FILL) >= DIAGRAM_ICON_CONTRAST_MIN;
  return readable ? `#${icon.mono.hex}` : DIAGRAM_COLORS.TILE_DARK_FILL;
```

Also update the module's top comment: replace the sentence
`` `simple-icons` ships every mark as plain data — a title, a single SVG path authored in a 24x24 viewBox, and the official brand hex — which is why it is admissible in the domain `` with:

```
 * `simple-icons` ships every mark as plain data — a title, a single SVG path
 * authored in a 24x24 viewBox, and the official brand hex — which is why it is
 * admissible in the domain where an `.svg` asset folder would not be: there is
 * no loader, no bundler magic and no DOM, so this works unchanged inside a
 * Cloudflare Worker. That single path is every icon's `mono` mark. An icon may
 * also carry `art` — colour, several fills, gradients — curated by hand from the
 * brand's own SVG; the mono mark stays, because it is the one that is readable
 * on any tile.
```

(keeping the rest of that comment as it was).

- [ ] **Step 5: Export the new types**

In `packages/domain/src/constants/index.ts`, extend the `diagram-icons` export
block:

```ts
  type DiagramIcon,
  type DiagramIconArt,
  type DiagramIconMono,
  type DiagramIconKey,
```

- [ ] **Step 6: Update the two readers**

In `packages/domain/src/render/node.ts`, line 49:

```ts
      `<path d="${escapeXml(icon.mono.path)}" fill="${resolveDiagramIconFill(icon, node.tile)}"/>` +
```

In `apps/fullstack-fn-only/src/components/editor/tile-catalog.ts`, line 86:

```ts
    path: icon.mono.path,
```

- [ ] **Step 7: Type-check the monorepo and run both suites**

Run, from the root:

```bash
bun run check-types
```

Expected: 6/6 tasks successful. If it names any other reader of `.path` or
`.hex`, update it the same way — but the grep behind this plan found only the
two above.

Run, from `packages/domain/`:

```bash
bunx vitest run
```

Expected: PASS, every test. The new id-prefix test passes vacuously — no icon
has art yet — and Task 7 gives it something to check.

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/constants/diagram-icons.ts packages/domain/src/constants/index.ts packages/domain/src/render/node.ts apps/fullstack-fn-only/src/components/editor/tile-catalog.ts packages/domain/src/constants/__tests__/diagram-icons.test.ts packages/domain/src/render/__tests__/render.test.ts
git commit -m "refactor(domain): give every brand mark a mono half, so colour art has somewhere to go"
```

---

## Task 2: TanStack and Effect, mono only

Two marks whose official emblems are monochrome, so `simple-icons` is the
whole story. Both fail the light-tile contrast gate — TanStack's `ECE8D1`
scores 1.23, Effect's `FFFFFF` scores 1.00 — and fall back to near-black, which
is the correct rendering and the same thing that already happens to Better
Auth.

**Files:**

- Modify: `packages/domain/src/constants/diagram-icons.ts` (the import list and `DIAGRAM_ICONS`)
- Test: `packages/domain/src/constants/__tests__/diagram-icons.test.ts`

**Interfaces:**

- Consumes: `DiagramIcon` from Task 1.
- Produces: registry keys `effect` and `tanstack`.

- [ ] **Step 1: Write the failing test**

Add to the `describe("resolveDiagramIconFill", …)` block:

```ts
  it("draws the monochrome emblems near-black on a light tile", () => {
    // TanStack's emblem is off-white and Effect's is white: both official marks
    // are designed to sit on a dark plate, and both vanish on paper. The
    // silhouette is what identifies them, which is exactly what the fallback keeps.
    for (const key of ["tanstack", "effect"] as const) {
      expect(resolveDiagramIconFill(DIAGRAM_ICONS[key], TILE_VARIANTS.LIGHT)).toBe(
        DIAGRAM_COLORS.TILE_DARK_FILL,
      );
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `packages/domain/`:

```bash
bunx vitest run src/constants/__tests__/diagram-icons.test.ts -t "monochrome emblems"
```

Expected: FAIL — `DIAGRAM_ICONS.tanstack` is undefined.

- [ ] **Step 3: Add the two entries**

In `diagram-icons.ts`, add to the `simple-icons` import, keeping it alphabetical:

```ts
  siEffect,
```

between `siDrizzle` and `siExpo`, and

```ts
  siTanstack,
```

between `siTailwindcss` and `siTurborepo`.

In `DIAGRAM_ICONS`, add

```ts
  effect: toDiagramIcon(siEffect),
```

between `drizzle` and `expo`, and

```ts
  tanstack: toDiagramIcon(siTanstack),
```

between `tailwindcss` and `turborepo`. The alphabetical-order test fails if
either lands anywhere else.

- [ ] **Step 4: Run the domain suite**

Run, from `packages/domain/`:

```bash
bunx vitest run
```

Expected: PASS. The guidelines drift test passes on its own because the
guidelines interpolate `DIAGRAM_ICON_KEYS`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/constants/diagram-icons.ts packages/domain/src/constants/__tests__/diagram-icons.test.ts
git commit -m "feat(domain): add tanstack and effect to the brand-mark registry"
```

---

## Task 3: `iconStyle` in the document

The author's switch. It follows `background` through every layer: a constant,
the content schema, the resolved schema, and `resolveDiagram`. Nothing draws
differently yet — Task 4 reads it.

**Files:**

- Modify: `packages/domain/src/constants/diagram.ts` (after `CANVAS_TONES`, around line 94)
- Modify: `packages/domain/src/constants/index.ts` (export `ICON_STYLES`, `IconStyle`)
- Modify: `packages/domain/src/schemas/diagram-document.ts:73-78` (`diagramContentSchema`)
- Modify: `packages/domain/src/schemas/diagram.ts:227` (`resolvedDiagramShape`)
- Modify: `packages/domain/src/render/resolve.ts:200` (carry it across)
- Test: `packages/domain/src/render/__tests__/resolve.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:

  ```ts
  export const ICON_STYLES = { COLOR: "color", MONO: "mono" } as const;
  export type IconStyle = "color" | "mono";
  ```

  `ResolvedDiagram.iconStyle?: IconStyle`; document `content.iconStyle?: IconStyle`.

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/render/__tests__/resolve.test.ts`, after
`it("carries the paper tone and a fixed canvas across")`:

```ts
  it("carries the icon style across, and leaves it out when the document does", () => {
    const document = example();
    expect(resolveDiagram(diagramDocumentSchema.parse(document))).not.toHaveProperty("iconStyle");

    document.content.iconStyle = "mono";
    expect(resolveDiagram(diagramDocumentSchema.parse(document)).iconStyle).toBe("mono");
  });

  it("rejects an icon style the renderer does not know", () => {
    const document = example();
    (document.content as Record<string, unknown>).iconStyle = "sepia";

    expect(() => diagramDocumentSchema.parse(document)).toThrow();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run, from `packages/domain/`:

```bash
bunx vitest run src/render/__tests__/resolve.test.ts -t "icon style"
```

Expected: FAIL. The first fails because `iconStyle` is stripped by the schema
(unknown key) and `resolved.iconStyle` is undefined; the second fails because
the schema does not reject a key it does not know.

- [ ] **Step 3: Add the constant**

In `packages/domain/src/constants/diagram.ts`, after `export type CanvasTone`:

```ts
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
```

In `packages/domain/src/constants/index.ts`, add `ICON_STYLES,` to the value
exports from `./diagram` (beside `CANVAS_TONES`) and `type IconStyle,` to the
type exports there.

- [ ] **Step 4: Add it to both schemas and carry it across**

In `packages/domain/src/schemas/diagram-document.ts`, import `ICON_STYLES`
beside `CANVAS_TONES`, then in `diagramContentSchema` after `background`:

```ts
  /**
   * Whether marks are drawn in colour or as silhouettes. Content for the same
   * reason the paper tone is: it exports with the drawing, and arranging must
   * never lose it.
   */
  iconStyle: z.enum(ICON_STYLES).optional(),
```

In `packages/domain/src/schemas/diagram.ts`, import `ICON_STYLES` beside
`CANVAS_TONES`, then in `resolvedDiagramShape` after `background`:

```ts
  iconStyle: z.enum(ICON_STYLES).optional(),
```

In `packages/domain/src/render/resolve.ts`, in the returned object after the
`background` spread:

```ts
    ...(content.iconStyle ? { iconStyle: content.iconStyle } : {}),
```

- [ ] **Step 5: Run the domain suite and type-check**

Run, from `packages/domain/`:

```bash
bunx vitest run
```

Expected: PASS.

Run, from the root:

```bash
bun run check-types
```

Expected: 6/6.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/constants/diagram.ts packages/domain/src/constants/index.ts packages/domain/src/schemas/diagram-document.ts packages/domain/src/schemas/diagram.ts packages/domain/src/render/resolve.ts packages/domain/src/render/__tests__/resolve.test.ts
git commit -m "feat(domain): let a document choose colour or mono for its brand marks"
```

---

## Task 4: One helper draws every mark

`renderIconMarkup` is the whole decision table from the spec in one function,
returning a nested `<svg>`. The scene renderer switches to it here; the palette
switches in Task 5.

**Files:**

- Create: `packages/domain/src/render/icon-markup.ts`
- Create: `packages/domain/src/render/__tests__/icon-markup.test.ts`
- Modify: `packages/domain/src/render/node.ts` (imports; `renderMark`; `renderNode` gains a parameter)
- Modify: `packages/domain/src/render/index.ts:45-52` (`renderSVG` threads the style; export the helper)
- Test: `packages/domain/src/render/__tests__/render.test.ts:132-147`

**Interfaces:**

- Consumes: `DiagramIcon`, `DiagramIconArt` (Task 1); `ICON_STYLES`, `IconStyle` (Task 3); `resolveDiagramIconFill`, `resolveMonogramFill` (existing).
- Produces:

  ```ts
  export interface IconPlacement { x: number; y: number; size: number }
  export const renderIconMarkup = (
    icon: DiagramIcon, tile: TileVariant, style: IconStyle, place: IconPlacement,
  ): string;
  ```

  exported from `@diagram-tool/domain/render`. `renderNode(node, iconStyle)`.

- [ ] **Step 1: Write the failing helper tests**

Create `packages/domain/src/render/__tests__/icon-markup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, ICON_STYLES, TILE_VARIANTS } from "../../constants/diagram";
import type { DiagramIcon } from "../../constants/diagram-icons";
import { renderIconMarkup } from "../icon-markup";

/**
 * Fixtures rather than registry entries: the table under test is about what
 * the helper does with an icon's shape, and a registry entry can gain art at
 * any time and quietly change which row a test is exercising.
 */
const SQUARE = "M0 0h24v24H0z";

/** Cloudflare's orange, which scores 2.65 against the light tile. */
const readable: DiagramIcon = { title: "Readable", mono: { path: SQUARE, hex: "f38020" } };
/** Pure white, which scores 1.00 and must fall back. */
const faint: DiagramIcon = { title: "Faint", mono: { path: SQUARE, hex: "ffffff" } };

const ART_BODY = '<rect width="10" height="10" fill="#ff0000"/>';
const withArt: DiagramIcon = {
  ...readable,
  art: { viewBox: "0 0 10 10", body: ART_BODY, onDark: true },
};
const artNotOnDark: DiagramIcon = {
  ...readable,
  art: { viewBox: "0 0 10 10", body: ART_BODY, onDark: false },
};

const at = { x: 4, y: 6, size: 32 };
const draw = (icon: DiagramIcon, tile: "light" | "dark", style: "color" | "mono") =>
  renderIconMarkup(icon, tile, style, at);

describe("renderIconMarkup", () => {
  it("places the mark as a nested svg of the requested size", () => {
    const svg = draw(readable, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

    expect(svg).toMatch(/^<svg x="4" y="6" width="32" height="32" /);
    expect(svg).toMatch(/<\/svg>$/);
  });

  describe("in colour", () => {
    it("draws the mono mark in its brand colour when that reads on a light tile", () => {
      const svg = draw(readable, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain(`<path d="${SQUARE}" fill="#f38020"/>`);
    });

    it("draws the mono mark near-black when the brand colour would vanish on a light tile", () => {
      const svg = draw(faint, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_DARK_FILL}"`);
    });

    it("draws the mono mark in white on a dark tile", () => {
      const svg = draw(readable, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"`);
      expect(svg).not.toContain("#f38020");
    });

    it("draws the art, in its own viewBox, on a light tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR);

      expect(svg).toContain('viewBox="0 0 10 10"');
      expect(svg).toContain(ART_BODY);
      expect(svg).not.toContain("<path d=");
    });

    it("draws the art on a dark tile when it was judged to read there", () => {
      const svg = draw(withArt, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).toContain(ART_BODY);
    });

    it("falls back to the mono mark in white on a dark tile when the art was not", () => {
      const svg = draw(artNotOnDark, TILE_VARIANTS.DARK, ICON_STYLES.COLOR);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`<path d="${SQUARE}" fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"/>`);
    });
  });

  describe("in mono", () => {
    it("ignores the art and the brand colour on a light tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.LIGHT, ICON_STYLES.MONO);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`<path d="${SQUARE}" fill="${DIAGRAM_COLORS.TILE_DARK_FILL}"/>`);
    });

    it("draws the silhouette in white on a dark tile", () => {
      const svg = draw(withArt, TILE_VARIANTS.DARK, ICON_STYLES.MONO);

      expect(svg).not.toContain(ART_BODY);
      expect(svg).toContain(`fill="${DIAGRAM_COLORS.TILE_LIGHT_FILL}"`);
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run, from `packages/domain/`:

```bash
bunx vitest run src/render/__tests__/icon-markup.test.ts
```

Expected: FAIL — `Cannot find module '../icon-markup'`.

- [ ] **Step 3: Write the helper**

Create `packages/domain/src/render/icon-markup.ts`:

```ts
import { DIAGRAM_GEOMETRY, ICON_STYLES, TILE_VARIANTS } from "../constants/diagram";
import type { IconStyle, TileVariant } from "../constants/diagram";
import { resolveDiagramIconFill, resolveMonogramFill } from "../constants/diagram-icons";
import type { DiagramIcon } from "../constants/diagram-icons";
import { escapeXml, num } from "./svg";

/** Where a mark goes: its top-left corner and its side, in the parent's units. */
export interface IconPlacement {
  x: number;
  y: number;
  size: number;
}

/**
 * The one place a brand mark is drawn.
 *
 * Returns a nested `<svg>` rather than a transformed `<g>`: colour art comes in
 * whatever viewBox the brand authored it in, square or not, and a nested svg
 * with `preserveAspectRatio` fits any of them into the tile where a computed
 * scale would fit only the square ones. The mono mark goes through the same
 * element so that the renderer and the palette cannot drift apart.
 *
 * Which of the two is drawn is the whole of the style decision, in one table:
 *
 * - `mono`: the silhouette, in the tile's opposite colour. Never the brand hex,
 *   never the art. The author asked for a monochrome diagram.
 * - `color`, light tile: the art if there is any, else the silhouette in its
 *   brand colour when that reads on paper, else near-black.
 * - `color`, dark tile: the art if it was judged to read there, else the
 *   silhouette in white.
 */
export const renderIconMarkup = (
  icon: DiagramIcon,
  tile: TileVariant,
  style: IconStyle,
  place: IconPlacement,
): string => {
  const open =
    `<svg x="${num(place.x)}" y="${num(place.y)}" ` +
    `width="${num(place.size)}" height="${num(place.size)}" `;

  const art = style === ICON_STYLES.COLOR ? icon.art : undefined;
  if (art && (tile === TILE_VARIANTS.LIGHT || art.onDark)) {
    // The body is trusted registry markup, not text: it is inlined verbatim.
    return `${open}viewBox="${escapeXml(art.viewBox)}">${art.body}</svg>`;
  }

  const { ICON_VIEWBOX } = DIAGRAM_GEOMETRY;
  const fill =
    style === ICON_STYLES.MONO ? resolveMonogramFill(tile) : resolveDiagramIconFill(icon, tile);
  return (
    `${open}viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}">` +
    `<path d="${escapeXml(icon.mono.path)}" fill="${fill}"/></svg>`
  );
};
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run, from `packages/domain/`:

```bash
bunx vitest run src/render/__tests__/icon-markup.test.ts
```

Expected: PASS, all nine.

- [ ] **Step 5: Update the renderer's scaling test to the nested-svg form**

In `packages/domain/src/render/__tests__/render.test.ts`, replace the test
`it("scales the 24px mark to the geometry's icon size and centres it on the tile")`
(lines 132–139) with:

```ts
    it("places the mark as a nested svg of the geometry's icon size, centred on the tile", () => {
      const { ICON_SIZE, ICON_VIEWBOX } = DIAGRAM_GEOMETRY;
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono" }));

      // The node sits at (350, 180), so the mark's top-left is half its size up and left.
      expect(svg).toContain(
        `<svg x="${num(350 - ICON_SIZE / 2)}" y="${num(180 - ICON_SIZE / 2)}" ` +
          `width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}">`,
      );
    });
```

And in `it("leaves an emoji-only node exactly as it was")`, replace the
`scale(` assertion:

```ts
      expect(svg, "an emoji node must not carry an icon boundary").not.toContain(
        `height="${DIAGRAM_GEOMETRY.ICON_SIZE}" viewBox=`,
      );
```

Then add, inside `describe("brand icons")`, after the dark-tile test. The file's
`render` helper parses a `ResolvedDiagramInput` through `resolvedDiagramSchema`,
and `singleNode()` builds one, so the style is a spread away:

```ts
    it("draws every mark as a silhouette when the document asks for mono", () => {
      const svg = render({
        ...singleNode({ emoji: undefined, iconKey: "cloudflare", tile: "light" }),
        iconStyle: "mono",
      });

      // Cloudflare's orange reads on paper and is drawn in colour by default;
      // under `mono` no brand colour survives.
      expect(svg).toContain(DIAGRAM_ICONS.cloudflare.mono.path);
      expect(svg).not.toContain(`fill="#${DIAGRAM_ICONS.cloudflare.mono.hex}"`);
    });
```

- [ ] **Step 6: Run the render tests to verify the new ones fail**

Run, from `packages/domain/`:

```bash
bunx vitest run src/render/__tests__/render.test.ts
```

Expected: the nested-svg placement test FAILS (the renderer still emits
`<g transform`), and the mono test FAILS (the brand colour is still drawn).

- [ ] **Step 7: Switch the renderer to the helper**

In `packages/domain/src/render/node.ts`, change the imports: remove
`resolveDiagramIconFill` from the `diagram-icons` import (keep `DIAGRAM_ICONS`
and `resolveMonogramFill`; `ICON_STYLES` is not needed in this file), and add:

```ts
import type { IconStyle } from "../constants/diagram";
import { renderIconMarkup } from "./icon-markup";
```

Replace the `iconKey` branch of `renderMark`, and give it the style:

```ts
const renderMark = (node: DiagramNode, iconStyle: IconStyle): string => {
  if (node.iconKey) {
    const { ICON_SIZE } = DIAGRAM_GEOMETRY;
    const offset = ICON_SIZE / 2;
    return renderIconMarkup(DIAGRAM_ICONS[node.iconKey], node.tile, iconStyle, {
      x: node.x - offset,
      y: node.y - offset,
      size: ICON_SIZE,
    });
  }
```

(the `initials` and `emoji` branches are unchanged). Then `renderNode`:

```ts
export const renderNode = (node: DiagramNode, iconStyle: IconStyle): string => {
```

and inside it `const mark = renderMark(node, iconStyle);`.

In `packages/domain/src/render/index.ts`, import `ICON_STYLES` beside
`CANVAS_TONES`, and in `renderSVG` replace the nodes line:

```ts
  // One style for every mark: it is a property of the drawing, not of a tile.
  const iconStyle = config.iconStyle ?? ICON_STYLES.COLOR;
  const nodes = config.nodes.map((node) => renderNode(node, iconStyle)).join("");
```

Add to the export list at the bottom of `index.ts`:

```ts
export { renderIconMarkup } from "./icon-markup";
export type { IconPlacement } from "./icon-markup";
```

- [ ] **Step 8: Run the whole domain suite, update the snapshot, type-check**

Run, from `packages/domain/`:

```bash
bunx vitest run
```

Expected: everything passes **except** `matches the reference rendering of the
canonical example` in `render.test.ts`, which is a snapshot of the seed
diagram's SVG and changes by design: every mark's `<g transform="translate(…)
scale(…)">` became `<svg x=… y=… width="32" height="32" viewBox="0 0 24 24">`.
Read the diff vitest prints. If it shows **only** that substitution, per mark,
update the snapshot:

```bash
bunx vitest run src/render/__tests__/render.test.ts -u
bunx vitest run
```

Expected: PASS. If the diff shows anything else — a tile, a label, an edge —
stop: something other than the mark changed, and that is a bug.

Run, from the root:

```bash
bun run check-types
```

Expected: 6/6. `noUnusedLocals` will flag `resolveDiagramIconFill` in
`node.ts` if the import was left behind — remove it.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/render/icon-markup.ts packages/domain/src/render/__tests__/icon-markup.test.ts packages/domain/src/render/node.ts packages/domain/src/render/index.ts packages/domain/src/render/__tests__/render.test.ts packages/domain/src/render/__tests__/__snapshots__
git commit -m "feat(domain): draw every brand mark through one helper that knows about colour art"
```

---

## Task 5: The palette draws what the renderer draws

The thumbnail stops carrying its own `<path>` and asks the helper instead, so a
mark looks the same in the palette as on the canvas — including under `mono`.

**Files:**

- Modify: `apps/fullstack-fn-only/src/components/editor/tile-catalog.ts` (`BrandTile`, `BRAND_TILES`)
- Modify: `apps/fullstack-fn-only/src/components/editor/tile-palette.tsx` (`TileThumbnail`, `TileCard`, `TilePalette`)
- Modify: `apps/fullstack-fn-only/src/components/editor/editor-page.tsx:618` (pass the style)
- Test: `apps/fullstack-fn-only/src/components/editor/__tests__/editing-panels.test.tsx`

**Interfaces:**

- Consumes: `renderIconMarkup`, `IconPlacement` from `@diagram-tool/domain/render` (Task 4); `ICON_STYLES`, `IconStyle`, `DIAGRAM_ICONS`, `TILE_VARIANTS` from `@diagram-tool/domain/constants`.
- Produces: `TilePalette` gains a required prop `iconStyle: IconStyle`. `BrandTile` loses `path` and `fill`.

- [ ] **Step 1: Write the failing test**

In `apps/fullstack-fn-only/src/components/editor/__tests__/editing-panels.test.tsx`,
inside `describe("tile palette", …)`:

```tsx
  it("draws each brand mark through the renderer's own helper", () => {
    render(<EditorPage />);

    // The card is what the author is about to place, so it has to be the
    // renderer's mark and not a second drawing of it. The nested svg with the
    // mono viewBox is the helper's signature; a hand-rolled `<path>` has none.
    // `width`/`height` are the tell: the helper sets them from its placement,
    // and the React thumbnail this replaces never did.
    const card = paletteCard(/^hono$/i);
    expect(card.querySelector('svg[width="22"][height="22"] > path')).not.toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run src/components/editor/__tests__/editing-panels.test.tsx -t "renderer's own helper"
```

Expected: FAIL — the thumbnail's svg has no `width` attribute.

- [ ] **Step 3: Slim the catalogue entry**

In `tile-catalog.ts`, `BrandTile` loses `path` and `fill`:

```ts
export interface BrandTile {
  kind: "icon";
  /** Stable identity within the palette, and the seed for a placed node's id. */
  key: string;
  /** Human name, and the `name` a freshly placed node gets. */
  label: string;
  iconKey: DiagramIconKey;
}
```

and `BRAND_TILES` no longer computes them:

```ts
const BRAND_TILES: BrandTile[] = DIAGRAM_ICON_KEYS.map((iconKey) => ({
  kind: "icon",
  key: iconKey,
  label: LABEL_OVERRIDES[iconKey] ?? DIAGRAM_ICONS[iconKey].title,
  iconKey,
}));
```

Remove `resolveDiagramIconFill` from this file's imports; nothing uses it now.
`resolveMonogramFill` and `TILE_VARIANTS` are still used by `INITIALS_TILES` —
keep those.

- [ ] **Step 4: Let the thumbnail ask the helper**

In `tile-palette.tsx`, add imports:

```ts
import { DIAGRAM_ICONS, TILE_VARIANTS } from "@diagram-tool/domain/constants";
import type { IconStyle } from "@diagram-tool/domain/constants";
import { renderIconMarkup } from "@diagram-tool/domain/render";
```

Replace `TileThumbnail`:

```tsx
/** The mark's side inside the 40px thumbnail; the same ratio the tile keeps. */
const THUMBNAIL_MARK = 22;

function TileThumbnail({ tile, iconStyle }: { tile: PaletteTile; iconStyle: IconStyle }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border"
      style={THUMBNAIL_STYLE}
    >
      {tile.kind === "icon" ? (
        // The renderer's own markup, so the card and the canvas cannot disagree
        // about a mark — including which of its two halves the style picks.
        <span
          className="flex"
          dangerouslySetInnerHTML={{
            __html: renderIconMarkup(DIAGRAM_ICONS[tile.iconKey], TILE_VARIANTS.LIGHT, iconStyle, {
              x: 0,
              y: 0,
              size: THUMBNAIL_MARK,
            }),
          }}
        />
      ) : tile.kind === "initials" ? (
        <span className="text-[15px] leading-none font-bold" style={{ color: tile.fill }}>
          {tile.initials}
        </span>
      ) : (
        <span className="text-[19px] leading-none">{tile.emoji}</span>
      )}
    </span>
  );
}
```

Thread the style through `TileCard` — add `iconStyle: IconStyle` to its props
and pass `<TileThumbnail tile={tile} iconStyle={iconStyle} />` — and through
`TilePalette`:

```ts
interface TilePaletteProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  /** The diagram's own setting, so the palette previews what will be placed. */
  iconStyle: IconStyle;
}
```

Every `<TileCard …/>` inside `TilePalette` gains `iconStyle={iconStyle}`.

- [ ] **Step 5: Pass it from the page**

In `editor-page.tsx`, import `ICON_STYLES` from `@diagram-tool/domain/constants`
(check whether the file already imports from that module and extend that
import), and at the `<TilePalette` element add:

```tsx
          iconStyle={shown.diagram.iconStyle ?? ICON_STYLES.COLOR}
```

- [ ] **Step 6: Run the app suite and type-check**

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run
```

Expected: PASS.

Run, from the root:

```bash
bun run check-types
```

Expected: 6/6.

- [ ] **Step 7: Commit**

```bash
git add apps/fullstack-fn-only/src/components/editor/tile-catalog.ts apps/fullstack-fn-only/src/components/editor/tile-palette.tsx apps/fullstack-fn-only/src/components/editor/editor-page.tsx apps/fullstack-fn-only/src/components/editor/__tests__/editing-panels.test.tsx
git commit -m "feat(editor): draw palette thumbnails with the renderer's mark helper"
```

---

## Task 6: `icon:add` — normalising any SVG into an `art` entry

A pure normaliser in `src/tooling/`, tested like domain code, and a thin Bun
CLI around it outside `src`.

**Files:**

- Create: `packages/domain/src/tooling/icon-art.ts`
- Create: `packages/domain/src/tooling/__tests__/icon-art.test.ts`
- Create: `packages/domain/scripts/icon-add.ts`
- Create: `packages/domain/scripts/tsconfig.json`
- Modify: `package.json` (root — one script)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:

  ```ts
  export const normaliseIconArt = (key: string, svg: string): { viewBox: string; body: string };
  ```

  and the root script `bun run icon:add <key> [file.svg]` (reads stdin without a file).

- [ ] **Step 1: Write the failing tests**

Create `packages/domain/src/tooling/__tests__/icon-art.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normaliseIconArt } from "../icon-art";

/** Roughly what a brand's own SVG, or an iconify body, looks like on arrival. */
const SOURCE = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1.12em" height="1em" viewBox="0 0 256 230">
  <defs>
    <linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#f00"/></linearGradient>
    <clipPath id="ab"><rect width="10" height="10"/></clipPath>
  </defs>
  <path fill="url(#a)" clip-path="url(#ab)" d="M0 0h10v10H0z"/>
  <use href="#a"/>
</svg>
`;

describe("normaliseIconArt", () => {
  it("keeps the viewBox and drops the root element with its sizing", () => {
    const { viewBox, body } = normaliseIconArt("acme", SOURCE);

    expect(viewBox).toBe("0 0 256 230");
    expect(body).not.toContain("<svg");
    expect(body).not.toContain("</svg>");
    expect(body).not.toContain("<?xml");
    expect(body).not.toContain("width=\"1.12em\"");
  });

  it("renumbers every id under the key, in order of appearance, with every reference", () => {
    // Numbered rather than kept: sources do not agree on names — iconify hands
    // out a fresh random id per request — and a regenerated entry has to come
    // out identical, or every re-run of the script is a spurious diff.
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).toContain('id="acme-0"');
    expect(body).toContain('id="acme-1"');
    expect(body).toContain('fill="url(#acme-0)"');
    expect(body).toContain('clip-path="url(#acme-1)"');
    expect(body).toContain('href="#acme-0"');
    expect(body).not.toMatch(/\bid="a"/);
    expect(body).not.toMatch(/\bid="ab"/);
  });

  it("does not let a short id rewrite the inside of a longer one", () => {
    // `a` is a prefix of `ab`; replacing `a` first would leave `ab` as `acme-0b`.
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).not.toContain("acme-0b");
    expect(body.match(/acme-1/g)).toHaveLength(2);
  });

  it("collapses whitespace so the body is one line to paste", () => {
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).not.toContain("\n");
    expect(body).not.toMatch(/>\s+</);
  });

  it("refuses a document without a viewBox, which cannot be scaled into a tile", () => {
    expect(() => normaliseIconArt("acme", "<svg><path d=\"M0 0\"/></svg>")).toThrow(/viewBox/);
  });

  it("refuses text that is not an svg at all", () => {
    expect(() => normaliseIconArt("acme", "<html></html>")).toThrow(/<svg>/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run, from `packages/domain/`:

```bash
bunx vitest run src/tooling/__tests__/icon-art.test.ts
```

Expected: FAIL — `Cannot find module '../icon-art'`.

- [ ] **Step 3: Write the normaliser**

Create `packages/domain/src/tooling/icon-art.ts`:

```ts
/**
 * Turns any SVG document into the `art` half of a registry entry.
 *
 * Tooling, not runtime: this is what `bun run icon:add` calls, and it ships in
 * no bundle. It lives under `src` so it is type-checked and tested like the
 * code it feeds, and it uses nothing but strings so it could run anywhere.
 *
 * Three things happen to the source. The root `<svg>` element goes, taking its
 * `width`/`height`/`xmlns` with it — the tile decides the size. Every `id` is
 * renumbered `{key}-{n}` in order of appearance, along with every `url(#…)` and
 * `href="#…"` that names one: a diagram inlines every mark into one document,
 * so two brands that both called their gradient `a` would swap colours — and
 * the number rather than the name because sources hand out random ids, and a
 * regenerated entry must come out identical. And the whitespace collapses, so
 * the body is one line a person can paste.
 */
export const normaliseIconArt = (key: string, svg: string): { viewBox: string; body: string } => {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open || open.index === undefined) throw new Error("not an SVG document: no <svg> element");

  const viewBox = open[0].match(/\bviewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error("the <svg> element has no viewBox to scale from");

  const close = svg.lastIndexOf("</svg>");
  let body = svg.slice(open.index + open[0].length, close === -1 ? undefined : close);

  const ids = [...new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? ""))]
    .filter((id) => id.length > 0);
  const renamed = new Map(ids.map((id, index) => [id, `${key}-${index}`]));

  // Longest first, so `ab` is rewritten before `a` can be found inside it.
  for (const id of [...ids].sort((left, right) => right.length - left.length)) {
    const next = renamed.get(id) ?? id;
    body = body
      .replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`url(#${id})`, `url(#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`);
  }

  body = body.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  return { viewBox, body };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run, from `packages/domain/`:

```bash
bunx vitest run src/tooling/__tests__/icon-art.test.ts
```

Expected: PASS, all six. If "does not let a short id rewrite the inside of a
longer one" fails, the longest-first loop is not in place — the exact-match
replacements (`id="a"` with its quotes, `url(#a)` with its bracket) are what
make the order sufficient. Numbers are assigned from the order of appearance
before that loop runs, so the sort changes only the rewrite order, never the
names.

- [ ] **Step 5: Write the CLI**

Create `packages/domain/scripts/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["./**/*.ts"]
}
```

Create `packages/domain/scripts/icon-add.ts`:

```ts
/// <reference types="@types/bun" />
/**
 * Prints a registry `art` entry from any SVG.
 *
 *   bun run icon:add angular ./angular.svg
 *   curl -s https://api.iconify.design/logos/hono.svg | bun run icon:add hono
 *
 * It prints and does not write: the curator still pastes the entry into
 * `diagram-icons.ts`, looks at the result at 32px on both tiles, and sets
 * `onDark`. Deciding that by eye is the one step a script cannot do.
 */
import { normaliseIconArt } from "../src/tooling/icon-art";

const [key, file] = process.argv.slice(2);

if (!key || !/^[a-z0-9]+$/.test(key)) {
  console.error("usage: bun run icon:add <key> [file.svg]   (reads stdin without a file)");
  console.error("       <key> is the registry key: lowercase letters and digits only");
  process.exit(1);
}

const source = file ? await Bun.file(file).text() : await Bun.stdin.text();
const { viewBox, body } = normaliseIconArt(key, source);

console.log(`  ${key}: {`);
console.log(`    ...toDiagramIcon(si${key[0]!.toUpperCase()}${key.slice(1)}),`);
console.log(`    art: {`);
console.log(`      viewBox: ${JSON.stringify(viewBox)},`);
console.log(`      body:`);
console.log(`        ${JSON.stringify(body)},`);
console.log(`      // Looked at on the dark tile at 32px: true if it reads there.`);
console.log(`      onDark: true,`);
console.log(`    },`);
console.log(`  },`);
```

Add to the root `package.json` `scripts`, beside `db:studio`:

```json
    "icon:add": "bun packages/domain/scripts/icon-add.ts",
```

- [ ] **Step 6: Run the CLI once against a fixture**

Run, from the root:

```bash
printf '<svg viewBox="0 0 4 4"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="4" height="4"/></svg>' | bun run icon:add demo
```

Expected output contains `viewBox: "0 0 4 4"` and a body with `id="demo-0"` and
`url(#demo-0)`. Then:

```bash
bun run icon:add
```

Expected: the usage message and exit code 1.

- [ ] **Step 7: Type-check and lint**

Run, from the root:

```bash
bun run check-types && bun run lint
```

Expected: both clean. The CLI is outside the domain's `tsconfig` and is not
type-checked by `check-types`; `oxlint` at the root does lint it.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/tooling/icon-art.ts packages/domain/src/tooling/__tests__/icon-art.test.ts packages/domain/scripts/icon-add.ts packages/domain/scripts/tsconfig.json package.json
git commit -m "feat(domain): add icon:add, which turns any svg into a registry art entry"
```

---

## Task 7: The first three colour marks

Hono, Angular and TanStack Query — two flat fills, two gradients, four flat
fills in a non-square box. Each exercises something different in the model.
The sources are the `logos` set on iconify's public API, which redistributes
the brands' own SVGs; they are copied through the script, not depended on.

**Files:**

- Modify: `packages/domain/src/constants/diagram-icons.ts` (imports; `HONO_ICON`; three entries; `DIAGRAM_ICON_ALIASES`)
- Modify: `apps/fullstack-fn-only/src/components/editor/tile-catalog.ts:66-71` (`LABEL_OVERRIDES`)
- Test: `packages/domain/src/constants/__tests__/diagram-icons.test.ts`
- Test: `packages/domain/src/render/__tests__/render.test.ts`

**Interfaces:**

- Consumes: `DiagramIconArt` (Task 1); the registry id-prefix test (Task 1); `icon:add` (Task 6); `renderIconMarkup` semantics (Task 4).
- Produces: registry key `reactquery` (new), and `art` on `hono`, `angular`, `reactquery`.

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/constants/__tests__/diagram-icons.test.ts`, add to
`describe("DIAGRAM_ICONS", …)`:

```ts
  it("gives the three proving marks colour art that reads on both tiles", () => {
    // Hono: two flat fills, the inner flame the silhouette had to cut away.
    // Angular: two gradients, which is what the id rule exists for.
    // TanStack Query: four flat fills in a box that is not square.
    for (const key of ["hono", "angular", "reactquery"] as const) {
      const art = DIAGRAM_ICONS[key].art;
      expect(art, `"${key}" has no art`).toBeDefined();
      expect(art?.onDark, `"${key}" was judged not to read on the dark tile`).toBe(true);
    }
    expect(DIAGRAM_ICONS.angular.art?.body).toContain("<linearGradient");
    expect(DIAGRAM_ICONS.angular.art?.body).toContain('url(#angular-');
    expect(DIAGRAM_ICONS.reactquery.art?.viewBox).toBe("0 0 256 230");
  });
```

And to `describe("DIAGRAM_ICON_ALIASES", …)`, extend the whiteboard test's list:

```ts
    for (const key of ["nodedotjs", "postgresql", "githubactions", "cloudflareworkers", "reactquery"]) {
```

In `packages/domain/src/render/__tests__/render.test.ts`, inside
`describe("brand icons")`, the three tests that use `hono` to check the
**mono** path will stop holding once Hono has art. Change them to a mark that
stays mono-only:

- `it("draws the registry's path when a node names an iconKey")` → use
  `iconKey: "cloudflare"` and assert `DIAGRAM_ICONS.cloudflare.mono.path`.
- `it("lets an iconKey win over an emoji on the same node")` → same swap.
- `it("draws a readable brand mark in its brand colour on a light tile")` →
  `iconKey: "cloudflare"`, assert `` `fill="#${DIAGRAM_ICONS.cloudflare.mono.hex}"` ``.
- `it("draws a mark in the light tile colour on a dark tile")` → use
  `iconKey: "react"` (its cyan is dropped on paper and it has no art), assert
  `DIAGRAM_ICONS.react.mono.path` and `not.toContain(fill="#${…react.mono.hex}")`.
- The placement test from Task 4 uses `hono` and asserts the mono viewBox —
  switch it to `iconKey: "cloudflare"` too.

Then add:

```ts
    it("draws colour art instead of the silhouette when a mark has some", () => {
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono", tile: "light" }));

      expect(svg).toContain(DIAGRAM_ICONS.hono.art?.body);
      expect(svg).not.toContain(DIAGRAM_ICONS.hono.mono.path);
    });

    it("keeps the art on a dark tile when it was judged to read there", () => {
      const svg = render(singleNode({ emoji: undefined, iconKey: "angular", tile: "dark" }));

      expect(svg).toContain(DIAGRAM_ICONS.angular.art?.body);
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run, from `packages/domain/`:

```bash
bunx vitest run src/constants/__tests__/diagram-icons.test.ts src/render/__tests__/render.test.ts
```

Expected: FAIL — `DIAGRAM_ICONS.reactquery` is undefined, `hono.art` is
undefined, the alias test finds no `reactquery` alias.

- [ ] **Step 3: Generate the three art entries**

Run, from the root, and keep each output:

```bash
curl -s https://api.iconify.design/logos/hono.svg | bun run icon:add hono
curl -s https://api.iconify.design/logos/angular-icon.svg | bun run icon:add angular
curl -s https://api.iconify.design/logos/react-query-icon.svg | bun run icon:add reactquery
```

Expected, as a check that the sources are the right ones:

| key          | `viewBox`     | what the body contains                                                                                                       |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `hono`       | `0 0 256 330` | two `<path>`s, fills `#ff5b11` and `#ff9758`, no `<defs>`                                                                    |
| `angular`    | `0 0 256 271` | one `<defs>` with `<linearGradient id="angular-0">` and `id="angular-1"`, paths filled `url(#angular-0)` / `url(#angular-1)` |
| `reactquery` | `0 0 256 230` | four distinct fills: `#002b3b`, `#00435b`, `#ff4154`, `#ffd94c`; no `<defs>`                                                 |

If a `viewBox` differs, the API served a different asset than the plan was
written against — stop and report rather than pasting it.

- [ ] **Step 4: Paste them into the registry**

In `diagram-icons.ts`:

Add `siReactquery` to the `simple-icons` import between `siReact` and `siRedis`.

Replace `HONO_ICON` with the mono half it had plus the art. Keep the existing
comment block above it, and append this paragraph to it:

```
 *
 * The art below is the official two-flame logo, which is what the silhouette
 * was standing in for. On a dark tile the orange reads without help.
```

then:

```ts
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
    body:
      '<path fill="#ff5b11" d="M134.129.029q1.315-.17 2.319.662a1256 1256 0 0 1 69.573 93.427q24.141 36.346 41.082 76.862q27.055 72.162-28.16 125.564q-48.313 40.83-111.318 31.805q-75.312-15.355-102.373-87.133Q-1.796 217.85.614 193.51q4.014-41.896 19.878-80.838q6.61-15.888 17.228-29.154a382 382 0 0 1 16.565 21.203q3.66 3.825 7.62 7.289Q92.138 52.013 134.13.029" opacity=".993"/><path fill="#ff9758" d="M129.49 53.7q36.47 42.3 65.93 90.114a187.3 187.3 0 0 1 15.24 33.13q12.507 49.206-26.836 81.169q-38.05 26.774-83.488 15.902q-48.999-15.205-56.653-65.929q-1.857-15.993 3.314-31.142a225.4 225.4 0 0 1 17.89-35.78l19.878-29.155a5510 5510 0 0 0 44.726-58.31"/>',
    onDark: true,
  },
};
```

That body is what the script prints for Hono (the source has no ids, so nothing
is renumbered); the script's `...toDiagramIcon(siHono)` line is discarded for
this one entry, because Hono's mono half is the hand-drawn silhouette, not a
`simple-icons` export.

Replace the `angular` line with the object the script printed, which spreads
`toDiagramIcon(siAngular)` and adds `art`. Add a `reactquery` entry between
`react` and `redis`, from the script's output, spreading
`toDiagramIcon(siReactquery)`. Both keep `onDark: true`.

Add the alias:

```ts
  reactquery: ["TanStack Query", "Query"],
```

to `DIAGRAM_ICON_ALIASES` in alphabetical position (after `postgresql`), with a
line in the block's comment if it helps a reader: the `simple-icons` slug
predates the product's rename.

In `tile-catalog.ts`, add to `LABEL_OVERRIDES`:

```ts
  reactquery: "TanStack Query",
```

- [ ] **Step 5: Run both suites and update the snapshot**

Run, from `packages/domain/`:

```bash
bunx vitest run
```

Expected: everything passes except the canonical-example snapshot in
`render.test.ts`: the seed has a Hono node, and Hono now draws its art. Read the
diff — it must show the Hono mark's `viewBox="0 0 24 24"` path replaced by
`viewBox="0 0 256 330"` and the two orange paths, and nothing else — then:

```bash
bunx vitest run src/render/__tests__/render.test.ts -u
bunx vitest run
```

Expected: PASS. The id-prefix test from Task 1 now has three bodies to check
and passes; the alphabetical-order test passes with `reactquery` between
`react` and `redis`.

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run
```

Expected: PASS.

- [ ] **Step 6: Look at them**

Write this to a scratch location outside the repo (it is not committed), run
it from `packages/domain/`, and open the PNG it produces:

```bash
cat > /tmp/preview-icons.ts <<'EOF'
import { DIAGRAM_ICONS, ICON_STYLES, TILE_VARIANTS } from "./src/constants";
import { renderIconMarkup } from "./src/render";

const keys = ["hono", "angular", "reactquery", "tanstack", "effect", "github"] as const;
const tile = (mark: string, bg: string, stroke: string) =>
  `<rect width="64" height="64" rx="14" fill="${bg}" stroke="${stroke}"/>${mark}`;

let x = 0;
let out = "";
for (const key of keys) {
  const icon = DIAGRAM_ICONS[key];
  const at = { x: 16, y: 16, size: 32 };
  const rows = [
    [TILE_VARIANTS.LIGHT, ICON_STYLES.COLOR, "#ffffff", "#e2e8f0"],
    [TILE_VARIANTS.DARK, ICON_STYLES.COLOR, "#0f172a", "none"],
    [TILE_VARIANTS.LIGHT, ICON_STYLES.MONO, "#ffffff", "#e2e8f0"],
    [TILE_VARIANTS.DARK, ICON_STYLES.MONO, "#0f172a", "none"],
  ] as const;
  rows.forEach(([variant, style, bg, stroke], row) => {
    out += `<g transform="translate(${x},${row * 80})">${tile(renderIconMarkup(icon, variant, style, at), bg, stroke)}</g>`;
  });
  out += `<text x="${x}" y="335" font-family="monospace" font-size="11" fill="#334155">${key}</text>`;
  x += 80;
}
console.log(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="350"><rect width="100%" height="100%" fill="#f8fafc"/>${out}</svg>`,
);
EOF
bun /tmp/preview-icons.ts > /tmp/preview-icons.svg && qlmanage -t -s 1000 -o /tmp /tmp/preview-icons.svg
open /tmp/preview-icons.svg.png
```

Rows are: colour on light, colour on dark, mono on light, mono on dark. Confirm:

1. Hono's two flames, orange and lighter orange, on both colour rows.
2. Angular's magenta-to-purple gradient on both colour rows — this is the
   gradient resolving through its prefixed id.
3. TanStack Query's red petals with the yellow centre; on the dark tile the
   navy outline fades into the tile but the mark still reads.
4. `tanstack` and `effect` near-black on light, white on dark, on every row.
5. The two mono rows show silhouettes only — no orange, no gradient, no red.

If any of 1–3 does not read on the dark tile, flip that icon's `onDark` to
`false` and update the test in Step 1 to expect it. Report which, and why.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/constants/diagram-icons.ts packages/domain/src/constants/__tests__/diagram-icons.test.ts packages/domain/src/render/__tests__/render.test.ts packages/domain/src/render/__tests__/__snapshots__ apps/fullstack-fn-only/src/components/editor/tile-catalog.ts
git commit -m "feat(domain): give hono, angular and tanstack query their colour art"
```

---

## Task 8: The author's switch

A control in the diagram panel, beside the paper tone, that writes
`content.iconStyle`.

**Files:**

- Modify: `apps/fullstack-fn-only/src/components/editor/edits/content-edits.ts` (after `setBackground`)
- Modify: `apps/fullstack-fn-only/src/components/editor/use-diagram-editing.ts` (import; one binding)
- Modify: `apps/fullstack-fn-only/src/components/editor/diagram-panel.tsx`
- Modify: `apps/fullstack-fn-only/src/components/editor/editor-page.tsx:701`
- Test: `apps/fullstack-fn-only/src/components/editor/__tests__/editing-panels.test.tsx`

**Interfaces:**

- Consumes: `ICON_STYLES`, `IconStyle` (Task 3); the document's `content.iconStyle` (Task 3); `TilePalette`'s `iconStyle` prop (Task 5) reacting to the change.
- Produces: `setIconStyle(text: string, style: IconStyle): string`; `edit.setIconStyle`; `DiagramPanel` prop `onIconStyleChange: (style: IconStyle) => void`.

- [ ] **Step 1: Write the failing test**

In `editing-panels.test.tsx`, after `it("offers the paper tone while nothing is selected")`:

```tsx
  it("offers colour or mono for the marks while nothing is selected", () => {
    render(<EditorPage />);
    openTab(/inspector/i);

    // Hono has colour art, so in the default style its card carries the art's
    // own viewBox rather than the mono one.
    const hono = () =>
      within(screen.getByRole("complementary", { name: /tiles/i })).getByRole("button", {
        name: /^hono$/i,
      });
    expect(hono().querySelector('svg[viewBox="0 0 24 24"]')).toBeNull();

    // Like the paper tone, the choice is part of the drawing and lands in
    // `content` so that arranging cannot lose it.
    fireEvent.click(screen.getByRole("button", { name: "Mono" }));

    expect(parsed().content.iconStyle).toBe("mono");
    expect(screen.getByRole("button", { name: "Mono" })).toHaveAttribute("aria-pressed", "true");

    // And the palette follows, so what is previewed is what will be placed.
    expect(hono().querySelector('svg[viewBox="0 0 24 24"] > path')).not.toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run src/components/editor/__tests__/editing-panels.test.tsx -t "colour or mono"
```

Expected: FAIL — no button named "Mono".

- [ ] **Step 3: The edit**

In `content-edits.ts`, after `setBackground`:

```ts
/** Sets how marks are coloured. Content, like the paper: it survives Arrange. */
export const setIconStyle = (text: string, style: IconStyle): string =>
  editDocument(text, (document) => {
    const content = contentOf(document);
    if (!content) return false;

    content.iconStyle = style;
    return true;
  });
```

Add `IconStyle` to the file's type import from `@diagram-tool/domain/constants`
(beside `CanvasTone`).

In `use-diagram-editing.ts`, import `setIconStyle` beside `setBackground`, add
`IconStyle` to the type import, and beside the `setBackground` binding:

```ts
      setIconStyle: (style: IconStyle) => setText((text) => setIconStyle(text, style)),
```

- [ ] **Step 4: The control**

In `diagram-panel.tsx`, extend the imports:

```ts
import { CANVAS_TONES, CANVAS_TONE_INFO, ICON_STYLES } from "@diagram-tool/domain/constants";
import type { CanvasTone, IconStyle } from "@diagram-tool/domain/constants";
```

Extend the props:

```ts
interface DiagramPanelProps {
  diagram: ResolvedDiagram;
  onBackgroundChange: (tone: CanvasTone) => void;
  onIconStyleChange: (style: IconStyle) => void;
}
```

Add beside `TONE_LABELS`:

```ts
const ICON_STYLE_ORDER: IconStyle[] = [ICON_STYLES.COLOR, ICON_STYLES.MONO];

const ICON_STYLE_LABELS: Record<IconStyle, string> = {
  [ICON_STYLES.COLOR]: "Colour",
  [ICON_STYLES.MONO]: "Mono",
};
```

Update the module comment's first paragraph to:

```
 * Two controls, both about the drawing rather than the chrome: the paper tone
 * and how the brand marks are coloured. Both export with the diagram, which is
 * why they live in the diagram and not in a theme.
```

In the component, read the current style and render a second group after the
paper block (before the closing `<p>`):

```tsx
  const iconStyle = diagram.iconStyle ?? ICON_STYLES.COLOR;
```

```tsx
      <div className="space-y-1.5">
        <span className="block text-[12.5px] font-medium text-ed-text">Marks</span>

        <div role="group" aria-label="Marks" className="flex gap-2">
          {ICON_STYLE_ORDER.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={style === iconStyle}
              onClick={() => onIconStyleChange(style)}
              className={cn(
                "rounded-[8px] border px-3 py-1.5 text-[12.5px] font-medium",
                "transition-shadow duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                style === iconStyle
                  ? "border-ed-accent text-ed-text shadow-[0_0_0_2px_var(--ed-accent)]"
                  : "border-ed-border text-ed-text-2 hover:bg-ed-surface-hover",
              )}
            >
              {ICON_STYLE_LABELS[style]}
            </button>
          ))}
        </div>

        <span className="block text-[11.5px] text-ed-text-3">
          {iconStyle === ICON_STYLES.MONO
            ? "Every logo as a silhouette: black on paper, white on a dark tile."
            : "Logos in their own colours where they read; silhouettes where they would not."}
        </span>
      </div>
```

Update the function signature to destructure `onIconStyleChange`.

In `editor-page.tsx` at the `<DiagramPanel` element, add
`onIconStyleChange={edit.setIconStyle}`.

- [ ] **Step 5: Run the app suite and type-check**

Run, from `apps/fullstack-fn-only/`:

```bash
bunx vitest run
```

Expected: PASS.

Run, from the root:

```bash
bun run check-types
```

Expected: 6/6.

- [ ] **Step 6: Commit**

```bash
git add apps/fullstack-fn-only/src/components/editor/edits/content-edits.ts apps/fullstack-fn-only/src/components/editor/use-diagram-editing.ts apps/fullstack-fn-only/src/components/editor/diagram-panel.tsx apps/fullstack-fn-only/src/components/editor/editor-page.tsx apps/fullstack-fn-only/src/components/editor/__tests__/editing-panels.test.tsx
git commit -m "feat(editor): let the author switch brand marks between colour and mono"
```

---

## Task 9: Docs, verification, PR

The branch makes several documented statements false — "one path in a 24x24
box", "a path string and a hex" — and adds a control and a script. This task
puts the documentation back in step with the code, verifies the whole tree,
checks the one thing jsdom cannot, and opens the PR.

**Files:**

- Modify: `apps/documentation/src/content/docs/features/diagram-tool/svg-renderer.mdx`
- Modify: `apps/documentation/src/content/docs/features/diagram-tool/config-schema.mdx:38`
- Modify: `apps/documentation/src/content/docs/features/diagram-tool/editor-page.mdx`
- Modify: `apps/documentation/src/content/docs/features/diagram-tool/index.mdx` (three dates)
- Create: `apps/documentation/src/content/docs/changelog/2026-09-04-colour-brand-marks.mdx`

- [ ] **Step 1: `svg-renderer.mdx`**

Around line 61, replace the sentence beginning `` `simple-icons` authors every logo as one path in a 24x24 box, so the renderer wraps it in a `<g>` translated to where `` (read to the end of that sentence) with:

```
Every mark has a mono half — one path in a 24x24 box, from `simple-icons` or
drawn by hand — and may have colour art in whatever viewBox the brand authored.
`renderIconMarkup` picks one from the tile and the document's `iconStyle`, and
emits it as a nested `<svg>` sized to the tile, so a non-square logo fits the
same box a square one does.
```

In the Decisions table, after the `simple-icons` row, add:

```
| Colour art is a layer over a mandatory mono mark | The single path is the one representation that is readable on either tile, because it passes the contrast rule; near-black and near-white logos are the most common marks and the ones colour cannot help. Keeping it mandatory means no icon can be added without a legible fallback | Replacing the path with art and computing a dark-tile fallback from the dominant fill, which gradients and strokes break |
| Marks are nested `<svg>` elements, not transformed `<g>`s | Art arrives in an arbitrary viewBox, square or not, and `preserveAspectRatio` fits any of them where a computed scale fits only the square ones. The mono path goes through the same element so the renderer and the palette cannot drift | A `<g transform="translate scale">` per mark |
| Every id inside art is prefixed with the icon's key | A diagram inlines every mark into one document, so two brands that both named a gradient `a` would swap colours. The prefix is applied by `icon:add` and enforced by a registry test | Hoisting shared `<defs>`, or trusting curators to pick unique ids |
```

In Gotchas, add:

```
- ⚠️ `art.body` is inlined verbatim, never escaped: it is trusted registry markup. Anything that lets a body in from outside the repo has to normalise it through `normaliseIconArt` first, or an unprefixed id will silently recolour another mark.
```

- [ ] **Step 2: `config-schema.mdx`**

Line 38, replace the registry's purpose cell with:

```
The curated brand-mark registry — a mono path per icon, colour art for some — the icon key union, and the fill-legibility rule
```

- [ ] **Step 3: `editor-page.mdx`**

In the Files Changed table, add after the `diagram-panel.tsx` row:

```
| `packages/domain/scripts/icon-add.ts`                                | `bun run icon:add <key> file.svg` — normalises any SVG into a registry `art` entry |
```

and update the `diagram-panel.tsx` row's purpose to
`The panel with nothing selected: the paper tone, and colour or mono for the marks`.

In Decisions, add:

```
| Marks are colour or mono, never black or white   | Black and white are what the tile decides; a mark forced to one of them vanishes on the other tile. Two values make the setting impossible to set wrong                                    | Three styles: black, white, colour                                    |
| The palette previews the diagram's own `iconStyle` | The card is what the author is about to place, so it is drawn by the renderer's helper with the diagram's setting — a second drawing of the mark in React was a second thing to keep in step | A static palette that always shows colour                             |
```

In Gotchas, add:

```
- ⚠️ The palette thumbnail is injected markup from `renderIconMarkup`, not a React `<svg>`. That is deliberate — it is the renderer's own output — and it means the thumbnail can never be styled through React props; size it through the placement passed to the helper.
```

In the Testing block's manual list, append:

```
# 14. Inspector with nothing selected — Marks ▸ Mono. Every logo turns into a silhouette, palette included.
# 15. Marks ▸ Colour. Hono shows two flames, Angular a gradient, TanStack Query red and yellow.
# 16. Make a tile dark — Angular's gradient stays; Effect turns white.
# 17. File ▸ Export PNG 2x with colour marks on — the gradient and the nested marks survive rasterising.
```

- [ ] **Step 4: `index.mdx` and the changelog entry**

In `index.mdx`, set the Date column to `2026-09-04` on the Config Schema, SVG
Renderer and Editor Page rows.

Create `apps/documentation/src/content/docs/changelog/2026-09-04-colour-brand-marks.mdx`:

```mdx
---
title: "September 04, 2026 - Colour brand marks"
description: Brand marks can now be drawn in full colour, with a diagram-level switch back to silhouettes.
date: 2026-09-04
tags:
  - changelog
  - feature
---

✨ **Feature** — Every brand mark keeps its single-path mono silhouette and may now carry colour art — several fills, gradients, its own viewBox — curated by hand through `bun run icon:add`. A new `iconStyle` on the document switches the whole drawing between colour and mono; the palette follows it. Hono, Angular and TanStack Query are the first three marks in colour; TanStack and Effect arrive mono-only.

**Docs:** [SVG Renderer](/features/diagram-tool/svg-renderer), [Editor Page](/features/diagram-tool/editor-page)
```

- [ ] **Step 5: Commit the docs**

```bash
git add apps/documentation/src/content/docs/features/diagram-tool/svg-renderer.mdx apps/documentation/src/content/docs/features/diagram-tool/config-schema.mdx apps/documentation/src/content/docs/features/diagram-tool/editor-page.mdx apps/documentation/src/content/docs/features/diagram-tool/index.mdx apps/documentation/src/content/docs/changelog/2026-09-04-colour-brand-marks.mdx
git commit -m "docs(diagram-tool): record colour brand marks and the iconStyle switch"
```

- [ ] **Step 6: Verify the whole tree**

Run, from the root:

```bash
bun run check-types && bun run test && bun run lint && bun run format:check
```

Expected: every task successful, every test passing, lint and format clean. If
`format:check` names files under `.superpowers/`, that is a scratch workspace
and not the branch — remove it and re-run.

- [ ] **Step 7: Check the one thing jsdom cannot — PNG export**

```bash
bun run dev:fullstack-fn
```

Open the editor. With the seed diagram: place Hono, Angular and TanStack Query
from the palette, make one of them dark from the inspector, then File ▸ Export
PNG 2x. Open the PNG. Confirm Angular's gradient rasterised (not black, not
missing) and the nested marks are crisp. This is the browser's own rasteriser
doing what `qlmanage` did in Task 7, and it is the path the product actually
ships. Then switch Marks ▸ Mono and export again: silhouettes only.

If the gradient is missing from the PNG, report it — the spec names that as the
condition that reopens the nested-`<svg>` decision — and do not open the PR.

- [ ] **Step 8: Push and open the PR**

The remote uses the `github-personal` SSH alias, so `gh` must be on `csdev19`:

```bash
gh auth switch --user csdev19
git push -u origin feat/colour-icons
gh pr create --title "feat(domain): draw brand marks in colour, with a mono switch" --body "$(cat <<'EOF'
## What

A brand mark can now be drawn in full colour — several fills, gradients, its own viewBox — as an optional layer over the single-path mono silhouette every icon keeps. A new `iconStyle` on the document switches the whole drawing between colour and mono, and the palette follows it.

Hono, Angular and TanStack Query are the first three in colour; TanStack and Effect arrive mono-only, because their official emblems are.

## Why

Every mark was one path in one colour. That was a property of the registry's shape, inherited from `simple-icons` flattening every logo so it could ship as data — the right trade for shipping 22 marks with no loader inside a Worker, and the wrong ceiling. Logos are multi-coloured, and a tool whose logos are all silhouettes reads as unfinished.

## How

- `DiagramIcon` becomes `{ title, mono, art? }`. Every existing entry migrates as `mono` and renders byte-identically until given art.
- `renderIconMarkup` is the one place a mark is drawn: the spec's decision table in one function, returning a nested `<svg>` so a non-square logo fits the same box a square one does. The scene renderer and the palette thumbnail both use it.
- Every `id` inside art is prefixed with the icon's key — applied by `bun run icon:add`, enforced by a registry test — so two brands that both named a gradient `a` cannot swap colours in one document.
- `iconStyle` follows `background` through every layer: constant, content schema, resolved schema, resolver, edit, panel. It defaults to `color`, so no existing document changes, and the AI guidelines do not mention it.

Black and white are not styles: the tile decides them, and a mark forced to one vanishes on the other. Two values make the setting impossible to set wrong.

## Testing

Automated: the helper's full decision table (nine cases against fixtures), the id-prefix rule over every art body, the normaliser (prefixing, longest-id-first, whitespace, refusals), schema acceptance and rejection, the resolver carrying the style, the renderer under both styles, the palette drawing through the helper, and the panel control writing `content.iconStyle`.

By eye: all five marks on both tiles under both styles via `qlmanage`, and PNG export in the browser with the gradient present.

Design: `docs/specs/2026-09-04-colour-icons-design.md`
Plan: `docs/plans/2026-09-04-colour-icons.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Report the PR URL**

The work is not delivered until it is a PR.
