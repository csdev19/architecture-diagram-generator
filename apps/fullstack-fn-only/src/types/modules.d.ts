/**
 * The Cloudflare Vite plugin turns a `.wasm` import into a compiled
 * `WebAssembly.Module` rather than a URL or a byte array. TypeScript has no
 * built-in knowledge of that, so the shape is declared once here.
 */
declare module "*.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
