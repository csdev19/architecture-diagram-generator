# 02 — Shared renderer and PNG export

> **Status: shipped in phase 0, kept as historical record** (2026-09-01). The renderer lives in `packages/domain/src/render/`. Bundled fonts and server-side resvg belong to plan 02 of [the next-phases design](./2026-09-01-diagram-tool-next-phases-design.md); the icon set replaces emoji in plan 01.

## `renderSVG(config): string` — pure TS, isomorphic

Lives in `packages/core/src/render.ts`. Generates the SVG as a string with template
literals. No React, no DOM: that way it runs identically in the browser (preview) and in
the Worker (resvg). The editor's React component is just a wrapper:

```tsx
function DiagramPreview({ config }: { config: DiagramConfig }) {
  const svg = useMemo(() => renderSVG(config), [config]);
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

## Anatomy of the SVG (ported from the jsx prototype)

Layer order (it matters):

1. **Background**: rect with base color `#f7f8fb` + rect with a grid `pattern`
   (lines `#e6eaf2`, 26px cell).
2. **Groups**: rounded rect (rx 14) with a border according to `tone`; the label is
   drawn _on top of_ the top border, covering it with a rect in the group's background
   color, then the monospace text with letter-spacing.
3. **Edges**: lines with `marker-end` (two `<marker>` elements in defs: blue and gray).
   Anchors computed from the tile's side (`out`/`inn`) + a 6px offset;
   if the side is `"b"`, an extra 34px offset to jump over the node's texts.
   Label centered at the midpoint (or to the right if the line is vertical).
4. **Nodes**: 62×62 tile rx 14 (white with `#e2e8f0` border, or dark `#0f172a`),
   emoji centered at 28px, name in system-ui bold 13.5px, sublabel monospace
   10.5px gray.

Small pure functions: `renderGroup(g)`, `renderNode(n)`, `renderEdge(e,
nodeById)` that return strings, concatenated at the end. Easy to test
with snapshots.

## Critical server-side detail: fonts and emoji

In the browser, `font-family: system-ui` and emoji "just work".
In resvg (Worker) **there are no system fonts**: they must be bundled.

- Texts: include a TTF (e.g. Inter for names + JetBrains Mono for
  sublabels) as Worker assets and pass them to resvg in `fontBuffers`.
  Change the SVG to `font-family="Inter"` / `"JetBrains Mono"` — the browser
  also loads them via `@font-face` in the web app so that preview and PNG
  are identical.
- Emoji: resvg does not reliably render color emoji fonts. Two
  options, in order of recommendation:
  1. **Our own icon set (recommended, phase 1.5):** replace `emoji` with
     `iconKey` and keep inline SVGs in `packages/core/icons/` (simple
     monochrome paths or the official logos of each tech). They are inserted as `<g>`
     inside the tile. Renders identically in browser and resvg, and along the way solves
     "I want the real logos".
  2. Bundle Noto Emoji (monochrome version) as a font: it works but the
     emoji come out in a single color.

  For the MCP MVP you can launch with option 2 and migrate to option 1.

## Client-side PNG export (editor)

Same as the prototype: `XMLSerializer` → Blob → `<img>` → canvas at 2x →
`toDataURL("image/png")` → download. It works because the whole SVG is inline
(no remote `<image href>` that would taint the canvas). If you add `@font-face`,
for the client export to respect the font you must embed the font as a
data-URI inside a `<style>` in the SVG before serializing (or accept the
system fallback — visually near-identical with Inter).

## Server-side PNG export (Worker)

```ts
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

let ready: Promise<void> | null = null;
function ensureWasm() {
  return (ready ??= initWasm(resvgWasm));
}

export async function svgToPng(svg: string, fonts: ArrayBuffer[], scale = 2) {
  await ensureWasm();
  const r = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { fontBuffers: fonts.map((f) => new Uint8Array(f)), loadSystemFonts: false },
  });
  return r.render().asPng(); // Uint8Array
}
```

Workers notes:

- Import the `.wasm` as a module (natively supported; with Alchemy/wrangler
  declare the `CompiledWasm` rule if needed).
- `initWasm` only once per isolate (hence the `ready` singleton).
- A 1000×800 diagram at 2x renders in tens of ms; it fits comfortably within
  the CPU limits of the free plan.

## Tests

- Snapshot: `renderSVG(exampleConfig)` against a fixture — catches structural
  visual regressions.
- Golden PNG: in CI, render with resvg and compare a hash (or pixelmatch with
  tolerance) against a reference image.
