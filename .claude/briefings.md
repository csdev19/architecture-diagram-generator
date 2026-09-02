# Briefings binding

Where the briefings live and what regenerates them. Read by the
`generate-briefings` skill. Paths are relative to the repo root.

## Location

`apps/documentation/src/content/docs/briefings/` — this repo calls the set
**Briefings**, served by Astro Starlight. Pages are `.mdx` with Starlight
frontmatter (`title`, `description`); the sidebar group lives in
`apps/documentation/astro.config.mjs` and lists the pages explicitly, so a new
briefing needs an entry there.

## Briefings in this repo

| Briefing         | File               | Notes                                                                      |
| ---------------- | ------------------ | -------------------------------------------------------------------------- |
| `index`          | `index.mdx`        |                                                                            |
| `pitch`          | `pitch.mdx`        |                                                                            |
| `ai-briefing`    | `ai-briefing.mdx`  |                                                                            |
| `stack`          | `stack.mdx`        |                                                                            |
| `roadmap`        | `roadmap.mdx`      |                                                                            |
| `design-brief`   | `design-brief.mdx` | The **diagram** palette, not the app chrome — see Repo rules               |
| `business-brief` | —                  | Not created; founder has no monetisation model ("solo es una herramienta") |

## Sources of truth

| For                 | Read                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| shipped / in flight | `gh pr list --state merged --limit 100` and `gh pr list --state open`; `git log --oneline` as the fallback |
| public interface    | `apps/fullstack-fn-only/src/routes/` and the `exports` map of every `packages/*/package.json`              |
| schemas             | `packages/domain/src/schemas/diagram.ts`                                                                   |
| stack               | root `package.json` (workspace catalog) + every `apps/*/package.json` and `packages/*/package.json`        |
| design values       | `packages/domain/src/constants/diagram.ts`, `packages/domain/src/constants/diagram-icons.ts`               |
| the exported frame  | `packages/domain/src/render/frame.ts` — the document's bounds are derived, not declared                    |
| positioning copy    | `apps/documentation/src/content/docs/features/diagram-tool/index.mdx` and the root `README.md`             |
| published version   | nothing is published — verify with `npm view @diagram-tool/domain version` (404) and `git tag` (empty)     |

ADRs live in
`apps/documentation/src/content/docs/architecture/decisions/`. Read them before
writing about the editor or the renderer — they carry the reasoning that the
**Shared Decisions** table in `features/diagram-tool/index.mdx` only summarises.
Treat `docs/specs/` and `docs/plans/` as **intent only** — they describe work
that may never have been built.

## Repo rules

- Language: English on every published surface, including this file and every
  briefing. Chat may be Spanish; artifacts never are.
- Safe positioning: "architecture diagrams as data"; a config a model writes and
  a person then edits by dragging; one renderer, so the preview and the export
  cannot disagree.
- Never claim: that it is **published or deployed** (nothing on npm, no tags, no
  deploy target in use); that it is **production-ready, stable or battle-tested**
  (no release, no users, the schema can still change); that it **replaces
  Mermaid, Excalidraw or Figma** — no competitive substitution claims.
- Phase 1 (server-side render, R2 storage, MCP server) is **not built**. Only a
  throwaway rasterisation spike exists, on an open branch. Never write about
  generating diagrams from Claude in the present tense.
- The `design-brief` covers the **diagram palette** in `constants/diagram.ts`.
  The app's own chrome is unmodified shadcn/ui defaults in
  `packages/web-ui/src/styles.css` and is deliberately out of scope; say so
  rather than documenting stock values as if they were design decisions.
- Colours in `constants/diagram.ts` are literal hex, never theme tokens, because
  they are written into SVG attributes that must survive rasterisation outside a
  browser. A briefing must not suggest wiring them to CSS variables.

## Validation

`cd apps/documentation && bun run build` (Astro build — catches bad frontmatter
and unresolved imports). It does **not** check internal links, so verify every
link target by hand.
