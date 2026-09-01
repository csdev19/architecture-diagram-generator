# 06 — Roadmap and honest estimate

> **Status: partially executed, kept as historical record** (2026-09-01). Phase 0 is complete. The execution order changed — icons (1.5) now precede the API (1); the reasons are in [the next-phases design](./2026-09-01-diagram-tool-next-phases-design.md). Phase 3 remains deliberately undesigned.

## Phase 0 — Validation without infra (half a day)

- Port the jsx prototype to `renderSVG()` in pure TS (packages/core).
- Minimal page on your site: JSON textarea → preview → client-side PNG export.
- Usage: you ask me for diagrams in the chat, I give you the JSON, you paste it, you export.
- **Goal:** validate that the schema and the aesthetics work with real
  cases of yours before building anything else.

## Phase 1 — API + MCP (1-2 days)

- Hono Worker: /render, /validate, /d/:id, R2, resvg-wasm.
- Bundled fonts (Inter + JetBrains Mono) for browser/server parity.
- MCP server at /mcp with the 3 tools; connect in claude.ai.
- Deploy with Alchemy.
- **Result:** the full "ask for it in the chat → PNG on your infra" flow.
- Main risk: resvg-wasm + fonts setup on Workers. It is well
  documented but it is where the time goes if something doesn't line up. Emoji
  will come out monochrome on the server until phase 1.5.

## Phase 1.5 — Our own icon set (half a day - 1 day)

- `iconKey` in the schema + inline SVGs of logos/glyphs in packages/core.
- Solves emoji in resvg AND gives you the real logos of each technology.
- Brand logos: use them from their official brand kits; to publish the
  tool to third parties review each brand's guidelines.

## Phase 2 — Visual editor (2-3 days)

- Load via `?d=id`, node dragging (pointer events over the SVG, snap to a
  13px grid), inline text editing, add/remove edges.
- Save → new id (immutable). PNG/SVG/JSON export buttons.
- Optional auto-layout (`layout.ts`): logical rows → coordinates, so you don't
  depend on the AI computing pixels.

## Phase 3 — Optional / product

- "Generate with AI" button on the web (server-side Anthropic API).
- Gallery of your diagrams (list R2).
- If it works well for you: a natural portfolio-product candidate
  (Quechua name pending 🙂) — a "diagrams-as-code with guaranteed
  aesthetics + MCP" is a real niche between Mermaid (ugly by default) and
  Excalidraw (everything by hand).

## Operating costs

| Item                              | Cost                            |
| --------------------------------- | ------------------------------- |
| Workers (free tier: 100k req/day) | $0 for your volume              |
| R2 (10GB free, free egress)       | $0                              |
| Claude generating configs via MCP | included in your claude.ai plan |
| Anthropic API (only if phase 3)   | cents per diagram               |

## What NOT to build (for now)

- Multiple themes/aesthetics: the whole point is ONE consistent aesthetic.
- Edges with automatic orthogonal routing (curves avoiding nodes): rabbit
  hole; straight lines + a good layout cover 95%.
- Collaboration/real-time: not the use case.
- Multi-user auth: static token until there are third parties.

## Definition of "done" (phase 1)

You can write in a fresh claude.ai chat: "make me the diagram of laqi's
architecture" and in one turn you receive a pngUrl with the correct
aesthetics plus a working editUrl. Everything else is incremental improvement.
