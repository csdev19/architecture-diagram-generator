import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * resvg's WebAssembly binary, resolved to an absolute path.
 *
 * It has to be imported as a module: Workers refuses runtime compilation, so
 * fetching the bytes and calling `WebAssembly.instantiate` fails with "Wasm
 * code generation disallowed by embedder". But esbuild's dependency scanner
 * resolves `@resvg/resvg-wasm/index_bg.wasm` against the app root instead of
 * the package, fails, and abandons pre-bundling entirely — after which every
 * request 500s with an error naming React. Handing the scanner an absolute path
 * removes the ambiguity.
 */
const resvgWasmPath = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: 9232 }),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@resvg/resvg-wasm/index_bg.wasm": resvgWasmPath,
    },
  },
  server: {
    port: 3002,
  },
});
