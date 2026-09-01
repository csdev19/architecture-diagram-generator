# Diagram tool, phase 0 (config → SVG → PNG) — design

> **Status: proposed** · **Date:** 2026-09-01 · **Branch:** `feat/diagram-core-phase-0`
> **Scope:** `packages/domain` (schemas, constants, render), `apps/fullstack-fn-only`
> (the `/editor` route), plus two pre-existing defects this feature would otherwise
> trip over: `packages/web-ui` and `turbo.json`.

The client-only slice of the diagram tool: a pure renderer that turns a
`DiagramConfig` into SVG, and a page that previews it and exports a PNG. No
server, no storage, no MCP — those are phase 1.

## Problem

Architecture diagrams for the portfolio projects are drawn by hand, so they
drift in style: different spacing, different colors, different arrow weights.
The fix is to stop treating a diagram as a drawing and start treating it as
data — a `DiagramConfig` JSON that a single renderer turns into SVG, so every
diagram is consistent by construction.

Phase 0 answers the cheapest version of the question: does the schema describe
real architectures well, and does the aesthetic hold up? It needs no
infrastructure to answer. Claude produces a config in chat, the config is pasted
into a page, the page renders it and exports a PNG.

Phase 1 has Claude call a Worker over MCP, which renders the same SVG
server-side, rasterises it with resvg and stores it in R2. The renderer is
therefore written from day one to run unchanged in a Cloudflare Worker: pure
TypeScript, no DOM, no Node built-ins.

## Goal

- `renderSVG(config): string` — pure and deterministic, producing the complete
  SVG for a validated config.
- `diagramConfigSchema` — Zod v4 validation whose failure messages are
  actionable enough for a model to self-correct in one retry.
- A public `/editor` page: paste JSON on the left, live preview on the right,
  one button that downloads a 2x PNG.

## Non-goals (this phase)

- **Auto-layout.** Coordinates are authored by hand or by Claude following the
  guidelines. Phase 2.
- **Icon set / `iconKey`.** Nodes keep the `emoji` field. Phase 1.5 replaces it
  once server-side rendering makes colour emoji a problem.
- **API Worker, R2, MCP server.** Phase 1.
- **Loading a saved diagram by id** (`/editor?d=<id>`). Nothing to load from
  yet; phase 1 adds it.
- **Visual editing** — dragging nodes, inline text edits. Phase 2. Here,
  "editing" means changing the JSON and watching the preview update.
- **Bundled webfonts** (Inter, JetBrains Mono). They exist to make the browser
  preview and the server PNG identical; with no server there is nothing to
  match. Phase 1.
- **Application-layer use cases or domain interfaces around rendering.**
  Forbidden by the MVP-first convention until a second consumer exists.

## Architecture

### Where the code lives, and why it is not a new package

The planning notes proposed a new `packages/core`. The knowledge hub overrides
that: the documented layout has no "pure library" slot beside `domain`.

- `conventions/schemas-first.md` — Zod schemas live in
  `packages/domain/src/schemas/`.
- `conventions/constants-pattern.md` — constants live in
  `packages/domain/src/constants/` and are exported from the domain package.
- `monorepos/monorepo-structure.md` — `packages/domain/` is "Pure. Constants,
  schemas, types, interfaces."
- `renderSVG` touches no repository and no domain interface, so it is not a use
  case; `application` is the wrong layer for it. It is a pure helper over domain
  data, and `domain` is the only documented home.

`DiagramConfig` is not incidental data — it _is_ this product's domain model.
Putting it anywhere else would be the anomaly. A Worker can import
`@diagram-tool/domain/render` in phase 1 exactly as the web app does now, so the
"shared renderer" requirement is satisfied without inventing a package.

```
packages/domain/src/
  constants/diagram.ts          tones, tile variants, edge styles, geometry, typography
  schemas/diagram.ts            diagramConfigSchema + inferred types
  render/
    index.ts                    renderSVG(config) — orchestrates the four layers
    svg.ts                      escapeXml + attribute helpers
    background.ts               base rect + grid pattern
    group.ts                    renderGroup
    node.ts                     renderNode
    edge.ts                     renderEdge + anchor geometry

apps/fullstack-fn-only/src/
  routes/editor.tsx             public route at /editor
  components/editor/
    json-input.tsx              labelled textarea + validation errors
    diagram-preview.tsx         SVG preview + export button
  lib/export-png.ts             SVG string -> canvas at 2x -> download
```

### Data flow

```
JSON text ──parse──> unknown ──diagramConfigSchema──> DiagramConfig ──renderSVG──> SVG string
                                       │                                              │
                                  errors[] ──> under the textarea          preview + PNG export
```

The page holds one piece of state: the raw textarea string. Everything else is
derived, so the preview can never disagree with the text. No `createServerFn` is
involved — `web/server-functions.md` reserves those for cookie/header work on
the web server, and this feature has none.

## Key decisions

1. **Constants as `as const` objects, never TS `enum`.** `conventions/enums-as-const.md`
   is absolute. The tone table is the object form: `GROUP_TONES` (named keys) plus
   `GROUP_TONE_INFO` mapping each tone to its border/fill/label colours, with the
   type derived via `(typeof GROUP_TONES)[keyof typeof GROUP_TONES]`.

2. **The schema consumes the constant object directly: `z.enum(GROUP_TONES)`.**
   `conventions/constants-pattern.md` explicitly forbids re-listing the values
   (`z.enum(["orange", "blue", ...])`) — that is a second source that drifts.

