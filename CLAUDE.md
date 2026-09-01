# Development Rules

This is a **multi-pattern** monorepo template (DDD + Hexagonal Architecture, TypeScript, Bun,
Turborepo). It ships four interchangeable web patterns plus a backend-only service pattern, mobile
and docs; `bun run customize` strips it down to the one you pick.

## Template Customization

Before starting development, customize a fresh clone:

- `bun run customize` — Interactive CLI: choose pattern, optional features (mobile, docs, Convex),
  project name. Handles directory deletion, package.json cleanup, CI/CD generation, infra-env
  cleanup, lint config cleanup, and scope rename. Self-deletes after completion.
- `bun run rename <scope>` — Standalone scope rename (`@monorepo-template` -> `@your-scope` across
  60+ files). Use if you only need to rename.

Always recommend `bun run customize` on a fresh clone. Do NOT do manual file-by-file customization.

## Knowledge lives in the hub, not here

Reusable, product-agnostic knowledge is **not** duplicated in this file — it lives in the
[general-knowledge hub](https://github.com/csdev19/general-knowledge). The README has the full stack
recipe table; start from the recipe matching your chosen pattern. Key topics (don't re-document them
here):

- **Feature workflow** — [MVP first, then refactor](https://github.com/csdev19/general-knowledge/blob/main/conventions/mvp-first-then-refactor.md).
- **Architecture & the dependency rule** — [architecture/](https://github.com/csdev19/general-knowledge/blob/main/architecture/README.md)
  (`domain <- application <- infra-*`; `infra-*` naming convention; import rules).
- **Client-Server proxy (Elysia/Hono patterns)** — the web app proxies `/api/auth/*` and `/api/v1/*`
  to the API Worker via Cloudflare Service Bindings (same-origin cookies on Workers). See
  [api/](https://github.com/csdev19/general-knowledge/blob/main/api/README.md) and the
  [elysia](https://github.com/csdev19/general-knowledge/blob/main/stacks/fullstack-elysia-eden.md) /
  [hono](https://github.com/csdev19/general-knowledge/blob/main/stacks/fullstack-hono-orpc.md) recipes.
- **Backend-only pattern (no web app)** — every consumer calls the service cross-origin, so there is
  no proxy and CORS becomes the real access boundary. The allowlist (`CORS_ORIGIN`), Better Auth's
  `trustedOrigins`, and `sameSite: "none"` cookies must all agree. See
  [service-only-hono](https://github.com/csdev19/general-knowledge/blob/main/stacks/service-only-hono.md)
  and [centralized auth service](https://github.com/csdev19/general-knowledge/blob/main/api/centralized-auth-service.md).
- **Convex (realtime pattern)** — [convex/](https://github.com/csdev19/general-knowledge/blob/main/convex/README.md)
  (client connection, Better Auth hosted in Convex, pinned SDK versions).
- **web-ui `dist/` build strategy** — [web/web-ui-package.md](https://github.com/csdev19/general-knowledge/blob/main/web/web-ui-package.md).
- **Cloudflare Wrangler & env config** — [monorepos/wrangler-env-config.md](https://github.com/csdev19/general-knowledge/blob/main/monorepos/wrangler-env-config.md).

## Package Import Rules

- `domain` never imports from `application` or `infra-*`
- `application` never imports from `infra-*` (uses domain interfaces)
- `infra-*` never imports from `application`
- Mobile apps (`apps/mobile/`, `apps/mobile-convex/`) only import `@monorepo-template/domain`
  (and, for `mobile-convex`, `@monorepo-template/convex-auth-api`)

## Project-specific rules

- **Skill Configuration:** Skills in `.claude/skills/` may have a **Configuration** table with paths
  (e.g. `DOCS_BASE`). If a skill's configured path no longer matches the actual project path, update
  the skill's Configuration table directly so future sessions don't re-discover it.
- **Env / Wrangler (sharp gotcha):** ALWAYS use `.env` (and `.dev.vars` for local Worker secrets).
  NEVER add a `vars` / `[vars]` / `[env.*]` block to `wrangler.jsonc` — Wrangler auto-loads `.env`,
  so a `vars` block drifts from the single source of truth. Wrangler is pinned in the root catalog;
  keep `compatibility_date` current and identical across all `wrangler.jsonc`, and run
  `wrangler types` after editing one. Full rules in the hub link above.
- **web-ui needs `dist/`:** `@monorepo-template/web-ui` exports point to built files. If you hit
  "Cannot find module", run `bun run build` inside `packages/web-ui/`. `dist/` is committed; rebuild
  after editing web-ui components.

## Common Commands

- `bun run db:push` — Push Drizzle schema to DB (run from monorepo root, NOT from `packages/infra-db/`)
- `bun run db:studio` — Open Drizzle Studio to inspect DB
