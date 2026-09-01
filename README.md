# diagram-tool

A Fullstack serverFn only (apps/fullstack-fn-only) monorepo, scaffolded from monorepo-template — DDD + Hexagonal
Architecture, TypeScript, Bun, and Turborepo.

## Getting Started

```bash
bun install
# copy each app's .env.example -> .env (or .dev.vars) and fill it in
bun run db:push
bun run dev
```

## Apps

- `apps/fullstack-fn-only`
- `apps/documentation`

Shared packages live in `packages/` (domain, application, infra-\*, web-ui, config).

## Scripts

- `bun run dev` — start the app(s) in development
- `bun run build` — build for production
- `bun run check-types` — typecheck · `bun run test` — tests
- `bun run lint` / `bun run format` — lint / format
- `bun run db:push` / `db:studio` / `db:generate` / `db:migrate` — database

## Architecture

DDD + Hexagonal, layer-first packages. The dependency rule is strict:
`domain <- application <- infra-*`, and only apps wire them together. See
`CLAUDE.md` and `.claude/architecture.md`.
