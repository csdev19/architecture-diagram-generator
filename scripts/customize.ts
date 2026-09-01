#!/usr/bin/env bun
/// <reference types="@types/bun" />
/**
 * Interactive customization script for the monorepo template.
 *
 * Usage: bun run customize
 *
 * Asks for architecture pattern, optional features, and project name,
 * then removes everything you don't need and renames the project.
 *
 * Target: < 30 seconds for full customization.
 */

import { existsSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Pattern =
  | "client-server-elysia"
  | "client-server-hono"
  | "server-only-hono"
  | "fullstack-fn-only"
  | "fullstack-fn-and-convex";

interface PatternConfig {
  label: string;
  keep: string[];
  /**
   * The mobile app this pattern pairs with (the other mobile variants are always removed).
   * `null` for backend-only patterns: both mobile variants go and the prompt is skipped.
   */
  mobileApp: string | null;
  /**
   * Packages no app in this pattern wires up. Defaults to `UNUSED_PACKAGES`; a pattern
   * that actually consumes one of them (e.g. backend-only keeps `i18n` for email and
   * push copy) narrows the list.
   */
  unusedPackages: string[];
  remove: string[];
  scriptsRemove: string[];
  catalogRemove: string[];
  envSchemasRemove: string[];
  envFilesToDelete: string[];
  dbEnvSource: string;
  ciAppDir: string;
  ciNeedsBackend: boolean;
  ciBackendDir: string | null;
  ciBuildEnv: Record<string, string>;
  ciDeployVars: string[];
  ciDeploySecrets: string[];
  /**
   * Source edits this pattern needs beyond deleting directories — e.g. dropping a
   * dependency whose catalog entry the pattern removes. Runs before the rename, so
   * write `@monorepo-template` imports and let the rename step translate them.
   */
  postProcess?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared catalog groups
// ---------------------------------------------------------------------------

const ELYSIA_CATALOG = ["elysia", "@elysiajs/eden", "@elysiajs/cors"];
const HONO_ORPC_CATALOG = [
  "hono",
  "@orpc/contract",
  "@orpc/server",
  "@orpc/openapi",
  "@orpc/client",
  "@orpc/openapi-client",
  "@orpc/tanstack-query",
];
const CONVEX_CATALOG = ["convex", "@convex-dev/react-query"];

// Scripts that no longer reference valid apps (legacy cleanup)
const DEAD_SCRIPTS = ["dev:web", "dev:server"];

// The two mobile variants: `mobile` (for the non-Convex stacks) and `mobile-convex`
// (Expo + Better-Auth-in-Convex). A pattern keeps its own via `mobileApp`; the other is
// always removed. `convex-auth-api` is only used by `mobile-convex`.
const MOBILE_APPS = ["apps/mobile", "apps/mobile-convex"];

// Packages no web/fullstack pattern wires up today (weeds). Patterns override via
// `unusedPackages` when they genuinely consume one.
const UNUSED_PACKAGES = ["packages/i18n", "packages/tokens"];

// Frontend build tooling — dead weight in a backend-only pattern.
const WEB_TOOLING_CATALOG = [
  "@tailwindcss/vite",
  "tailwindcss",
  "@vitejs/plugin-react",
  "vite",
  "@orpc/client",
  "@orpc/openapi-client",
  "@orpc/tanstack-query",
];

// ---------------------------------------------------------------------------
// Pattern Configurations
// ---------------------------------------------------------------------------

const PATTERNS: Record<Pattern, PatternConfig> = {
  "client-server-elysia": {
    label: "Client-Server Elysia (apps/web-elysia + apps/server-elysia)",
    keep: ["apps/web-elysia", "apps/server-elysia"],
    mobileApp: "apps/mobile",
    unusedPackages: UNUSED_PACKAGES,
    remove: [
      "apps/web-hono",
      "apps/server-hono",
      "apps/fullstack-fn-only",
      "apps/fullstack-fn-and-convex",
    ],
    scriptsRemove: [
      ...DEAD_SCRIPTS,
      "dev:web-hono",
      "dev:server-hono",
      "dev:fullstack-fn",
      "dev:fullstack-convex",
      "dev:convex",
      "dev:convex:setup",
      "generate:convex-jwt-keys",
    ],
    catalogRemove: [...HONO_ORPC_CATALOG, ...CONVEX_CATALOG],
    envSchemasRemove: ["fullstackServerEnvSchema", "fullstackConvexClientEnvSchema"],
    envFilesToDelete: [
      "packages/infra-env/src/fullstack-server.ts",
      "packages/infra-env/src/fullstack-convex-client.ts",
    ],
    dbEnvSource: "apps/server-elysia/.env",
    ciAppDir: "apps/web-elysia",
    ciNeedsBackend: true,
    ciBackendDir: "apps/server-elysia",
    ciBuildEnv: {
      VITE_SERVER_URL: "https://placeholder.example.com",
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-for-build-validation",
    },
    ciDeployVars: ["VITE_SERVER_URL"],
    ciDeploySecrets: [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ],
  },
  "client-server-hono": {
    label: "Client-Server Hono + oRPC (apps/web-hono + apps/server-hono)",
    keep: ["apps/web-hono", "apps/server-hono"],
    mobileApp: "apps/mobile",
    unusedPackages: UNUSED_PACKAGES,
    remove: [
      "apps/web-elysia",
      "apps/server-elysia",
      "apps/fullstack-fn-only",
      "apps/fullstack-fn-and-convex",
    ],
    scriptsRemove: [
      ...DEAD_SCRIPTS,
      "dev:web-elysia",
      "dev:server-elysia",
      "dev:fullstack-fn",
      "dev:fullstack-convex",
      "dev:convex",
      "dev:convex:setup",
      "generate:convex-jwt-keys",
    ],
    catalogRemove: [...ELYSIA_CATALOG, ...CONVEX_CATALOG],
    envSchemasRemove: ["fullstackServerEnvSchema", "fullstackConvexClientEnvSchema"],
    envFilesToDelete: [
      "packages/infra-env/src/fullstack-server.ts",
      "packages/infra-env/src/fullstack-convex-client.ts",
    ],
    dbEnvSource: "apps/server-hono/.env",
    ciAppDir: "apps/web-hono",
    ciNeedsBackend: true,
    ciBackendDir: "apps/server-hono",
    ciBuildEnv: {
      VITE_SERVER_URL: "https://placeholder.example.com",
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-for-build-validation",
    },
    ciDeployVars: ["VITE_SERVER_URL"],
    ciDeploySecrets: [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ],
  },
  "server-only-hono": {
    label: "Backend only — Hono + oRPC API (apps/server-hono)",
    keep: ["apps/server-hono"],
    // No client in this pattern: both mobile variants go, and the prompt is skipped.
    mobileApp: null,
    // `i18n` survives here — a headless service still renders localized copy for
    // transactional email and push notifications via its non-React `core` export.
    unusedPackages: ["packages/tokens"],
    remove: [
      "apps/web-elysia",
      "apps/server-elysia",
      "apps/web-hono",
      "apps/fullstack-fn-only",
      "apps/fullstack-fn-and-convex",
      "packages/web-ui",
    ],
    scriptsRemove: [
      ...DEAD_SCRIPTS,
      "dev:web-elysia",
      "dev:server-elysia",
      "dev:web-hono",
      "dev:fullstack-fn",
      "dev:fullstack-convex",
      "dev:convex",
      "dev:convex:setup",
      "generate:convex-jwt-keys",
    ],
    catalogRemove: [
      ...ELYSIA_CATALOG,
      ...CONVEX_CATALOG,
      ...WEB_TOOLING_CATALOG,
      "@better-auth/expo",
    ],
    envSchemasRemove: [
      "fullstackServerEnvSchema",
      "fullstackConvexClientEnvSchema",
      "webServerEnvSchema",
      "webClientEnvSchema",
    ],
    envFilesToDelete: [
      "packages/infra-env/src/fullstack-server.ts",
      "packages/infra-env/src/fullstack-convex-client.ts",
      "packages/infra-env/src/web-server.ts",
      "packages/infra-env/src/web-client.ts",
    ],
    dbEnvSource: "apps/server-hono/.env",
    // The Worker *is* the app here, so it deploys through the standard app step —
    // there is no separate backend to append.
    ciAppDir: "apps/server-hono",
    ciNeedsBackend: false,
    ciBackendDir: null,
    ciBuildEnv: {
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-for-build-validation",
    },
    ciDeployVars: ["CORS_ORIGIN", "BETTER_AUTH_URL"],
    ciDeploySecrets: ["DATABASE_URL", "DATABASE_URL_DIRECT", "BETTER_AUTH_SECRET"],
    postProcess: serverOnlyFixups,
  },
  "fullstack-fn-only": {
    label: "Fullstack serverFn only (apps/fullstack-fn-only)",
    keep: ["apps/fullstack-fn-only"],
    mobileApp: "apps/mobile",
    unusedPackages: UNUSED_PACKAGES,
    remove: [
      "apps/web-elysia",
      "apps/server-elysia",
      "apps/web-hono",
      "apps/server-hono",
      "apps/fullstack-fn-and-convex",
      "packages/infra-cloudflare",
    ],
    scriptsRemove: [
      ...DEAD_SCRIPTS,
      "dev:web-elysia",
      "dev:server-elysia",
      "dev:web-hono",
      "dev:server-hono",
      "dev:fullstack-convex",
      "dev:convex",
      "dev:convex:setup",
      "generate:convex-jwt-keys",
    ],
    catalogRemove: [...ELYSIA_CATALOG, ...HONO_ORPC_CATALOG, ...CONVEX_CATALOG, "wrangler"],
    envSchemasRemove: [
      "serverEnvSchema",
      "webServerEnvSchema",
      "webClientEnvSchema",
      "fullstackConvexClientEnvSchema",
    ],
    envFilesToDelete: [
      "packages/infra-env/src/server.ts",
      "packages/infra-env/src/web-server.ts",
      "packages/infra-env/src/web-client.ts",
      "packages/infra-env/src/fullstack-convex-client.ts",
    ],
    dbEnvSource: "apps/fullstack-fn-only/.env",
    ciAppDir: "apps/fullstack-fn-only",
    ciNeedsBackend: false,
    ciBackendDir: null,
    ciBuildEnv: {
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-for-build-validation",
    },
    ciDeployVars: [],
    ciDeploySecrets: [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ],
  },
  "fullstack-fn-and-convex": {
    label: "Fullstack serverFn + Convex (apps/fullstack-fn-and-convex)",
    keep: ["apps/fullstack-fn-and-convex"],
    mobileApp: "apps/mobile-convex",
    unusedPackages: UNUSED_PACKAGES,
    remove: [
      "apps/web-elysia",
      "apps/server-elysia",
      "apps/web-hono",
      "apps/server-hono",
      "apps/fullstack-fn-only",
      "packages/infra-cloudflare",
    ],
    scriptsRemove: [
      ...DEAD_SCRIPTS,
      "dev:web-elysia",
      "dev:server-elysia",
      "dev:web-hono",
      "dev:server-hono",
      "dev:fullstack-fn",
    ],
    // NOTE: keep `wrangler` — the Convex fullstack app deploys to Cloudflare Workers
    // (apps/fullstack-fn-and-convex/wrangler.jsonc), unlike the fn-only pattern.
    catalogRemove: [...ELYSIA_CATALOG, ...HONO_ORPC_CATALOG],
    envSchemasRemove: ["serverEnvSchema", "webServerEnvSchema", "webClientEnvSchema"],
    envFilesToDelete: [
      "packages/infra-env/src/server.ts",
      "packages/infra-env/src/web-server.ts",
      "packages/infra-env/src/web-client.ts",
    ],
    dbEnvSource: "apps/fullstack-fn-and-convex/.env",
    ciAppDir: "apps/fullstack-fn-and-convex",
    ciNeedsBackend: false,
    ciBackendDir: null,
    ciBuildEnv: {
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-for-build-validation",
      BETTER_AUTH_URL: "http://localhost:3004",
      JWT_PRIVATE_JWK:
        '{"kty":"RSA","n":"placeholder","e":"AQAB","kid":"placeholder","alg":"RS256","use":"sig"}',
      JWT_KID: "placeholder-kid",
      VITE_CONVEX_URL: "https://placeholder.convex.cloud",
    },
    ciDeployVars: ["VITE_CONVEX_URL"],
    ciDeploySecrets: [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "JWT_PRIVATE_JWK",
      "JWT_KID",
    ],
  },
};

// ---------------------------------------------------------------------------
// Env schema -> file mapping
// ---------------------------------------------------------------------------

const ENV_SCHEMA_MAP: Record<string, { exportLine: string; file: string }> = {
  fullstackServerEnvSchema: {
    exportLine: 'export { fullstackServerEnvSchema } from "./fullstack-server";',
    file: "packages/infra-env/src/fullstack-server.ts",
  },
  fullstackConvexClientEnvSchema: {
    exportLine: 'export { fullstackConvexClientEnvSchema } from "./fullstack-convex-client";',
    file: "packages/infra-env/src/fullstack-convex-client.ts",
  },
  serverEnvSchema: {
    exportLine: 'export { serverEnvSchema } from "./server";',
    file: "packages/infra-env/src/server.ts",
  },
  webClientEnvSchema: {
    exportLine: 'export { webClientEnvSchema } from "./web-client";',
    file: "packages/infra-env/src/web-client.ts",
  },
  webServerEnvSchema: {
    exportLine: 'export { webServerEnvSchema } from "./web-server";',
    file: "packages/infra-env/src/web-server.ts",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(ROOT, rel);
}

function removeDir(rel: string): boolean {
  const full = abs(rel);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
    return true;
  }
  return false;
}

function removeFile(rel: string): boolean {
  const full = abs(rel);
  if (existsSync(full)) {
    rmSync(full, { force: true });
    return true;
  }
  return false;
}

async function readJson(rel: string) {
  return Bun.file(abs(rel)).json();
}

async function writeJson(rel: string, data: unknown): Promise<void> {
  await Bun.write(abs(rel), JSON.stringify(data, null, 2) + "\n");
}

async function writeText(rel: string, content: string): Promise<void> {
  await Bun.write(abs(rel), content);
}

/** Replace the multi-pattern template README with a minimal one for the chosen pattern. */
async function writeReadme(
  config: PatternConfig,
  keepMobile: boolean,
  keepDocs: boolean,
  name: string,
): Promise<void> {
  const apps = [
    ...config.keep,
    ...(keepMobile && config.mobileApp ? [config.mobileApp] : []),
    ...(keepDocs ? ["apps/documentation"] : []),
  ]
    .map((p) => `- \`${p}\``)
    .join("\n");

  await writeText(
    "README.md",
    `# ${name}

A ${config.label} monorepo, scaffolded from monorepo-template — DDD + Hexagonal
Architecture, TypeScript, Bun, and Turborepo.

## Getting Started

\`\`\`bash
bun install
# copy each app's .env.example -> .env (or .dev.vars) and fill it in
bun run db:push
bun run dev
\`\`\`

## Apps

${apps}

Shared packages live in \`packages/\` (domain, application, infra-*, web-ui, config).

## Scripts

- \`bun run dev\` — start the app(s) in development
- \`bun run build\` — build for production
- \`bun run check-types\` — typecheck · \`bun run test\` — tests
- \`bun run lint\` / \`bun run format\` — lint / format
- \`bun run db:push\` / \`db:studio\` / \`db:generate\` / \`db:migrate\` — database

## Architecture

DDD + Hexagonal, layer-first packages. The dependency rule is strict:
\`domain <- application <- infra-*\`, and only apps wire them together. See
\`CLAUDE.md\` and \`.claude/architecture.md\`.
`,
  );
}

// One-liner purpose for each shared package, used to regenerate the architecture
// doc. Only packages that survive customization are listed.
const PACKAGE_PURPOSE: Record<string, string> = {
  domain: "Pure: Zod schemas, types, constants, repository interfaces (leaf, no deps)",
  application: "Use cases (depend only on domain interfaces)",
  "infra-db": "Drizzle schemas, repositories, mappers, Neon client",
  "infra-auth": "Better Auth base config",
  "infra-cloudflare": "Service Binding fetch + proxy handler (client-server patterns)",
  "infra-env": "Zod env schemas (one per app)",
  "convex-api": "Convex functions for the web app (Convex pattern)",
  "convex-auth-api": "Convex functions + Better-Auth-in-Convex (mobile-convex)",
  "web-ui": "Shared React UI (shadcn/ui, Tailwind) — exports built dist/",
  i18n: "Localized copy for email / push via the non-React core export",
  tokens: "Design tokens",
  config: "Shared tsconfig",
};

const PACKAGE_ORDER = [
  "domain",
  "application",
  "infra-db",
  "infra-auth",
  "infra-cloudflare",
  "infra-env",
  "convex-api",
  "convex-auth-api",
  "web-ui",
  "i18n",
  "tokens",
  "config",
];

/** Names of the directories under a workspace folder that survived customization. */
function survivingDirs(rel: string): Set<string> {
  try {
    return new Set(
      readdirSync(abs(rel), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    );
  } catch {
    return new Set<string>();
  }
}

/**
 * Regenerate the AI-context docs so they describe THIS project, not the
 * multi-pattern template. Left stale, `.claude/architecture.md` and CLAUDE.md
 * point agents at apps and packages that no longer exist ("your next agent
 * reads lies"). Runs after the rename, so it writes the final scope directly.
 */
async function regenerateAiContext(
  config: PatternConfig,
  toKeep: string[],
  scope: string,
): Promise<void> {
  const keptPackages = survivingDirs("packages");
  const packageList = PACKAGE_ORDER.filter((p) => keptPackages.has(p))
    .map((p) => `- \`${p}/\` — ${PACKAGE_PURPOSE[p]}`)
    .join("\n");
  const appList = toKeep.map((a) => `- \`${a}\``).join("\n");

  await writeText(
    ".claude/architecture.md",
    `# Architecture Context

A **${config.label}** project (DDD + Hexagonal Architecture), scaffolded from monorepo-template.

> The general architecture knowledge (DDD + hexagonal, bounded contexts, repository pattern, Result
> types, dependency injection, schema-driven validation) lives in the
> [general-knowledge hub](https://github.com/csdev19/general-knowledge) — start at
> [architecture/](https://github.com/csdev19/general-knowledge/blob/main/architecture/README.md).
> This file only maps what is specific to _this project_.

## Shared packages (layer-first)

${packageList}

**Dependency rule (strict):** \`domain <- application <- infra-*\`; only apps wire them together.
\`domain\` is a leaf, so importing it can never transitively pull in server code. Mobile apps import
only \`${scope}/domain\`.

## Apps

${appList}

See the [monorepo structure](https://github.com/csdev19/general-knowledge/blob/main/monorepos/monorepo-structure.md)
doc in the hub for the workspace / Turbo / catalog layout.
`,
  );
  console.log("  Regenerated .claude/architecture.md");

  // CLAUDE.md keeps a lot of still-valid, pattern-agnostic content, so replace
  // only the two stale bits rather than rewriting it.
  const claudePath = "CLAUDE.md";
  if (existsSync(abs(claudePath))) {
    let claude = await Bun.file(abs(claudePath)).text();

    const oldIntro = `This is a **multi-pattern** monorepo template (DDD + Hexagonal Architecture, TypeScript, Bun,
Turborepo). It ships four interchangeable web patterns plus a backend-only service pattern, mobile
and docs; \`bun run customize\` strips it down to the one you pick.`;
    const newIntro = `This is a **${config.label}** project (DDD + Hexagonal Architecture, TypeScript, Bun,
Turborepo), scaffolded from monorepo-template.`;
    if (claude.includes(oldIntro)) {
      claude = claude.replace(oldIntro, newIntro);
    } else {
      console.log("  WARNING: CLAUDE.md intro did not match — update it by hand");
    }

    // Drop the "Template Customization" section: its customize/rename commands
    // self-delete during this run, so the instructions no longer apply.
    claude = claude.replace(
      /## Template Customization[\s\S]*?(?=\n## Knowledge lives in the hub)/,
      "",
    );

    await writeText(claudePath, claude);
    console.log("  Updated CLAUDE.md");
  }
}

function choose(question: string, options: string[]): number {
  console.log(`\n${question}\n`);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}) ${options[i]}`);
  }
  console.log();

  while (true) {
    const answer = prompt(`  Choice (1-${options.length}):`);
    if (!answer) continue;
    const idx = parseInt(answer.trim()) - 1;
    if (idx >= 0 && idx < options.length) return idx;
    console.log(`  Please enter 1-${options.length}`);
  }
}

function yesNo(question: string): boolean {
  while (true) {
    const answer = prompt(`${question} (y/n):`);
    if (!answer) continue;
    const lower = answer.trim().toLowerCase();
    if (lower === "y" || lower === "yes") return true;
    if (lower === "n" || lower === "no") return false;
    console.log("  Please enter y or n");
  }
}

async function run(cmd: string[], opts?: { silent?: boolean }): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    stdout: opts?.silent ? "ignore" : "inherit",
    stderr: opts?.silent ? "ignore" : "inherit",
  });
  return proc.exited;
}

// ---------------------------------------------------------------------------
// Pattern fixups
// ---------------------------------------------------------------------------

/**
 * Backend-only fixups for `apps/server-hono`.
 *
 * The template's API Worker assumes a web app in front of it: the Expo Better Auth
 * plugin exists for the mobile client, and CORS is hardcoded to `exp://` because web
 * traffic arrived same-origin through the web Worker's Service Binding proxy. With no
 * client in the monorepo, both assumptions are wrong — and `@better-auth/expo` breaks
 * `bun install` outright, since this pattern drops it from the catalog.
 *
 * Every consumer now calls the service cross-origin, so the allowlist has to come from
 * `CORS_ORIGIN` and feed Better Auth's `trustedOrigins` as well.
 */
async function serverOnlyFixups(): Promise<void> {
  // 1. Drop the Expo plugin dependency (its catalog entry is gone).
  const pkgPath = "apps/server-hono/package.json";
  const serverPkg = await readJson(pkgPath);
  if (serverPkg.dependencies?.["@better-auth/expo"]) {
    delete serverPkg.dependencies["@better-auth/expo"];
    await writeJson(pkgPath, serverPkg);
    console.log("  Removed @better-auth/expo from apps/server-hono");
  }

  // 2. Rewrite the auth instance: no Expo plugin, origins from config.
  await writeText(
    "apps/server-hono/src/lib/auth.ts",
    `import { baseConfig, getCustomSession } from "@monorepo-template/infra-auth";
import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { env } from "../env";

export const auth = betterAuth({
  ...baseConfig,
  // Every consumer of this service calls it cross-origin, so the allowlist is
  // configuration (CORS_ORIGIN) rather than a hardcoded literal.
  trustedOrigins: [...env.CORS_ORIGIN],
  plugins: [...(baseConfig.plugins ?? []), customSession(getCustomSession, baseConfig)],
});
`,
  );
  console.log("  Rewrote apps/server-hono/src/lib/auth.ts");

  // 3. Point CORS at the same allowlist.
  const entryPath = "apps/server-hono/src/index.ts";
  const entry = await Bun.file(abs(entryPath)).text();
  const oldCors = `import { auth } from "./lib/auth";
import { appRouter } from "./router";

const app = new Hono();

// CORS only needed for mobile apps — web requests come through
// the web Worker proxy via Service Bindings (same-origin, no CORS needed)
app.use(
  "*",
  cors({
    origin: ["exp://", "mobile://", "exp://*"],`;
  const newCors = `import { auth } from "./lib/auth";
import { env } from "./env";
import { appRouter } from "./router";

const app = new Hono();

// This service is consumed cross-origin by every other project, so CORS is the
// real access boundary. The allowlist is configuration (CORS_ORIGIN), and
// \`credentials: true\` forbids a wildcard origin.
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,`;

  if (entry.includes(oldCors)) {
    await writeText(entryPath, entry.replace(oldCors, newCors));
    console.log("  Rewrote CORS in apps/server-hono/src/index.ts");
  } else {
    console.log(
      `  WARNING: CORS block in ${entryPath} did not match — set origin: env.CORS_ORIGIN by hand`,
    );
  }
}

/**
 * Remove the Expo Better Auth plugin from a kept server app.
 *
 * The client-server server apps (`server-hono`, `server-elysia`) wire
 * `@better-auth/expo` for the mobile client. When mobile is dropped, that
 * plugin's catalog entry is removed too — so the dependency and its wiring have
 * to go, or `bun install` fails to resolve `@better-auth/expo@catalog:` and the
 * build never starts. (The backend-only pattern handles this in
 * `serverOnlyFixups`; this covers dropping mobile from a client-server pattern.)
 */
async function stripExpoFromServerApp(appDir: string): Promise<void> {
  const pkgPath = `${appDir}/package.json`;
  const pkg = await readJson(pkgPath);
  if (pkg.dependencies?.["@better-auth/expo"]) {
    delete pkg.dependencies["@better-auth/expo"];
    await writeJson(pkgPath, pkg);
    console.log(`  Removed @better-auth/expo from ${appDir}`);
  }

  const authPath = `${appDir}/src/lib/auth.ts`;
  if (!existsSync(abs(authPath))) return;

  const before = await Bun.file(abs(authPath)).text();
  const after = before
    .replace('import { expo } from "@better-auth/expo";\n', "")
    .replace(
      ", customSession(getCustomSession, baseConfig), expo()]",
      ", customSession(getCustomSession, baseConfig)]",
    )
    // These origins only matter for the Expo client; drop them with the plugin.
    .replace('[...env.CORS_ORIGIN, "exp://", "mobile://", "exp://*"]', "[...env.CORS_ORIGIN]");

  await writeText(authPath, after);
  if (after.includes("@better-auth/expo")) {
    console.log(`  WARNING: ${authPath} still references @better-auth/expo — remove it by hand`);
  } else {
    console.log(`  Dropped Expo plugin wiring from ${authPath}`);
  }
}

// ---------------------------------------------------------------------------
// CI/CD Template Generators
// ---------------------------------------------------------------------------

function generatePrValidation(config: PatternConfig, scope: string): string {
  const envLines = Object.entries(config.ciBuildEnv)
    .map(([k, v]) => `          ${k}: ${v}`)
    .join("\n");

  let backendStep = "";
  if (config.ciNeedsBackend && config.ciBackendDir) {
    backendStep = `
      - name: Build backend
        working-directory: ${config.ciBackendDir}
        run: bun run build
`;
  }

  return `name: PR Validation

on:
  pull_request:
    branches:
      - main

concurrency:
  group: \${{ github.workflow }}-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate PR
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.4

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Check formatting
        run: bunx oxfmt --check .

      - name: Build packages
        run: bun run build --filter='${scope}/*'

      - name: Type check
        run: bun run check-types

      - name: Test
        run: bun run test

      - name: Build app
        working-directory: ${config.ciAppDir}
        env:
${envLines}
        run: bun run build
${backendStep}`;
}

function generateDeployProduction(config: PatternConfig, scope: string): string {
  // Build env uses secrets/vars references
  const buildEnvLines = Object.keys(config.ciBuildEnv)
    .map((k) => {
      if (config.ciDeployVars.includes(k)) return `          ${k}: \${{ vars.${k} }}`;
      return `          ${k}: \${{ secrets.${k} }}`;
    })
    .join("\n");

  // Deploy secrets list (for wrangler-action)
  const allDeploySecrets = [...config.ciDeployVars, ...config.ciDeploySecrets];
  const deploySecretsList = allDeploySecrets.map((s) => `            ${s}`).join("\n");

  // Deploy env vars
  const deployEnvEntries = [
    "          ENVIRONMENT: production",
    ...config.ciDeployVars.map((v) => `          ${v}: \${{ vars.${v} }}`),
    ...config.ciDeploySecrets.map((s) => `          ${s}: \${{ secrets.${s} }}`),
  ];
  const deployEnvLines = deployEnvEntries.join("\n");

  let backendStep = "";
  if (config.ciNeedsBackend && config.ciBackendDir) {
    backendStep = `
      - name: Deploy Backend to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3.14.1
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: ${config.ciBackendDir}
          secrets: |
            DATABASE_URL
            DATABASE_URL_DIRECT
            BETTER_AUTH_SECRET
            CORS_ORIGIN
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
          DATABASE_URL_DIRECT: \${{ secrets.DATABASE_URL_DIRECT }}
          CORS_ORIGIN: \${{ vars.CORS_ORIGIN }}
          BETTER_AUTH_SECRET: \${{ secrets.BETTER_AUTH_SECRET }}
`;
  }

  return `name: Deploy to Production

on:
  push:
    branches:
      - production

jobs:
  deploy-production:
    name: Deploy to production
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.4

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Wrangler
        run: bun add -g wrangler

      - name: Build packages only
        run: bun run build --filter='${scope}/*'

      - name: Build app
        working-directory: ${config.ciAppDir}
        env:
${buildEnvLines}
        run: bun run build

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3.14.1
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: ${config.ciAppDir}
          secrets: |
${deploySecretsList}
        env:
${deployEnvLines}
${backendStep}`;
}

// ---------------------------------------------------------------------------
// CLI args (non-interactive mode)
// ---------------------------------------------------------------------------

const PATTERN_KEYS: Pattern[] = [
  "client-server-elysia",
  "client-server-hono",
  "server-only-hono",
  "fullstack-fn-only",
  "fullstack-fn-and-convex",
];

// Friendly aliases accepted by --pattern in addition to the canonical keys.
const PATTERN_ALIASES: Record<string, Pattern> = {
  "client-server-elysia": "client-server-elysia",
  elysia: "client-server-elysia",
  "client-server-hono": "client-server-hono",
  hono: "client-server-hono",
  "server-only-hono": "server-only-hono",
  "server-only": "server-only-hono",
  backend: "server-only-hono",
  "fullstack-fn-only": "fullstack-fn-only",
  fn: "fullstack-fn-only",
  "fullstack-fn-and-convex": "fullstack-fn-and-convex",
  convex: "fullstack-fn-and-convex",
};

interface Choices {
  pattern: Pattern;
  keepMobile: boolean;
  keepDocs: boolean;
  keepConvex: boolean;
  projectName: string | null;
}

interface CliArgs {
  pattern?: string;
  mobile?: boolean;
  docs?: boolean;
  convex?: boolean;
  name?: string;
  yes: boolean;
  dryRun: boolean;
  skipVerify: boolean;
  help: boolean;
}

const HELP = `Monorepo Template Customizer

Interactive:
  bun run customize

Non-interactive (for CI / agents):
  bun run customize --pattern <p> [options]

Patterns (--pattern):
  client-server-elysia    | elysia
  client-server-hono      | hono
  server-only-hono        | server-only | backend
  fullstack-fn-only       | fn
  fullstack-fn-and-convex | convex

Options:
  --name <kebab>         Project scope (@name). Omit to skip the rename.
  --mobile / --no-mobile Keep/drop the Expo app (default: drop)
  --docs   / --no-docs   Keep/drop the docs site (default: drop)
  --convex / --no-convex Keep/drop Convex skills (default: drop; forced on for the convex pattern)
  --dry-run              Print the plan and exit without touching anything
  --skip-verify          Do the transforms but skip install + build + typecheck
  --yes, -y              Skip the confirmation prompt (interactive mode)
  -h, --help             Show this help

Exit codes: 0 ok - 1 build/typecheck failed - 2 bad arguments`;

/** Print a usage error to stderr and exit with the "bad arguments" code. */
function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  console.error("Run 'bun run customize --help' for usage.");
  process.exit(2);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { yes: false, dryRun: false, skipVerify: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-y" || a === "--yes") out.yes = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-verify") out.skipVerify = true;
    else if (a === "--mobile") out.mobile = true;
    else if (a === "--no-mobile") out.mobile = false;
    else if (a === "--docs") out.docs = true;
    else if (a === "--no-docs") out.docs = false;
    else if (a === "--convex") out.convex = true;
    else if (a === "--no-convex") out.convex = false;
    else if (a === "--pattern") out.pattern = argv[++i];
    else if (a.startsWith("--pattern=")) out.pattern = a.slice("--pattern=".length);
    else if (a === "--name") out.name = argv[++i];
    else if (a.startsWith("--name=")) out.name = a.slice("--name=".length);
    else fail(`Unknown argument: ${a}`);
  }
  return out;
}

