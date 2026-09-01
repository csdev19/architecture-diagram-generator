# Diagram tool, next phases — plan 01: framework icons

**Design:** [`/docs/specs/2026-09-01-diagram-tool-next-phases-design.md`](../specs/2026-09-01-diagram-tool-next-phases-design.md)
**Branch:** `feat/diagram-icons` · **Date:** 2026-09-01 · **Roadmap phase:** 1.5

**Goal.** Nodes can show the real logo of their technology — `iconKey: "react"`
draws the React mark in brand colour — with emoji remaining a valid fallback.

**Architecture.** A curated registry over `simple-icons` in
`packages/domain/src/constants/`, an optional `iconKey` on the node schema, and
a renderer branch that draws the icon path instead of the emoji glyph.

**Tech stack.** `simple-icons` (CC0, plain data, Worker-safe), everything else
already in place.

## Conventions to read before starting

Everything in the phase-0 plan's conventions section still applies —
enums-as-const, constants-pattern, schemas-first (Zod v4), tsdown-owned exports,
co-located `__tests__`, `"catalog:"` deps, English-only artifacts. Two specific
to this plan:

- The registry is domain data: it must never import DOM, Node or bundler-magic
  APIs. `simple-icons` named exports are plain objects, which is why it is
  admissible where an `.svg` asset folder would not be.
- Never restate a value from the registry elsewhere — the guidelines interpolate
  the key list, the renderer reads paths and colours from the registry only.

## File structure

**Create**

```
packages/domain/src/constants/diagram-icons.ts
packages/domain/src/constants/__tests__/diagram-icons.test.ts
```

**Modify**

```
package.json                                   add simple-icons to the catalog
packages/domain/package.json                   depend on simple-icons (catalog:)
packages/domain/src/constants/index.ts         export the registry
packages/domain/src/schemas/diagram.ts         iconKey, emoji relaxation, refine
packages/domain/src/schemas/__tests__/diagram.test.ts
packages/domain/src/render/node.ts             icon branch
packages/domain/src/render/__tests__/render.test.ts
packages/domain/src/render/guidelines.ts       icon rules + interpolated key list
packages/domain/src/render/__tests__/guidelines.test.ts
apps/documentation/…/features/diagram-tool/*   config-schema, svg-renderer,
                                               authoring-guidelines, index table
apps/documentation/…/changelog/                new entry
```

## Task 1 — The icon registry

- [ ] Add `simple-icons` to the root catalog (exact version) and to
      `packages/domain` as `"catalog:"`.
- [ ] `packages/domain/src/constants/diagram-icons.ts`: `DIAGRAM_ICONS` — an
      `as const`-shaped record from key to `{ title, path, hex }`, each value
      taken from a `simple-icons` named import (`siReact`, `siBun`, …).
      Curate the starter set from this repo's own stack plus obvious neighbours:
      react, typescript, bun, hono, cloudflare, cloudflareworkers, postgresql,
      drizzle, zod, turborepo, vite, tailwindcss, astro, expo, github,
      githubactions, docker, redis, nodedotjs, better-auth-if-available. Verify
      each import actually exists in the installed version; drop or substitute
      what does not — the test in the next item is the gate.
- [ ] Derive `DiagramIconKey` from the registry keys and export
      `DIAGRAM_ICON_KEYS` via `Object.keys` — no hand-written union.
- [ ] Test: every registry entry has a non-empty `path` that parses as SVG path
      data (starts with `M`), a 6-hex-digit `hex`, and a `title`; keys are
      lowercase and stable.
- [ ] Export from `packages/domain/src/constants/index.ts`.

## Task 2 — Schema: `iconKey` in, `emoji` relaxed (test-first)

- [ ] Red first, in the existing schema test file:
  - a node with `iconKey: "react"` and no emoji is valid;
  - a node with emoji and no iconKey is still valid (every phase-0 config keeps
    parsing — paste the canonical example untouched as the regression);
  - a node with **neither** fails, and the message says one of the two is
    required and points to the guidelines for the key list;
  - an unknown `iconKey` fails.
- [ ] Implement: `iconKey: z.enum(DIAGRAM_ICON_KEYS).optional()` — but note
      `z.enum` wants the const-object form per the constants pattern; if the
      registry's derived keys cannot feed `z.enum` cleanly, a
      `z.string().refine(isValidDiagramIconKey)` with the same message is the
      compliant fallback. `emoji` becomes optional; a node-level refine enforces
      emoji-or-iconKey.
- [ ] Green, and confirm the error message for the unknown key is actionable.

## Task 3 — Renderer: draw the mark (test-first)

- [ ] Red first: with `iconKey` set, the output contains the registry's path
      data and no emoji `<text>`; on a light tile the fill is the brand hex; on
      a dark tile the fill is the light tile colour (a dark mark on a dark tile
      is invisible); with only emoji, output is unchanged from today.
- [ ] Implement in `render/node.ts`: when `iconKey` is present it wins over
      emoji. Wrap the 24x24 path in a `<g>` translated to the tile centre and
      scaled to ~32px. Icon geometry constants join `DIAGRAM_GEOMETRY`.
- [ ] Update the canonical `EXAMPLE_DIAGRAM_CONFIG`: give two nodes an
      `iconKey` (e.g. hono, cloudflare's D1 stays emoji) so the seed showcases
      both forms. Snapshot updates; **rasterise and look at it** before
      accepting — the phase-0 rule about snapshots stands.

## Task 4 — Guidelines and docs

- [ ] `guidelines.ts`: a short icon section — prefer `iconKey` when the
      technology has one, emoji otherwise — with the available keys interpolated
      from `DIAGRAM_ICON_KEYS` (join, not retyped). Drift test asserts two known
      keys appear and the unresolved-interpolation guard still passes.
- [ ] Docs app: update `config-schema`, `svg-renderer` and
      `authoring-guidelines` sub-feature docs (new decision rows and gotchas),
      add the sub-feature row date changes to the parent index if statuses
      move, and write the changelog entry.
- [ ] Verify the docs app builds and the touched pages serve 200.

## Task 5 — Verify

- [ ] `bun run check-types && bun run lint && bun run test && bun run build`.
- [ ] Render the example to SVG, rasterise, and inspect: brand marks legible on
      light tiles, light marks legible on dark tiles, emoji nodes untouched.
- [ ] Open `/editor`: the seeded example shows real logos; switching an
      `iconKey` to garbage produces the actionable message.
- [ ] PR against `main`.
