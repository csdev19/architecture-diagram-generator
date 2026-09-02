import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Component tests for the app.
 *
 * Deliberately not the app's `vite.config.ts`: that one carries the Cloudflare
 * and TanStack Start plugins, which build a Worker rather than a test bundle.
 *
 * `vite-tsconfig-paths` rather than a hand-written `@/` alias, because
 * `@diagram-tool/web-ui` defines a `@/` of its own pointing at *its* `src/`. A
 * single alias here would hijack it and break every import inside that package.
 * The plugin resolves each file against the tsconfig that governs it.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    setupFiles: ["./src/vitest.setup.ts"],
  },
  resolve: {
    // `@diagram-tool/web-ui` resolves to `src/` under the `development`
    // condition and to its built `dist/` otherwise. Without this plus the
    // dedupe below, `@base-ui/react` sees two React instances and every render
    // dies on "Invalid hook call".
    conditions: ["development"],
    dedupe: ["react", "react-dom", "@base-ui/react"],
  },
});
