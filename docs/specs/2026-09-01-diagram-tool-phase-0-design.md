# Diagram tool, phase 0 (`@diagram-tool/core` + `/editor`) — design

> **Status: proposed** (2026-09-01). The client-only slice of the diagram tool:
> a shared SVG renderer package and a web page that turns a pasted
> `DiagramConfig` JSON into a preview and a downloadable PNG. No server, no
> storage, no MCP — those arrive in phase 1.

## Problem

Architecture diagrams for the portfolio projects are drawn by hand, so they
drift in style: different spacing, different colors, different arrow weights.
The fix is to stop treating a diagram as a drawing and start treating it as
data — a `DiagramConfig` JSON that a single renderer turns into SVG, so every
diagram is consistent by construction.

Phase 0 answers the cheapest version of the question: does the schema describe
real architectures well, and does the resulting aesthetic hold up? It needs no
infrastructure to answer. Claude produces a config in chat, the config is
pasted into a page, the page renders it and exports a PNG.

The eventual system (phase 1+) has Claude call a Worker over MCP, which renders
the same SVG server-side, rasterises it with resvg and stores it in R2. The
renderer is therefore designed from day one to run unchanged in both places.

## Goal

- `renderSVG(config): string` — a pure, deterministic function producing the
  complete SVG for a validated config, with no React, DOM or Node dependency.
- `diagramConfigSchema` — Zod validation whose failure messages are actionable
  enough for a model to self-correct in one retry.
- A public `/editor` page: paste JSON on the left, live preview on the right,
  one button that downloads a 2x PNG.

## Non-goals (this phase)

- **Auto-layout** (`layout.ts`). Coordinates are authored by hand or by Claude
  following the rules in the guidelines. Phase 2.
- **Icon set / `iconKey`.** Nodes keep the `emoji` field. Phase 1.5 replaces it
  once server-side rendering makes colour emoji a problem.
- **API Worker, R2, MCP server.** Phase 1.
- **Loading a saved diagram by id** (`/editor?d=<id>`). There is nothing to load
  from yet; phase 1 adds it.
- **Visual editing** — dragging nodes, inline text edits. Phase 2. In phase 0
  "editing" means changing the JSON and watching the preview update.
- **Bundled webfonts** (Inter, JetBrains Mono). They exist to make the browser
  preview and the server PNG identical; with no server there is nothing to
  match. Phase 1.

## Architecture

Two pieces, split along one line: what must also run inside a Cloudflare Worker
goes in the package, what needs a browser stays in the app.

```
packages/core/                       @diagram-tool/core — pure TS, no React, no DOM
  src/schema.ts                      diagramConfigSchema + cross-field refinements
  src/validation.ts                  validateDiagramConfig + actionable messages
  src/render/
    index.ts                         renderSVG(config) — orchestrates the layers
    theme.ts                         palette, sizes, fonts, tone table
    background.ts                    base rect + grid pattern
    group.ts                         renderGroup
    node.ts                          renderNode
    edge.ts                          renderEdge + anchor geometry
    svg.ts                           escapeXml and attribute helpers
  src/index.ts                       public exports

apps/fullstack-fn-only/
  src/routes/editor.tsx              public route, outside _authenticated
  src/components/editor/
    json-input.tsx                   textarea + validation error list
    diagram-preview.tsx              SVG preview + export button
  src/lib/export-png.ts              SVG string -> canvas at 2x -> download
```

### Public API

```ts
renderSVG(config: DiagramConfig): string
diagramConfigSchema: ZodType<DiagramConfig>
validateDiagramConfig(input: unknown):
  | { ok: true; config: DiagramConfig }
  | { ok: false; errors: string[] }

type DiagramConfig, DiagramNode, DiagramGroup, DiagramEdge
```

`validateDiagramConfig` is the seam phase 1 reuses: the Worker's `/validate`
endpoint and the MCP `validate_diagram` tool are thin wrappers over it.

### Data flow

```
JSON text ──parse──> unknown ──validateDiagramConfig──> DiagramConfig ──renderSVG──> SVG string
                                       │                                                  │
                                  errors[] ──> shown under the textarea          preview + PNG export
```

The page holds one piece of state: the raw textarea string. Everything else is
derived, so there is no way for the preview to disagree with the text.

## Key decisions

**Naming follows the repo, not the planning docs.** The docs write
`NodeSchema`; `packages/domain` writes `todoBaseSchema`. The repo convention
wins: `diagramConfigSchema`, `diagramNodeSchema`, with PascalCase reserved for
the inferred types.

**All cross-field validation lives in one `superRefine`.** Edge endpoints
resolving to real nodes, unique ids, nodes inside the canvas — collected in a
single pass so one parse returns every problem. Single-field limits (the 26
character budget on `name` and `sub`) stay as ordinary `.max()` constraints on
their fields. A model that gets three errors at once fixes them in one retry; a
model that gets them one at a time burns three turns.

**Validation messages name the fix, not the rule.** `edges[3].to: "d2" does not
exist. Available nodes: user, hono, d1` rather than a raw Zod path. This is the
difference between a tool that converges on its own and one that needs a human.

**Every interpolated string is XML-escaped.** Node names and edge labels land
inside SVG text nodes; a `&` or `<` in a technology name would produce a
document that silently fails to parse. One `escapeXml` helper, applied at every
interpolation site.

**The theme is a module, not scattered literals.** Tones, tile colours, stroke
widths and font families live in `theme.ts`. Phase 1 swaps `system-ui` for
bundled Inter by editing one file rather than hunting hex codes across five.

**`renderSVG` is deterministic.** No `Math.random`, no `Date`, no id
generation. Snapshot tests stay stable, and phase 1 gets content-addressable
caching for free.

**PNG export lives in the app.** It needs `XMLSerializer`, `Image` and
`canvas` — browser APIs that must never leak into a package the Worker
imports. The package's job ends at the SVG string.

**The preview uses `dangerouslySetInnerHTML`.** The SVG is produced by our own
renderer from a schema-validated config, with all user text escaped, so the
input is not attacker-controlled markup. The alternative — building the SVG as
a React tree — would mean two renderers to keep in sync, which is the exact
failure the shared-package design exists to prevent.

## Testing

`packages/core` is pure functions over plain data, so it is tested directly
with vitest, TDD:

- **Schema** — one test per refinement, asserting the message text, not just
  the failure. Unknown edge endpoint, duplicate ids, over-long `name`, node
  outside the canvas.
- **Render** — a snapshot of `renderSVG(exampleConfig)` to catch structural
  regressions, plus targeted assertions for the parts a snapshot hides:
  escaping, dark tiles, dashed edges selecting the grey marker.
- **Determinism** — two calls on the same config return identical strings.

The app gets no automated tests this phase: it has no test setup today, and the
page is thin enough that adding one is not worth its weight. Verification is
manual, in the browser.

## Delivery

Sequential, each step independently reviewable:

1. `packages/core` scaffold — package.json, tsconfig, tsdown, vitest, wired
   into the workspace.
2. Schema + validation, with its tests.
3. Renderer, with its tests.
4. `/editor` route consuming the package.

## Local development note

`apps/fullstack-fn-only/.env` holds placeholder values. The app's root route
calls `getAuthSession()` on every navigation and `infra-db` constructs the Neon
client at import time, so `DATABASE_URL` must parse as a Postgres URL even
though nothing dials it — Better Auth returns `null` without a session cookie
and never reaches the database. Auth and the Todo example are left in place
deliberately, for the day the tool wants accounts.
