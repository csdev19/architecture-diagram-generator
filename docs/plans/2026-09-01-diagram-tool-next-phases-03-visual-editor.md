# Diagram tool, next phases — plan 03: visual editor

**Design:** [`/docs/specs/2026-09-01-diagram-tool-next-phases-design.md`](../specs/2026-09-01-diagram-tool-next-phases-design.md)
**Branch:** `feat/diagram-visual-editor` · **Date:** 2026-09-01 · **Roadmap phase:** 2
**Depends on:** plan 02 for load-by-id and save (everything else stands alone).

**Goal.** The "last 10%" workflow: open an `editUrl`, drag two nodes into
place, fix a label, save — a new immutable id, re-exported, done without
touching JSON by hand.

**Architecture.** The textarea text remains the single source of truth. Every
visual interaction parses the current text, mutates the config, and writes
pretty-printed JSON back — so the canvas and the JSON can never disagree, and
phase 0's invariant survives its own success. Pure config-mutation helpers live
in the app beside the editor; auto-layout, being pure domain math, lives in
`packages/domain`.

**Tech stack.** Pointer events on the inline SVG, vitest + jsdom + RTL for the
app (first time), everything else existing.

## Conventions to read before starting

Phase-0 conventions apply. Specific here:

- **App test setup (hub, `monorepos/testing/unit-and-component.md`):**
  co-located `__tests__/*.test.tsx`; selectors by role/label first; and the
  `vitest.config.ts` MUST carry `resolve.conditions: ["development"]` plus
  `dedupe: ["react", "react-dom", "@base-ui/react"]` or every render dies on
  "Invalid hook call".
- **Server functions:** saving injects `RENDER_TOKEN` server-side — a secret
  that must never reach the client is the legitimate server-function case. The
  function file exports only the `createServerFn` value at runtime.
- Mutation helpers are pure `(config, change) -> config`; DOM math (client
  coords → viewBox coords) stays in the component layer.

## File structure

**Create**

```
apps/fullstack-fn-only/vitest.config.ts
apps/fullstack-fn-only/src/components/editor/use-diagram-editing.ts   parse-mutate-restringify
apps/fullstack-fn-only/src/components/editor/__tests__/              editing + component tests
apps/fullstack-fn-only/src/components/editor/node-inspector.tsx      inline field editing
apps/fullstack-fn-only/src/components/editor/edge-tools.tsx          add/remove edges
apps/fullstack-fn-only/src/server-functions/save-diagram.ts          token-injecting save
packages/domain/src/render/layout.ts                                 auto-layout (Task 6)
packages/domain/src/render/__tests__/layout.test.ts
```

**Modify**

```
apps/fullstack-fn-only/package.json        test script + RTL/jsdom devDeps (catalog:)
package.json                               test:web filter gains the app, if kept
apps/fullstack-fn-only/src/components/editor/diagram-preview.tsx   pointer handling
apps/fullstack-fn-only/src/routes/editor.tsx                       save button, selection state
apps/documentation/…                       editor-page doc + changelog
```

## Task 1 — App test rig

- [ ] `vitest.config.ts` with jsdom, RTL, and the dedup block above; `test`
      script; one smoke test rendering the editor route component with the
      seeded example (assert the textarea is reachable **by its label** — that
      was the point of wiring the label in phase 0).
- [ ] Root `test:web` (or `turbo run test`) picks the app up; suite green.

## Task 2 — Config mutation helpers (test-first, they carry everything)

- [ ] `use-diagram-editing.ts` exposes pure helpers over the text state:
      `moveNode(id, x, y)` (snapped), `updateNodeFields(id, patch)`,
      `addEdge(edge)`, `removeEdge(index)` — each: parse current text → mutate →
      `JSON.stringify(…, null, 2)` back into the one state value.
- [ ] Red first: moving a node rewrites only that node's `x`/`y`; snapping
      rounds to the 13px half-grid; a mutation on invalid JSON is a no-op that
      surfaces the existing parse error rather than throwing; field updates
      that break validation land in the normal error channel (the mutation
      still writes — the user sees the problem, nothing is silently blocked).

## Task 3 — Drag on the preview

- [ ] Pointer events on the rendered SVG: hit-test tiles from config geometry
      (the renderer's coordinates are the truth — no DOM measurement), pointer
      capture, client→viewBox transform via the SVG's CTM, `moveNode` on move,
      snap on release. Escape cancels.
- [ ] A drag needs a valid config to start (invalid JSON = nothing to hit-test);
      the affordance is a `grab` cursor on tiles only.
- [ ] Component test: pointer sequence on a tile updates the textarea JSON's
      coordinates; snapshot untouched elsewhere.

## Task 4 — Inline edits and edges

- [ ] `node-inspector.tsx`: clicking a tile selects it; a compact panel edits
      `name`, `sub`, `emoji`/`iconKey`, `tile` via `updateNodeFields`. Fields
      labelled (selector rules), validation errors reuse the existing channel.
- [ ] `edge-tools.tsx`: "add edge" arms a two-click flow (source tile then
      target tile, sides defaulting to the facing pair, editable after);
      selecting an existing edge allows delete and label/style edits.
- [ ] Component tests for both, by role and label.

## Task 5 — Save as a new id

- [ ] `save-diagram.ts` server function: takes the config, calls the plan-02
      render pipeline with `RENDER_TOKEN` injected server-side, returns
      `{ id, pngUrl, editUrl }`. Never exposes the token; input validated with
      the domain schema in the validator seat.
- [ ] Editor: Save button (disabled while invalid) → on success,
      `history.replaceState` to `/editor?d=<newId>` and surface the pngUrl.
      Immutability is the feature: the old id keeps serving the old diagram.
- [ ] Manual loop: open an `editUrl` from a real MCP render, drag, save, verify
      the new id serves and the old one still does.

## Task 6 — Auto-layout (cuttable tail; ship Tasks 1-5 without it)

- [ ] `packages/domain/src/render/layout.ts`: `layoutDiagram(config)` assigns
      coordinates from topology — longest-path layering left→right for the
      solid-edge flow, secondary rows below their anchor column, the spacing
      constants from `DIAGRAM_GEOMETRY`/guidelines (140px), canvas grown to fit
      margins. Pure, deterministic, domain-unit tested (no overlaps at the
      constants' spacing; deterministic output; a cycle does not hang it).
- [ ] Editor: an "Arrange" button running it through the same text-rewrite path
      (it is just one more mutation, fully undoable by editing the JSON back).

## Task 7 — Docs and verify

- [ ] Update the `editor-page` feature doc (new decisions: text stays the source
      of truth, token-injecting save; gotchas: CTM transform, pointer capture),
      changelog entry, parent index. Docs app builds, pages 200.
- [ ] `bun run check-types && bun run lint && bun run test && bun run build`;
      manual pass of the definition of done at the top.
- [ ] PR against `main`.
