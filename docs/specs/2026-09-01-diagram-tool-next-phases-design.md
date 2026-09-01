# Diagram tool, next phases (icons, API + MCP, visual editor) — design

> **Status: proposed** · **Date:** 2026-09-01 · **Branches:** one per plan —
> `feat/diagram-icons`, `feat/diagram-api-mcp`, `feat/diagram-visual-editor`
> **Scope:** `packages/domain` (icons, schema, layout), `apps/fullstack-fn-only`
> (server routes, R2, resvg, MCP endpoint, editor interactions), `packages/infra-env`.

Everything after phase 0, split into three independently shippable plans:

| Plan                                                                                   | Roadmap phase | Delivers                                          |
| -------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| [01 — Icons](../plans/2026-09-01-diagram-tool-next-phases-01-icons.md)                 | 1.5           | Real framework/brand logos via `iconKey`          |
| [02 — API + MCP](../plans/2026-09-01-diagram-tool-next-phases-02-api-mcp.md)           | 1             | Server-side PNG, R2 storage, MCP tools for Claude |
| [03 — Visual editor](../plans/2026-09-01-diagram-tool-next-phases-03-visual-editor.md) | 2             | Drag, inline edits, save-as-new-id, auto-layout   |

Phase 3 of the roadmap (an in-app "generate with AI" button, a gallery,
productisation) is deliberately **not** designed here. It only makes sense after
the MCP flow has been used for real, and designing it now would be guessing.

## Why icons run before the API

The roadmap ordered API (1) before icons (1.5) and accepted monochrome emoji in
server PNGs as an interim state. This design swaps them, for three reasons:

1. The single known rendering risk of the API phase is that resvg does not
   rasterise colour emoji. Shipping icons first removes that risk before it
   exists, instead of shipping a degraded interim and migrating later.
2. Icons are pure domain + renderer work — half a day, no infrastructure, no
   new dependencies on anything the API phase builds.
3. Real logos are an explicitly requested capability, not a nice-to-have.

The plans stay independent: executing them in roadmap order still works, because
the API phase treats emoji as a legitimate fallback rather than a requirement.

## Architecture

### The one deviation from the original planning docs: no separate Worker

The planning docs (docs 03/04) assumed a dedicated Hono API Worker beside the
web app. This repo deliberately chose the **fullstack-fn-only** pattern — one
TanStack Start app on Cloudflare Workers, no separate server — precisely so that
server-side logic, when it arrived, would live inside the app. The API therefore
ships as **TanStack Start server routes in `apps/fullstack-fn-only`**, on the
same Worker that serves the editor:

- One deployable, one `wrangler.jsonc`, one CI pipeline — no new topology.
- `editUrl` becomes same-origin: `/editor?d=<id>` on the app itself.
- The R2 binding hangs off the app's Worker.
- The MCP endpoint is one more server route on the same origin.

What phase 0 placed in `packages/domain` makes this cheap: the schema, renderer
and guidelines are already pure and importable from Worker code unchanged.

### Target endpoint surface (plan 02)

```
POST /api/render     bearer-protected; config -> validate -> SVG -> PNG -> R2
                     -> { id, pngUrl, svgUrl, editUrl }
POST /api/validate   config -> { ok } | { ok: false, errors: [...] }
GET  /d/:id.png|.svg|.json   immutable objects served from R2, cache forever
ALL  /api/mcp        MCP over streamable HTTP: get_diagram_guidelines,
                     validate_diagram, render_diagram
```

Objects are immutable — the id embeds a UUID fragment, editing produces a new
id, history is free. All three tools and both REST endpoints are thin wrappers
over `validateDiagramConfig` + `renderSVG`; no logic is duplicated.

### Icons (plan 01)

`simple-icons` becomes the source of brand marks: CC0-licensed, monochrome
single-path SVGs with the official brand hex, importable as plain data
(`siReact.path`, `siReact.hex`) — which means they work in a Worker exactly like
the guidelines string does. A curated registry in `packages/domain` maps an
`iconKey` to its path and colour; nodes gain an optional `iconKey` that takes
precedence over `emoji`, and `emoji` relaxes to optional (a node needs one of
the two). The registry's keys are interpolated into the authoring guidelines the
same way the limits are, so a model always knows exactly which keys exist.

### Visual editor (plan 03)

Phase 0's invariant — the textarea text is the only state, everything else
derives — survives: a drag or an inline edit parses the current text, mutates
the config, and writes pretty-printed JSON back. The text stays authoritative,
undo is text-level, and the JSON and canvas can never disagree. Saving calls a
server function that injects the render token server-side, because the token
must never reach the client — the one legitimate server-function use in this
feature, per the hub's rule.

## Key decisions

1. **Server routes in the app, not a new Worker.** Decided when the template was
   customised; restated here because it contradicts the original planning docs.
2. **`simple-icons` over hand-collected brand SVGs.** CC0 licensing sidesteps
   the brand-kit question for personal use (productising still means reviewing
   brand guidelines, as the roadmap already noted); one dependency replaces a
   hand-maintained asset folder; tree-shaking keeps only the curated icons.
3. **Fonts ship in plan 02, not before.** Inter and JetBrains Mono (both OFL)
   are needed for browser/server parity. Until a server render exists there is
   nothing to be identical to; phase 0 already isolated the swap to `theme`
   constants plus one `@font-face` block.
4. **The MCP transport is an investigation task, not an assumption.** The
   TypeScript SDK's HTTP transport targets Node; Workers adapters exist but the
   landscape moves. The plan pins the acceptance criterion — connects as a
   claude.ai custom connector and completes all three tools — and leaves the
   adapter choice to the task, with a stateless JSON-RPC handler as fallback.
5. **Auto-layout is the tail of plan 03, cuttable.** Straight lines plus honest
   spacing already cover most diagrams; layout from logical rows is valuable but
   must not block drag-and-save from shipping.

## Testing

Same layering as phase 0. Icons and layout logic are domain-unit tests (vitest,
node). Server routes get request-level tests where cheap, plus a manual curl
checklist and a golden-PNG hash comparison in CI once resvg output is stable.
The editor's interactions finally justify the app-level vitest + jsdom + RTL
setup the hub prescribes — installing it is plan 03's first task, including the
React dedup config the hub warns about.

## Risks

- **resvg-wasm inside the Vite/Workers dev loop.** The roadmap already called
  this the place "donde se va el tiempo". Plan 02 sequences it as an isolated
  spike before anything depends on it.
- **MCP adapter churn** — see key decision 4.
- **`simple-icons` coverage gaps** (a needed logo missing or renamed). The
  registry test iterates every curated key, so a gap fails loudly at build time,
  and the schema treats `iconKey` as optional so a gap never blocks a diagram.
