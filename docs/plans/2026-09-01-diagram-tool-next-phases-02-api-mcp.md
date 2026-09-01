# Diagram tool, next phases — plan 02: API + MCP

**Design:** [`/docs/specs/2026-09-01-diagram-tool-next-phases-design.md`](../specs/2026-09-01-diagram-tool-next-phases-design.md)
**Branch:** `feat/diagram-api-mcp` · **Date:** 2026-09-01 · **Roadmap phase:** 1

**Goal.** In a fresh claude.ai chat: "draw me the architecture of X" → Claude
calls the MCP tools → a PNG rendered by this repo's own renderer lands in R2 →
the chat shows `pngUrl` and a same-origin `editUrl`.

**Architecture.** TanStack Start server routes inside `apps/fullstack-fn-only`
— same Worker as the editor, no new deployable. R2 binding on that Worker;
`@resvg/resvg-wasm` rasterises; bundled Inter + JetBrains Mono give browser and
server byte-identical text.

**Tech stack.** `@resvg/resvg-wasm`, R2, Inter + JetBrains Mono (OFL), an MCP
transport chosen in Task 5, `wrangler` CLI for types and bucket management.

## Conventions to read before starting

Phase-0 plan's conventions section still applies. Sharp ones for this plan:

- **Env/Wrangler (CLAUDE.md):** secrets go in `.env` / `.dev.vars`, NEVER in a
  `vars` block in `wrangler.jsonc`. Bindings (R2) do belong in `wrangler.jsonc`.
  Run `wrangler types` after editing it. Note: CLAUDE.md claims wrangler is
  pinned in the root catalog — it is not (stale claim, fix it when adding it).
- **Server functions vs server routes:** these endpoints serve _external_
  callers (Claude, curl, CI), so they are server **routes** with explicit
  paths, not `createServerFn` RPC.
- Every wrapper stays thin: `validateDiagramConfig`, `renderSVG` and
  `DIAGRAM_GUIDELINES` already exist in `@diagram-tool/domain` — no logic gets
  re-implemented in route handlers.

## File structure

**Create**

```
apps/fullstack-fn-only/src/server/resvg.ts          wasm init singleton + svgToPng
apps/fullstack-fn-only/src/server/fonts.ts          load font buffers once per isolate
apps/fullstack-fn-only/src/server/diagram-store.ts  id minting + R2 put/get helpers
apps/fullstack-fn-only/src/server/__tests__/        id + store unit tests
apps/fullstack-fn-only/src/routes/api/render.ts     POST, bearer-protected
apps/fullstack-fn-only/src/routes/api/validate.ts   POST
apps/fullstack-fn-only/src/routes/d/$file.ts        GET from R2, immutable cache
apps/fullstack-fn-only/src/routes/api/mcp.ts        MCP endpoint
apps/fullstack-fn-only/public/fonts/                Inter + JetBrains Mono (OFL)
```

**Modify**

```
package.json                              wrangler + @resvg/resvg-wasm in catalog
apps/fullstack-fn-only/package.json       new deps
apps/fullstack-fn-only/wrangler.jsonc     R2 binding BUCKET (diagram-renders)
apps/fullstack-fn-only/.env(.example)     RENDER_TOKEN placeholder
packages/infra-env/src/fullstack-server.ts  RENDER_TOKEN in the schema
packages/domain/src/constants/diagram.ts  font family names once fonts are real
apps/fullstack-fn-only/src/index.css      @font-face for both faces
.github/workflows/*                       deploy needs the bucket + secret
apps/documentation/…                      feature docs + changelog
```

## Task 1 — Spike: resvg-wasm renders inside this Worker (isolate the risk)

The roadmap called this the place where the time goes. Nothing else in the plan
starts until this proves out.

- [ ] Add `@resvg/resvg-wasm` and `wrangler` to the catalog; install.
- [ ] `src/server/resvg.ts`: import the `.wasm` as a module, `initWasm` behind a
      module-level promise (once per isolate), `svgToPng(svg, fonts, scale)`
      with `loadSystemFonts: false`.
- [ ] Prove it in dev: a throwaway server route renders
      `EXAMPLE_DIAGRAM_CONFIG` to PNG; `curl … | file -` says PNG, and the
      image opens. If the Vite/Workers dev loop rejects the wasm import,
      resolve it here (`@cloudflare/vite-plugin` wasm-module support is the
      first lever) before touching anything else.
