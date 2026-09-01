# Diagram Tool — Architecture diagram generator (original plan)

> **Status: historical reference** (2026-09-01). English translation of the original pre-project planning notes, preserved as the founding design record. Phase 0 shipped from this design; the deviations that survived contact with the codebase are recorded in [the phase 0 spec](./2026-09-01-diagram-tool-phase-0-design.md) and [the next-phases spec](./2026-09-01-diagram-tool-next-phases-design.md). Most notable drift: the repo uses the fullstack-fn-only pattern (no separate `apps/api`), and the shared renderer lives in `packages/domain`, not `packages/core`.

Web tool + MCP server to generate "tech stack"-style architecture diagrams
(grid, groups, tiles, labeled arrows) exportable to PNG.

## Concept

The diagram **is not a drawing, it is data**. The whole system revolves around a
configuration JSON (`DiagramConfig`) that describes groups, nodes and arrows. Three pieces
consume it:

```
                    ┌──────────────────────────────────────────────┐
                    │              DiagramConfig (JSON)             │
                    └──────────────────────────────────────────────┘
                       ▲                  ▲                   │
        ┌──────────────┘                  │                   ▼
  Claude (chat via MCP)          Web editor (human)     SVG renderer
  generates config from          adjusts final          (shared)
  a text description             details                      │
                                                              ▼
                                                    PNG export (2x)
```

## The three usage modes

1. **Claude via MCP (the main flow).** In claude.ai you connect the MCP server.
   You ask it "make me the diagram of Tapuy's architecture" → Claude generates the
   `DiagramConfig`, calls the `render_diagram` tool → your Worker renders the SVG,
   converts it to PNG, stores it in R2 and returns the URL. You receive the finished
   PNG in the chat.

2. **Web editor.** The same config opens in the web app for final touch-ups:
   moving nodes, fixing texts, re-exporting. This is where you add "the last details".

3. **Direct API.** `POST /render` with the JSON returns the PNG. Useful for CI,
   automated docs, or other tools of yours.

## Stack (aligned with your current setup)

| Layer                 | Technology                             | Notes                                          |
| --------------------- | -------------------------------------- | ---------------------------------------------- |
| Monorepo              | Turborepo + Bun workspaces             | `apps/web`, `apps/api`, `packages/core`        |
| Shared renderer       | Pure TypeScript (generates SVG string) | In `packages/core`, no React or DOM dependency |
| Web app               | TanStack Start on Cloudflare Workers   | Editor + preview                               |
| API + MCP             | Hono on Cloudflare Workers             | REST endpoints + MCP over HTTP                 |
| SVG → PNG server-side | `@resvg/resvg-wasm`                    | Runs on Workers (WASM)                         |
| Storage               | Cloudflare R2                          | Generated PNGs, public URLs                    |
| IaC / deploy          | Alchemy                                | Workers + R2 + routes                          |
| Lint / hooks          | oxlint + oxfmt + lefthook              | Same as your other projects                    |

## Monorepo structure

```
diagram-tool/
├── packages/
│   └── core/              # DiagramConfig types + validator + renderSVG()
│       ├── src/schema.ts
│       ├── src/render.ts
│       └── src/layout.ts  # auto-layout (phase 2)
├── apps/
│   ├── web/               # TanStack Start: editor + preview + client export
│   └── api/               # Hono: /render, /diagrams/:id, MCP endpoint
├── docs/                  # these files
└── alchemy.run.ts
```

## Key decision: shared renderer

`renderSVG(config): string` lives in `packages/core` and produces **the same SVG**
on the client (editor preview) and on the server (PNG via resvg). A single render
codebase = zero divergence between what you see in the editor and what Claude generates.

That is why the renderer is written in pure TS with template strings, not as a
React component. The web app mounts it with `dangerouslySetInnerHTML` (or a
minimal wrapper) and the Worker passes it straight to resvg.

## Reading order for the docs

1. [01 — config schema](./2026-09-01-diagram-tool-original-01-config-schema-design.md) — the JSON contract (the most important one)
2. [02 — renderer](./2026-09-01-diagram-tool-original-02-renderer-design.md) — how the SVG is drawn and the PNG export
3. [03 — API worker](./2026-09-01-diagram-tool-original-03-api-worker-design.md) — Hono + resvg + R2
4. [04 — MCP server](./2026-09-01-diagram-tool-original-04-mcp-server-design.md) — how to open the tool up so Claude can use it
5. [05 — AI generation](./2026-09-01-diagram-tool-original-05-ai-generation-design.md) — the prompt that turns text → config
6. [06 — roadmap](./2026-09-01-diagram-tool-original-06-roadmap-design.md) — phases and an honest estimate

## Design principle

The aesthetic is part of the contract: background grid, rounded tiles with
emoji/icon, monospace sublabels, solid blue arrows for the main flow
and dashed gray ones for secondary relationships, groups with the label sitting on
the border. The MCP user never picks colors pixel by pixel — they pick semantics
(`style: "solid" | "dashed"`, group `tone`) and the renderer guarantees
consistency. That is what makes every diagram on your site look like it belongs
to the same family.