3. **The diagram palette stays as literal colour values, not Tailwind tokens.**
   Colours are written into SVG attributes as strings; an SVG `fill` cannot
   resolve a Tailwind class or a CSS custom property in a way that survives PNG
   rasterisation. The _page chrome_ around the preview does use the web-ui theme
   classes (`bg-background`, `text-muted-foreground`).

4. **Every constraint carries a message aimed at the fix.** `edges[3].to: "d2"
does not exist. Available nodes: user, hono, d1` rather than a raw Zod path.
   Cross-field rules (edge endpoints resolve, ids unique, nodes inside the
   canvas) live in one `superRefine` so a single parse returns every problem —
   a model that gets three errors at once fixes them in one retry.

5. **Every interpolated string is XML-escaped.** Node names and edge labels land
   inside SVG text nodes; an `&` or `<` in a technology name yields a document
   that silently fails to parse. One `escapeXml`, applied at every interpolation
   site. User-facing text fields chain `.trim()` before `.min(1)` — per
   `web/server-functions.md`, `.min(1)` alone accepts whitespace.

6. **`renderSVG` is deterministic.** No `Math.random`, no `Date`, no id
   generation. Snapshots stay stable, and phase 1 gets content-addressable
   caching for free.

7. **PNG export lives in the app.** It needs `XMLSerializer`, `Image` and
   `canvas` — browser APIs that must never leak into a package a Worker imports.
   The domain's job ends at the SVG string.

8. **The preview uses `dangerouslySetInnerHTML`.** The SVG comes from our own
   renderer, from a schema-validated config, with all text escaped, so the input
   is not attacker-controlled markup. Building it as a React tree instead would
   mean two renderers to keep in sync — the exact failure the shared-renderer
   design exists to prevent.

## Pre-existing defects this feature trips over

Both are in the blast radius of this work, so they are fixed here rather than
worked around.

**The web-ui stylesheet ships a duplicate Tailwind utilities layer.**
`packages/web-ui/src/index.ts` ends with `import "./styles.css"` while its Vite
config runs both `libInjectCss()` and `tailwindcss()`, so the package's `dist`
carries a full utilities layer that is injected into the app's chunk. Per
`web/tailwind-v4-split-css-cascade.md` — "one Tailwind build per app, owned by
the app" — this makes app-only responsive utilities lose the cascade in
production builds while working fine in dev. The two-pane layout is exactly
`grid md:grid-cols-2`, i.e. precisely the class of utility that breaks. Fix:
drop the side-effect import, rebuild the package.

**`turbo.json` declares the `test` task twice.** Invalid duplication, silently
tolerated. Removed while in the file.

## Testing

`monorepos/testing-strategy.md` puts schemas, constants and pure helpers at the
domain-unit layer: Vitest on node, no jsdom. Tests are co-located in
`__tests__/` beside the code they cover, per `monorepos/testing/unit-and-component.md`.

- **Schema** — one test per rule, asserting the message text rather than just
  the failure: unknown edge endpoint, duplicate ids, over-long `name`, node
  outside the canvas.
- **Render** — a snapshot of `renderSVG(exampleConfig)` for structural
  regressions, plus targeted assertions for what a snapshot hides: escaping,
  dark tiles, dashed edges selecting the grey marker.
- **Determinism** — two calls on one config return identical strings.

The `/editor` route gets no automated test this phase. The app has no Vitest
config, no `test` script, and the component-test layer would need jsdom, RTL and
the React dedup block from `monorepos/testing/unit-and-component.md` before the
first assertion could run. That setup is worth its own task when the page stops
being thin; here, verification is manual in the browser.

## Files

**Create**

| File                                                       | Purpose                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `packages/domain/src/constants/diagram.ts`                 | Tones, tile variants, edge styles, geometry, typography |
| `packages/domain/src/schemas/diagram.ts`                   | `diagramConfigSchema`, refinements, inferred types      |
| `packages/domain/src/render/*.ts`                          | `renderSVG` and the per-layer pure functions            |
| `packages/domain/src/{schemas,render}/__tests__/*.test.ts` | Domain-unit tests                                       |
| `apps/fullstack-fn-only/src/routes/editor.tsx`             | The page                                                |
| `apps/fullstack-fn-only/src/components/editor/*.tsx`       | Input and preview panes                                 |
| `apps/fullstack-fn-only/src/lib/export-png.ts`             | Client-side PNG export                                  |

**Modify**

| File                                     | Change                                                |
| ---------------------------------------- | ----------------------------------------------------- |
| `packages/domain/src/constants/index.ts` | Export the diagram constants                          |
| `packages/domain/src/schemas/index.ts`   | Export the diagram schema and types                   |
| `packages/domain/tsdown.config.ts`       | Add the `render` entry (tsdown regenerates `exports`) |
| `packages/web-ui/src/index.ts`           | Remove the `styles.css` side-effect import            |
| `turbo.json`                             | Remove the duplicated `test` task                     |

`packages/domain/package.json` is **not** hand-edited: its `exports` and
`publishConfig.exports` are owned by tsdown (`devExports: true`) and regenerate
on `bun run build`, per `packages/shared-package-build-strategy.md`.

## Delivery

Four sequential steps, each independently reviewable:

1. Cascade and turbo fixes, verified with the duplicate-utilities grep from the
   hub doc.
2. Constants + schema, with their tests.
3. Renderer, with its tests.
4. The `/editor` route and PNG export.