- [ ] Record what was learned in the plan or docs — this is the step future
      phases will want the notes from.

## Task 2 — Fonts: one face on both sides

- [ ] Vendor Inter and JetBrains Mono (regular + the bold weight the renderer
      uses) as TTF/WOFF2 under `public/fonts/`, licenses alongside.
- [ ] `src/server/fonts.ts`: fetch the TTFs through the assets binding once per
      isolate, hand `ArrayBuffer`s to resvg.
- [ ] Swap `DIAGRAM_TYPOGRAPHY` families to `"Inter", system-ui, …` and
      `"JetBrains Mono", ui-monospace, …`; add the `@font-face` block to the
      app's CSS so the editor preview uses the same faces.
- [ ] Update the renderer snapshot (families changed); rasterise server-side and
      in-browser, compare visually.

## Task 3 — Store and REST endpoints (test-first where it pays)

- [ ] R2: create the `diagram-renders` bucket, add the `BUCKET` binding to
      `wrangler.jsonc`, run `wrangler types`, keep `compatibility_date` as-is.
- [ ] `diagram-store.ts`: `mintId(title)` → slugified title + 8 uuid chars
      (unit-test slugging: spaces, accents, emoji, overlong titles); `put`
      writes `{id}.png/.svg/.json` with content types; `get` streams one back.
- [ ] `POST /api/validate`: body → `validateDiagramConfig` → `{ ok }` or
      `{ ok: false, errors }`, status 200/400.
- [ ] `POST /api/render`: reject without `Authorization: Bearer $RENDER_TOKEN`
      (add `RENDER_TOKEN` to the env schema, `.env`, `.env.example`); validate →
      `renderSVG` → `svgToPng(2x)` → store all three objects → `{ ok, id,
pngUrl, svgUrl, editUrl }` with `editUrl = /editor?d=<id>` on the request
      origin.
- [ ] `GET /d/:file`: serve from R2 with the stored content type and
      `cache-control: public, max-age=31536000, immutable`; 404 on miss.
- [ ] Curl checklist in the plan: happy path, bad token, invalid config (errors
      array comes back verbatim from the domain), fetch of all three objects.

## Task 4 — Editor loads a saved diagram

- [ ] `/editor?d=<id>`: on mount, fetch `/d/<id>.json`, pretty-print into the
      textarea; a bad id shows a problem in the existing error channel. Nothing
      else changes — full editing UX is plan 03.

## Task 5 — MCP endpoint (investigation with a pinned finish line)

Acceptance: from claude.ai, add `https://<host>/api/mcp` as a custom connector
(static token header), and in a fresh chat complete the loop —
`get_diagram_guidelines` → model writes a config → `validate_diagram` (broken
config comes back with the domain's actionable errors) → `render_diagram` →
`pngUrl` + `editUrl` in the reply.

- [ ] Evaluate, in order: the official TypeScript SDK with a fetch/Workers
      transport adapter; a fetch-native MCP micro-library; hand-rolled
      stateless JSON-RPC (initialize, tools/list, tools/call) as the floor —
      three tools is a small surface. Choose the lightest that passes
      acceptance; write the choice and why into the feature doc.
- [ ] Tool schemas come from the domain: `validate_diagram` and
      `render_diagram` take the config (the existing Zod schema), and reuse the
      exact handlers from Task 3 — the MCP layer only adapts protocol.
- [ ] The render tool must degrade well: on validation failure it returns the
      errors as tool output (the model self-corrects), never a protocol error.
- [ ] Scope guard from the planning docs: no knowledge tools, render-only. The
      server stays generic.

## Task 6 — Deploy, docs, verify

- [ ] CI: `RENDER_TOKEN` secret, bucket exists in the Cloudflare account,
      deploy workflow still green; fix CLAUDE.md's stale wrangler-catalog line.
- [ ] Golden-image guard in CI: render the canonical example server-side and
      compare against a committed reference (hash, or pixelmatch with
      tolerance) — catches font/wasm regressions the SVG snapshot cannot see.
- [ ] Feature docs: new `api-worker` sub-feature page (decisions: in-app routes,
      transport chosen, id immutability; gotchas: wasm init, fonts, token) +
      changelog entry; parent index row flips 📋 → ✅. Docs app builds, pages 200.
- [ ] `bun run check-types && bun run lint && bun run test && bun run build`,
      then the full definition of done: the fresh-chat MCP loop, end to end.
- [ ] PR against `main`.
