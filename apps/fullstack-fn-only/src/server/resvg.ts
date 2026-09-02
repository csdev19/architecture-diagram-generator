import { Resvg, initWasm } from "@resvg/resvg-wasm";
// Imported as a module, never fetched as bytes. Workers refuses runtime
// compilation — `WebAssembly.instantiate()` on an ArrayBuffer fails with "Wasm
// code generation disallowed by embedder" — so the binary has to reach the
// isolate already compiled, which only a bundled import does. The alias in
// `vite.config.ts` is what makes this specifier resolvable.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

/**
 * Server-side rasterisation.
 *
 * The renderer in `@diagram-tool/domain` produces SVG that both the browser and
 * this Worker consume, so a PNG produced here is the same drawing the editor
 * showed. resvg is what turns it into pixels without a browser.
 */

/**
 * Wasm initialisation is per-isolate and must happen exactly once: calling
 * `initWasm` a second time throws. Holding the promise rather than a boolean
 * also collapses concurrent first requests onto a single initialisation instead
 * of racing them.
 */
let wasmReady: Promise<void> | undefined;

const ensureWasm = (): Promise<void> => {
  wasmReady ??= initWasm(resvgWasm).catch((error: unknown) => {
    // A failed init must not be memoised, or one bad cold start poisons the
    // isolate for every request that follows it.
    wasmReady = undefined;
    throw error;
  });
  return wasmReady;
};

export interface SvgToPngOptions {
  /** Raw font files handed to resvg. Without them, text renders in nothing. */
  fonts?: Uint8Array[];
  /** Output scale. 2 gives a retina-sharp PNG of a canvas-sized diagram. */
  scale?: number;
}

/**
 * Rasterises an SVG document to PNG bytes.
 *
 * `loadSystemFonts` is false because a Worker has no system fonts to load and
 * asking for them costs startup time for a guaranteed miss. Every face the
 * diagram uses therefore has to arrive through `fonts`.
 */
export const svgToPng = async (
  svg: string,
  { fonts = [], scale = 2 }: SvgToPngOptions = {},
): Promise<Uint8Array<ArrayBuffer>> => {
  await ensureWasm();

  const resvg = new Resvg(svg, {
    font: { fontBuffers: fonts, loadSystemFonts: false },
    fitTo: { mode: "zoom", value: scale },
  });

  try {
    // Copied twice over, deliberately: out of wasm memory before `free()` can
    // invalidate it, and into a plain `ArrayBuffer` so the result satisfies
    // `BodyInit` — a `Uint8Array<ArrayBufferLike>` does not, because that union
    // admits `SharedArrayBuffer`.
    return new Uint8Array(resvg.render().asPng());
  } finally {
    // The wasm image holds memory the JS heap cannot see, so it is freed
    // explicitly rather than left to the garbage collector.
    resvg.free();
  }
};
