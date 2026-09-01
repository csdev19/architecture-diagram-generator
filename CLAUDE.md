# Development Rules

This is a **Fullstack serverFn only (apps/fullstack-fn-only)** project (DDD + Hexagonal Architecture, TypeScript, Bun,
Turborepo), scaffolded from monorepo-template.

## Knowledge lives in the hub, not here

Reusable, product-agnostic knowledge is **not** duplicated in this file — it lives in the
[general-knowledge hub](https://github.com/csdev19/general-knowledge). The README has the full stack
recipe table; start from the recipe matching your chosen pattern. Key topics (don't re-document them
here):

- **Feature workflow** — [MVP first, then refactor](https://github.com/csdev19/general-knowledge/blob/main/conventions/mvp-first-then-refactor.md).
- **Architecture & the dependency rule** — [architecture/](https://github.com/csdev19/general-knowledge/blob/main/architecture/README.md)
  (`domain <- application <- infra-*`; `infra-*` naming convention; import rules).
- **Fullstack serverFn pattern** — a single TanStack Start app on Cloudflare Workers, no separate
  API Worker or proxy: server-only logic lives in TanStack Start server functions. See
  [fullstack-tanstack recipe](https://github.com/csdev19/general-knowledge/blob/main/stacks/).
- **web-ui `dist/` build strategy** — [web/web-ui-package.md](https://github.com/csdev19/general-knowledge/blob/main/web/web-ui-package.md).
- **Cloudflare Wrangler & env config** — [monorepos/wrangler-env-config.md](https://github.com/csdev19/general-knowledge/blob/main/monorepos/wrangler-env-config.md).

## Package Import Rules

- `domain` never imports from `application` or `infra-*`
- `application` never imports from `infra-*` (uses domain interfaces)
- `infra-*` never imports from `application`

## Project-specific rules

- **Skill Configuration:** Skills in `.claude/skills/` may have a **Configuration** table with paths
  (e.g. `DOCS_BASE`). If a skill's configured path no longer matches the actual project path, update
  the skill's Configuration table directly so future sessions don't re-discover it.
- **Env / Wrangler (sharp gotcha):** ALWAYS use `.env` (and `.dev.vars` for local Worker secrets).
  NEVER add a `vars` / `[vars]` / `[env.*]` block to `wrangler.jsonc` — Wrangler auto-loads `.env`,
  so a `vars` block drifts from the single source of truth. Wrangler is pinned in the root catalog;
  keep `compatibility_date` current and identical across all `wrangler.jsonc`, and run
  `wrangler types` after editing one. Full rules in the hub link above.
- **web-ui needs `dist/`:** `@diagram-tool/web-ui` resolves to `src/` under the `development`
  condition and to `dist/` otherwise. `dist/` is **git-ignored** — `turbo run build` produces it
  (`build` dependsOn `^build`), so a fresh clone builds it before the app. If you hit "Cannot find
  module", run `bun run build` inside `packages/web-ui/`.
- **web-ui must never import a stylesheet in `src/index.ts`:** one Tailwind build per app, owned by
  the app. Consumers pull the theme via `@import "@diagram-tool/web-ui/styles.css"` (that export
  points at `src/styles.css`). A side-effect CSS import there makes `vite-plugin-lib-inject-css`
  ship a second `@layer utilities` inside `dist`, which loads after the app's and wins the cascade —
  app-only responsive classes (`md:grid-cols-2`) then collapse in production builds while working in
  dev. See [tailwind-v4-split-css-cascade](https://github.com/csdev19/general-knowledge/blob/main/web/tailwind-v4-split-css-cascade.md).

## Common Commands

- `bun run db:push` — Push Drizzle schema to DB (run from monorepo root, NOT from `packages/infra-db/`)
- `bun run db:studio` — Open Drizzle Studio to inspect DB
