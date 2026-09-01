# Diagram tool, phase 0 — implementation plan

**Design:** [`/docs/specs/2026-09-01-diagram-tool-phase-0-design.md`](../specs/2026-09-01-diagram-tool-phase-0-design.md)
**Branch:** `feat/diagram-core-phase-0` · **Date:** 2026-09-01

**Goal.** Turn a `DiagramConfig` JSON into a styled SVG and a downloadable 2x
PNG, entirely in the browser.

**Architecture.** Schema, constants and the pure renderer live in
`packages/domain`; the `/editor` page in `apps/fullstack-fn-only` consumes them
and owns the canvas-based PNG export.

**Tech stack.** TypeScript, Zod v4, Vitest (node), TanStack Start, Tailwind v4,
`@diagram-tool/web-ui`.

## Conventions to read before starting

- **Language:** every committed artifact is English — code, comments, commits,
  docs. (Global `CLAUDE.md`.)
- **`conventions/enums-as-const.md`** — never `enum`; `as const` object +
  derived type. Never hand-write a union beside its values.
- **`conventions/constants-pattern.md`** — constants live in
  `packages/domain/src/constants/`; feed the const object straight into
  `z.enum(X)`, never a re-listed array of literals.
- **`conventions/schemas-first.md`** — Zod **v4** syntax (`z.uuid()`, not
  `z.string().uuid()`); a descriptive message on every constraint; export the
  inferred types.
- **`packages/shared-package-build-strategy.md`** — `exports` and
  `publishConfig.exports` are owned by tsdown. Never hand-edit them; change
  `tsdown.config.ts` and rebuild.
- **`monorepos/testing/unit-and-component.md`** — tests co-located in
  `__tests__/`, never a separate `tests/` tree.
- **`monorepos/monorepo-structure.md`** — shared deps use `"catalog:"`, never a
  pinned version. Every import must be a declared dependency (isolated linker).
- **`web/web-ui-package.md`** — import UI from the barrel
  (`from "@diagram-tool/web-ui"`); style page chrome with theme classes
  (`bg-background`), never `bg-blue-500`.
- **`web/tailwind-v4-split-css-cascade.md`** — one Tailwind build per app.
- **`conventions/mvp-first-then-refactor.md`** — no use cases, domain interfaces
  or mappers around the renderer in this phase.

Repo specifics: `noUncheckedIndexedAccess` and `verbatimModuleSyntax` are on in
`packages/domain` — index access is `T | undefined`, and type-only imports need
`import type`.

## File structure

**Create**

```
packages/domain/src/constants/diagram.ts
packages/domain/src/schemas/diagram.ts
packages/domain/src/schemas/__tests__/diagram.test.ts
packages/domain/src/render/{index,svg,background,group,node,edge}.ts
packages/domain/src/render/__tests__/render.test.ts
apps/fullstack-fn-only/src/lib/export-png.ts
apps/fullstack-fn-only/src/components/editor/{json-input,diagram-preview}.tsx
apps/fullstack-fn-only/src/routes/editor.tsx
```

**Modify**

```
packages/domain/src/constants/index.ts     export the diagram constants
packages/domain/src/schemas/index.ts       export the diagram schema + types
packages/domain/tsdown.config.ts           add the `render` entry
packages/web-ui/src/index.ts               drop the styles.css side-effect import
turbo.json                                 remove the duplicated `test` task
```

## Task 1 — Clear the two pre-existing defects

The two-pane layout depends on the first one, so it goes first.

- [x] Remove `import "./styles.css";` from `packages/web-ui/src/index.ts`.
- [x] Rebuild the package: `cd packages/web-ui && bun run build`. Its `dist/` is
      git-ignored, so the rebuild only refreshes the local artifact — nothing to
      commit. (`CLAUDE.md` claimed it was committed; that was stale, and is
      corrected in this task.)
- [x] Remove the duplicated `"test"` key in `turbo.json` (it appears twice).
- [x] Verify no duplicate utilities layer survives a production build.
- [x] Confirm the existing pages still render.

```bash
bun run build --filter=fullstack-fn-only
for f in apps/fullstack-fn-only/dist/client/assets/*.css; do
  echo "$f: .flex x$(grep -oF '.flex{' "$f" | wc -l)"
done
```

**Measured.** Before: `main-*.css` 51.10 kB and `index-*.css` 51.58 kB — two full
utilities layers. After: `index-*.css` keeps the one layer (`.flex{` x1, plus the
`--background`/`--primary` theme vars and the `@media(min-width:48rem)` variants),
while `main-*.css` drops to 4.73 kB carrying only `markdown-content.css`, the
scoped component stylesheet that legitimately ships with the package (`.flex{`
x0). Dev server serves `/` and `/auth/login` at 200 after the change.

## Task 2 — Diagram constants