function resolvePattern(input: string): Pattern {
  const key = PATTERN_ALIASES[input.trim().toLowerCase()];
  if (!key) fail(`Unknown pattern: "${input}". One of: ${PATTERN_KEYS.join(", ")}`);
  return key;
}

/** Build the choice set from CLI flags (non-interactive mode). */
function choicesFromArgs(args: CliArgs): Choices {
  if (!args.pattern) fail("--pattern is required in non-interactive mode.");
  const pattern = resolvePattern(args.pattern);
  const config = PATTERNS[pattern];

  // Backend-only patterns have no mobile app, so --mobile is meaningless there.
  if (args.mobile && config.mobileApp === null) {
    console.error("Warning: --mobile ignored (this pattern has no mobile app).");
  }
  const keepMobile = config.mobileApp === null ? false : (args.mobile ?? false);
  const keepDocs = args.docs ?? false;
  // The Convex fullstack pattern always keeps Convex; everything else defaults off.
  const keepConvex = pattern === "fullstack-fn-and-convex" ? true : (args.convex ?? false);
  const projectName = args.name?.replace(/^@/, "").trim() || null;

  return { pattern, keepMobile, keepDocs, keepConvex, projectName };
}

/** Gather the choice set interactively via prompts (TTY mode). */
function choicesInteractive(): Choices {
  const patternIdx = choose("Which architecture pattern?", [
    "Client-Server Elysia -- Frontend (apps/web-elysia) + Elysia API (apps/server-elysia)",
    "Client-Server Hono + oRPC -- Frontend (apps/web-hono) + Hono API (apps/server-hono)",
    "Backend only -- Hono + oRPC API (apps/server-hono), no client",
    "Fullstack serverFn only -- Single app using TanStack Start server functions",
    "Fullstack serverFn + Convex -- TanStack Start with Convex real-time backend",
  ]);
  const pattern = PATTERN_KEYS[patternIdx];
  const config = PATTERNS[pattern];

  // Backend-only patterns have no mobile counterpart, so there is nothing to ask.
  const keepMobile =
    config.mobileApp === null ? false : yesNo("\nKeep mobile app (Expo + React Native)?");
  const keepDocs = yesNo("Keep documentation site (Astro Starlight)?");
  const keepConvex =
    pattern === "fullstack-fn-and-convex"
      ? true
      : yesNo("Keep Convex skills (for future integration)?");

  console.log('\nProject name (kebab-case, e.g. "my-app").');
  console.log("This replaces @monorepo-template scope everywhere.");
  const rawName = prompt("  Name (or press Enter to skip):") || null;
  const projectName = rawName?.replace(/^@/, "").trim() || null;

  return { pattern, keepMobile, keepDocs, keepConvex, projectName };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  // Non-interactive whenever a pattern is passed; otherwise fall back to prompts.
  const interactive = !args.pattern;

  console.log("\n=== Monorepo Template Customizer ===\n");
  console.log("This will strip the template to your chosen architecture pattern,");
  console.log("remove features you don't need, and rename the project scope.");

  // --- Gather choices ---

  const { pattern, keepMobile, keepDocs, keepConvex, projectName } = interactive
    ? choicesInteractive()
    : choicesFromArgs(args);
  const config = PATTERNS[pattern];

  const scope = projectName ? `@${projectName}` : "@monorepo-template";

  // --- Confirm ---

  const toDelete = [...config.remove, ...config.unusedPackages];
  // Mobile: keep only this pattern's variant (if the user wants mobile); the other
  // mobile variant is always removed.
  const keepMobileConvex = keepMobile && config.mobileApp === "apps/mobile-convex";
  for (const m of MOBILE_APPS) {
    if (m !== config.mobileApp || !keepMobile) toDelete.push(m);
  }
  // `convex-auth-api` is only consumed by `mobile-convex`.
  if (!keepMobileConvex) toDelete.push("packages/convex-auth-api");
  if (!keepDocs) toDelete.push("apps/documentation");
  if (!keepConvex) toDelete.push("packages/convex-api");

  const toKeep = [
    ...config.keep,
    ...(keepMobile && config.mobileApp ? [config.mobileApp] : []),
    ...(keepDocs ? ["apps/documentation"] : []),
  ];

  console.log("\n" + "=".repeat(50));
  console.log("  CUSTOMIZATION PLAN");
  console.log("=".repeat(50));
  console.log(`\n  Pattern:  ${config.label}`);
  console.log(`  Mobile:   ${keepMobile ? "keep" : "remove"}`);
  console.log(`  Docs:     ${keepDocs ? "keep" : "remove"}`);
  console.log(`  Convex:   ${keepConvex ? "keep" : "remove"}`);
  console.log(`  Scope:    ${projectName ? `@monorepo-template -> ${scope}` : "no rename"}`);
  console.log(`\n  DELETE: ${toDelete.join(", ")}`);
  console.log(`  KEEP:   ${toKeep.join(", ")}`);

  if (args.dryRun) {
    console.log("\nDry run — no changes made.");
    process.exit(0);
  }

  // In non-interactive mode there is no TTY to confirm against, so proceed
  // directly. Interactive runs still ask, unless --yes was passed.
  if (interactive && !args.yes) {
    if (!yesNo("\nProceed?")) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("  EXECUTING");
  console.log("=".repeat(50));

  // --- Step 1: Delete app directories ---

  console.log("\n[1/8] Deleting app directories...");
  for (const dir of toDelete) {
    if (removeDir(dir)) console.log(`  Deleted ${dir}/`);
  }

  // --- Step 2: Remove Convex-only files ---

  if (!keepConvex) {
    console.log("\n[2/8] Removing Convex-only files...");
    // The Convex JWT key generator is only meaningful for fullstack-fn-and-convex.
    // Its package.json script is stripped elsewhere; delete the orphaned file too.
    if (removeFile("scripts/generate-convex-jwt-keys.ts")) {
      console.log("  Removed scripts/generate-convex-jwt-keys.ts");
    }
  } else {
    console.log("\n[2/8] Keeping Convex files.");
  }

  // --- Step 3: Update root package.json ---

  console.log("\n[3/8] Updating root package.json...");
  const pkg = await readJson("package.json");

  // Remove scripts for deleted apps
  const scriptsToRemove = [...config.scriptsRemove];
  if (!keepMobile) scriptsToRemove.push("dev:native");
  // `test:web` filters the web-ui package; drop it when that package is gone
  // (backend-only), or `turbo` errors on a filter that matches nothing.
  if (toDelete.includes("packages/web-ui")) scriptsToRemove.push("test:web");
  for (const script of scriptsToRemove) {
    if (pkg.scripts?.[script]) {
      delete pkg.scripts[script];
      console.log(`  Removed script: ${script}`);
    }
  }

  // Repoint dev:native at this pattern's mobile app (e.g. mobile-convex).
  if (keepMobile && config.mobileApp && pkg.scripts?.["dev:native"]) {
    const mobileName = config.mobileApp.split("/")[1];
    pkg.scripts["dev:native"] = `turbo run dev -F ${mobileName}`;
    console.log(`  Repointed dev:native -> ${mobileName}`);
  }

  // Update db:* env source path
  for (const key of ["db:push", "db:studio", "db:generate", "db:migrate"]) {
    if (pkg.scripts?.[key]) {
      pkg.scripts[key] = pkg.scripts[key].replace(/apps\/[^/]+\/.env/, config.dbEnvSource);
    }
  }
  console.log(`  Updated db:* scripts -> ${config.dbEnvSource}`);

  // Remove catalog entries
  const catalogToRemove = [...config.catalogRemove];
  if (!keepMobile) catalogToRemove.push("@better-auth/expo");
  for (const entry of catalogToRemove) {
    if (pkg.workspaces?.catalog?.[entry]) {
      delete pkg.workspaces.catalog[entry];
      console.log(`  Removed catalog: ${entry}`);
    }
  }

  // Remove the customize/rename scripts (they'll be cleaned up later)
  delete pkg.scripts?.["customize"];
  delete pkg.scripts?.["rename"];

  await writeJson("package.json", pkg);

  // --- Step 4: Clean up infra-env ---

  console.log("\n[4/8] Cleaning up infra-env schemas...");
  for (const schema of config.envSchemasRemove) {
    const info = ENV_SCHEMA_MAP[schema];
    if (info && removeFile(info.file)) {
      console.log(`  Deleted ${info.file}`);
    }
  }

  // Regenerate index.ts with only the kept exports
  const keepExports = ['export { commaSeparatedList } from "./transforms";'];
  for (const [schemaName, info] of Object.entries(ENV_SCHEMA_MAP)) {
    if (!config.envSchemasRemove.includes(schemaName)) {
      keepExports.push(info.exportLine);
    }
  }
  await writeText("packages/infra-env/src/index.ts", keepExports.join("\n") + "\n");
  console.log("  Updated packages/infra-env/src/index.ts");

  // --- Step 4b: Pattern-specific source fixups ---

  if (config.postProcess) {
    console.log("\n[4b/8] Applying pattern-specific fixups...");
    await config.postProcess();
  }

  // --- Step 4c: Drop Expo wiring when a client-server pattern loses mobile ---
  // Only client-server patterns keep a server-* app AND pair with mobile
  // (mobileApp !== null). The backend-only pattern (mobileApp === null) already
  // strips Expo in its own postProcess, so it is excluded here.
  if (!keepMobile && config.mobileApp !== null) {
    const serverApp = config.keep.find((k) => k.startsWith("apps/server"));
    if (serverApp) {
      console.log("\n[4c/8] Dropping Expo wiring (mobile removed)...");
      await stripExpoFromServerApp(serverApp);
    }
  }

  // --- Step 5: Generate CI/CD workflows ---

  console.log("\n[5/8] Generating CI/CD workflows...");
  await writeText(".github/workflows/pr-validation.yml", generatePrValidation(config, scope));
  console.log("  Generated .github/workflows/pr-validation.yml");
  await writeText(
    ".github/workflows/deploy-production.yml",
    generateDeployProduction(config, scope),
  );
  console.log("  Generated .github/workflows/deploy-production.yml");

  // --- Step 6: Clean lint configs ---

  console.log("\n[6/8] Cleaning up lint configs...");

  // Collect kept app directories for routeTree filtering
  const keptApps = new Set(toKeep.map((p) => p.split("/")[1]).filter(Boolean));

  for (const configFile of [".oxlintrc.json", ".oxfmtrc.json"]) {
    const full = abs(configFile);
    if (!existsSync(full)) continue;

    try {
      const data = await readJson(configFile);
      if (data.ignorePatterns) {
        data.ignorePatterns = data.ignorePatterns.filter((p: string) => {
          // Remove app-specific routeTree entries for deleted apps
          const routeTreeMatch = p.match(/^apps\/([^/]+)\/src\/routeTree\.gen\.ts$/);
          if (routeTreeMatch) {
            return keptApps.has(routeTreeMatch[1]);
          }
          // Remove Next.js patterns if no docs
          if (!keepDocs && p === "**/.next/**") return false;
          if (!keepDocs && p === "**/.source/**") return false;
          return true;
        });
        await writeJson(configFile, data);
        console.log(`  Cleaned ${configFile}`);
      }
    } catch {
      // Not valid JSON or no ignorePatterns — skip
    }
  }

  // --- Step 7: Remove customize files ---

  console.log("\n[7/8] Removing customization files...");
  removeDir(".claude/skills/customize-template");
  removeFile(".claude/commands/customize-template.md");
  console.log("  Removed .claude/skills/customize-template/");
  console.log("  Removed .claude/commands/customize-template.md");

  // --- Step 8: Rename + Install + Verify ---

  if (projectName) {
    console.log(`\n[8/8] Renaming @monorepo-template -> ${scope}...`);
    await run(["bun", "run", abs("scripts/rename.ts"), projectName, "--skip-install"]);
  } else {
    console.log("\n[8/8] Skipping rename.");
  }

  // Regenerate a minimal README for the chosen pattern — the template's
  // multi-pattern README (with the "Choose your pattern" flow) no longer
  // applies once customized.
  await writeReadme(config, keepMobile, keepDocs, projectName ?? "app");
  console.log("  Regenerated README.md");

  // Rewrite the AI-context docs so agents don't read references to deleted apps.
  await regenerateAiContext(config, toKeep, scope);

  // Clean up scripts
  removeFile("scripts/rename.ts");
  removeFile("scripts/customize.ts");
  try {
    const files = readdirSync(abs("scripts"));
    if (files.length === 0) removeDir("scripts");
  } catch {
    // directory doesn't exist
  }

  // Install + verify. `--skip-verify` stops after the structural transforms —
  // useful for fast tests and for agents that install/build on their own.
  let buildCode = 0;
  let typesCode = 0;
  if (args.skipVerify) {
    console.log("\nSkipping install + build + typecheck (--skip-verify).");
  } else {
    console.log("\nInstalling dependencies...");
    await run(["bun", "install"]);

    console.log("\nVerifying build...");
    buildCode = await run(["bun", "run", "build"]);

    console.log("\nType checking...");
    typesCode = await run(["bun", "run", "check-types"]);
  }

  // --- Summary ---

  console.log("\n" + "=".repeat(50));
  console.log("  DONE");
  console.log("=".repeat(50));
  console.log(`\n  Pattern:  ${config.label}`);
  console.log(`  Scope:    ${scope}`);
  console.log(
    `  Build:    ${args.skipVerify ? "SKIPPED" : buildCode === 0 ? "PASS" : "FAIL (check errors above)"}`,
  );
  console.log(
    `  Types:    ${args.skipVerify ? "SKIPPED" : typesCode === 0 ? "PASS" : "FAIL (check errors above)"}`,
  );

  console.log("\n  Remaining manual steps:");
  console.log("  - Commit the changes");

  console.log("\n  Run 'bun run dev' to start developing!\n");

  // Surface verification failures to the caller (CI / agents) — a broken build
  // or typecheck must not exit 0.
  process.exit(buildCode !== 0 || typesCode !== 0 ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