- [x] `packages/domain/src/constants/diagram.ts`, following the four-part
      constants pattern (const object → derived type → guard → JSDoc):
  - `GROUP_TONES` (`orange | blue | green | neutral`) + `GroupTone` +
    `isValidGroupTone`.
  - `GROUP_TONE_INFO: Record<GroupTone, { border; fill; label }>` — the hex
    table from design doc 01.
  - `TILE_VARIANTS` (`light | dark`), `EDGE_STYLES` (`solid | dashed`),
    `ANCHOR_SIDES` (`l | r | t | b`), each with its derived type.
  - `DIAGRAM_GEOMETRY` — tile 62x62, radius 14, grid cell 26, group radius 14,
    anchor offset 6, bottom-anchor offset 34, canvas margin 60.
  - `DIAGRAM_TYPOGRAPHY` — font families and sizes.
  - `DIAGRAM_COLORS` — background, grid line, tile light/dark, edge blue/grey.
- [x] Re-export from `packages/domain/src/constants/index.ts`.
- [x] Test that every `GroupTone` has an entry in `GROUP_TONE_INFO` and that the
      guard rejects an unknown value.

## Task 3 — Schema (test-first)

- [x] Write `packages/domain/src/schemas/__tests__/diagram.test.ts` first, red:
  - accepts the minimal example config from design doc 01;
  - `edges[i].to` naming a missing node → message lists the available node ids;
  - duplicate node ids → message names the repeated id;
  - `name` over 26 chars → message says to abbreviate;
  - a node outside the canvas margin → message names the node and the bound;
  - defaults applied (`sub: ""`, `tile: "light"`, `style: "solid"`,
    `filled: true`, `dashed: false`).
- [x] Implement `packages/domain/src/schemas/diagram.ts`:
  - `diagramNodeSchema`, `diagramGroupSchema`, `diagramEdgeSchema`,
    `diagramConfigSchema` (`version: z.literal(1)`, canvas 400–2400 x 300–2400,
    ≤12 groups, 1–40 nodes, ≤80 edges).
  - Enums come from the constant objects: `z.enum(GROUP_TONES)`,
    `z.enum(TILE_VARIANTS)`, `z.enum(EDGE_STYLES)`, `z.enum(ANCHOR_SIDES)`.
  - Text fields chain `.trim()` before `.min(1)`.
  - One `superRefine` for the cross-field rules so a single parse reports all of
    them: unique node ids, unique group ids, both edge endpoints resolve,
    `from !== to`, nodes inside the canvas margin.
  - Export `DiagramConfig`, `DiagramNode`, `DiagramGroup`, `DiagramEdge`.
- [x] Re-export from `packages/domain/src/schemas/index.ts`.
- [x] Green: `bun run test --filter=@diagram-tool/domain`.

## Task 4 — Renderer (test-first)

- [x] Write `packages/domain/src/render/__tests__/render.test.ts` first, red:
  - snapshot of `renderSVG(exampleConfig)`;
  - a node named `A & B <C>` produces `&amp;` / `&lt;` and no raw `&`;
  - `tile: "dark"` emits the dark fill, `light` does not;
  - a `dashed` edge references the grey marker, `solid` the blue one;
  - two calls on one config return identical strings.
- [x] `render/svg.ts` — `escapeXml` plus small attribute helpers.
- [x] `render/background.ts` — base rect and the 26px grid `<pattern>`.
- [x] `render/group.ts` — rounded rect per `tone`, with the label drawn over the
      top border on a fill-coloured backing rect.
- [x] `render/node.ts` — 62x62 tile, centred emoji, name, monospace sublabel.
- [x] `render/edge.ts` — anchor geometry from `out`/`inn` (6px offset; +34px on
      `"b"` to clear the node text), line, marker, centred label.
- [x] `render/index.ts` — `renderSVG` composing the layers in order: background,
      groups, edges, nodes. Build a `Map` for node lookup (index access is
      `T | undefined` here).
- [x] Add `render: "src/render/index.ts"` to `packages/domain/tsdown.config.ts`,
      then `cd packages/domain && bun run build` so tsdown regenerates the
      exports map.
- [x] Green, and `bun run check-types`.

## Task 5 — The `/editor` page

- [x] `apps/fullstack-fn-only/src/lib/export-png.ts` — serialise the SVG, draw it
      to a canvas at 2x, trigger the download. Browser-only; no domain import
      beyond the SVG string.
- [x] `components/editor/json-input.tsx` — a labelled `Textarea` from the web-ui
      barrel (label association matters: component tests select by accessible
      name), with the validation errors listed beneath it.
- [x] `components/editor/diagram-preview.tsx` — the SVG via
      `dangerouslySetInnerHTML`, plus the export `Button`.
- [x] `routes/editor.tsx` — `createFileRoute("/editor")`, outside
      `_authenticated`. One state value (the raw text); parse → validate →
      render derived from it. Seed it with the example config so the page is
      useful on first load. Chrome uses theme classes only.
- [x] Manual check at `http://localhost:3002/editor`: valid config renders,
      broken config shows actionable errors, PNG downloads and looks right.

## Task 6 — Verify and document

- [x] `bun run check-types && bun run lint && bun run test && bun run build`.
- [x] Production-build check that the two-pane layout survives (task 1's grep).
- [x] Document the feature in `apps/documentation` using the repo's
      `feature-docs` skill, and add the changelog entry.
- [ ] Open the PR against `main`.
