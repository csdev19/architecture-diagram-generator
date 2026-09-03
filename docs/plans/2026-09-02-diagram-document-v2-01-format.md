# Diagram Document v2 — plan 01: boundaries and edge ids

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`/docs/specs/2026-09-02-diagram-document-v2-design.md`](../specs/2026-09-02-diagram-document-v2-design.md)
**Branch:** `feat/diagram-boundaries` · **Date:** 2026-09-02
**Depends on:** nothing. This plan ships on its own and changes no pixels.

**Goal.** Free the word "group". Today's drawn box becomes a `boundary`
everywhere — schema, renderer, constants, editor, docs — and every edge gains a
stable `id`, so plan 02 has a relation to name and a key to hang layout off.

**Architecture.** A vocabulary refactor plus one real feature. `version` stays
`1`; the document is still a single flat config. The only behavioural change is
that edges are addressed by id instead of by array index, which removes the one
place where reordering an array silently retargets an edit.

**Tech stack.** Existing: Zod 4, vitest, oxlint. No new dependencies.

## Global constraints

- Everything published is English: code, comments, tests, commits, docs.
- `domain` never imports from `application` or `infra-*`.
- The renderer stays free of DOM and Node APIs.
- Never restate a colour, size or limit that lives in `constants/diagram.ts`;
  the guidelines interpolate theirs from it so guidance cannot drift from
  validation.
- Anything interpolated into SVG goes through `escapeXml`.
- Rename in one commit per layer, keeping `bun run check-types` green at each.

## Definition of done

An author writes `boundaries` instead of `groups`, every edge in the seed and in
the editor's output carries an `id`, the edges panel edits by id, and
`bun run check-types && bun run lint && bun run test && bun run build` is green.

## File structure

**Rename**

```
packages/domain/src/render/group.ts          -> render/boundary.ts
apps/.../components/editor/group-inspector.tsx -> boundary-inspector.tsx
```

**Modify**

```
packages/domain/src/constants/diagram.ts     tone + limit + label-size names
packages/domain/src/schemas/diagram.ts       boundary schema, edge ids, seed
packages/domain/src/render/index.ts          renderBoundary, boundary layer
packages/domain/src/render/frame.ts          boundaryBounds
packages/domain/src/render/guidelines.ts     the authoring text
packages/domain/src/render/layout.ts         no rename needed; edges keep ids
apps/.../editor/editor-tools.ts              addBoundary/moveBoundary/…, edge-by-id
apps/.../editor/pointer-geometry.ts          hitTestBoundary
apps/.../editor/use-diagram-editing.ts       renamed helpers, edge id addressing
apps/.../editor/editor-page.tsx              wiring, boundary tool
apps/.../editor/diagram-stage.tsx            wiring
apps/.../editor/edge-tools.tsx               list keyed and edited by id
+ every co-located __tests__ file that names a group
apps/documentation/…                         config-schema, editor-page, index, ADR 0003, changelog
```

---

### Task 1 — Constants: the box is a boundary

**Files:** Modify `packages/domain/src/constants/diagram.ts`,
`packages/domain/src/constants/__tests__/diagram.test.ts`

**Produces:** `BOUNDARY_TONES`, `BoundaryTone`, `BOUNDARY_TONE_INFO`,
`isValidBoundaryTone`, `DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE`,
`DIAGRAM_LIMITS.MAX_BOUNDARIES` (value unchanged at 12).

- [ ] **Step 1 — rename the exports.** `GROUP_TONES` → `BOUNDARY_TONES`,
      `GroupTone` → `BoundaryTone`, `GROUP_TONE_INFO` → `BOUNDARY_TONE_INFO`,
      `isValidGroupTone` → `isValidBoundaryTone`, `GROUP_LABEL_SIZE` →
      `BOUNDARY_LABEL_SIZE`, `MAX_GROUPS` → `MAX_BOUNDARIES`. Values and the
      doc comments' meaning are unchanged — a boundary's tone is still semantic
      ("cloud provider or primary runtime"), never a colour.
- [ ] **Step 2 — update `constants/index.ts`** and the constants test to the new
      names. No new assertions; the existing ones must still hold.
- [ ] **Step 3 — run** `bun run test --filter=@diagram-tool/domain`. Expect
      failures only in `schemas` and `render` tests, which the next tasks fix.
- [ ] **Step 4 — commit.** `refactor(domain): rename group tones to boundary tones`

### Task 2 — Schema: `boundaries`, and every edge has an id

**Files:** Modify `packages/domain/src/schemas/diagram.ts`,
`packages/domain/src/schemas/__tests__/diagram.test.ts`,
`packages/domain/src/schemas/index.ts`

**Interfaces**

- Consumes: `BOUNDARY_TONES`, `DIAGRAM_LIMITS.MAX_BOUNDARIES` (Task 1).
- Produces: `diagramBoundarySchema`, `DiagramBoundary`, `DiagramEdge` with a
  required `id: string`, `DiagramConfig` with `boundaries: DiagramBoundary[]`,
  and `EXAMPLE_DIAGRAM_CONFIG` carrying edge ids.

- [ ] **Step 1 — write the failing tests** in
      `schemas/__tests__/diagram.test.ts`:

```ts
it("derives an edge id from its endpoints when the author omits one", () => {
  const result = validateDiagramConfig({
    ...baseConfig,
    edges: [{ from: "user", to: "hono", out: "r", inn: "l" }],
  });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.config.edges[0]?.id).toBe("user-hono");
});

it("suffixes a derived id when the same pair is connected twice", () => {
  const result = validateDiagramConfig({
    ...baseConfig,
    edges: [
      { from: "user", to: "hono", out: "r", inn: "l" },
      { from: "user", to: "hono", out: "b", inn: "t", style: "dashed" },
    ],
  });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.config.edges.map((edge) => edge.id)).toEqual(["user-hono", "user-hono-2"]);
});

it("keeps an id the author wrote", () => {
  const result = validateDiagramConfig({
    ...baseConfig,
    edges: [{ id: "login", from: "user", to: "hono", out: "r", inn: "l" }],
  });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.config.edges[0]?.id).toBe("login");
});

it("rejects two edges that were given the same id", () => {
  const result = validateDiagramConfig({
    ...baseConfig,
    edges: [
      { id: "same", from: "user", to: "hono", out: "r", inn: "l" },
      { id: "same", from: "hono", to: "d1", out: "r", inn: "l" },
    ],
  });

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join("\n")).toContain('duplicate id "same"');
});

it("never collides a derived id with one the author wrote", () => {
  const result = validateDiagramConfig({
    ...baseConfig,
    edges: [
      { id: "user-hono", from: "hono", to: "d1", out: "r", inn: "l" },
      { from: "user", to: "hono", out: "r", inn: "l" },
    ],
  });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.config.edges[1]?.id).toBe("user-hono-2");
});
```

- [ ] **Step 2 — run them** with
      `bun run test --filter=@diagram-tool/domain -- diagram.test` and confirm
      they fail on a missing `id` rather than on a syntax error.
- [ ] **Step 3 — rename the boundary schema.** `diagramGroupSchema` →
      `diagramBoundarySchema` (fields unchanged: `id`, `label`, `icon`, `x`,
      `y`, `w`, `h`, `tone`, `dashed`, `filled`), `DiagramGroup` →
      `DiagramBoundary`, and the config field `groups` → `boundaries` with the
      `MAX_BOUNDARIES` message. Update `addDuplicateIdIssues`'s `field`
      parameter to `"nodes" | "boundaries" | "edges"` and its human noun.
- [ ] **Step 4 — implement id derivation.** `id` is optional on the edge schema
      and required on the output, filled by a transform on the array so it can
      see its siblings:

```ts
/**
 * Fills in the id an author left out.
 *
 * Derived rather than required because a model should not have to invent a name
 * for something whose identity is already `from` and `to`. Ids written by hand
 * are reserved first, so a derived one can never take a name the author used.
 */
const withDerivedEdgeIds = (edges: RawEdge[]): RawEdge[] => {
  const taken = new Set(edges.map((edge) => edge.id).filter((id): id is string => Boolean(id)));

  return edges.map((edge) => {
    if (edge.id) return edge;

    const base = `${edge.from}-${edge.to}`;
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    taken.add(id);
    return { ...edge, id };
  });
};
```

      Apply it as `.transform(withDerivedEdgeIds)` on the `edges` array inside
      `diagramConfigShape`, so the config-level `superRefine` sees ids already
      filled in, and add `addDuplicateIdIssues(ctx, config.edges, "edges")`
      there.

- [ ] **Step 5 — update the seed.** `EXAMPLE_DIAGRAM_CONFIG` uses `boundaries`
      and leaves edge ids out — the seed is also the example of what an author
      may omit.
- [ ] **Step 6 — run** the domain schema tests; all green.
- [ ] **Step 7 — commit.** `feat(domain): give every edge a stable id and rename groups to boundaries`

### Task 3 — Renderer and frame

**Files:** Rename `packages/domain/src/render/group.ts` →
`render/boundary.ts`; modify `render/index.ts`, `render/frame.ts`,
`render/layout.ts`, and the render + frame tests.

**Interfaces**

- Consumes: `DiagramBoundary`, `BOUNDARY_TONE_INFO`.
- Produces: `renderBoundary(boundary, paper)`, `boundaryBounds(boundary)` inside
  `frame.ts`, and `renderSVG` drawing `config.boundaries`.

- [ ] **Step 1 — rename** `renderGroup` → `renderBoundary` and its parameter,
      keeping the layer order comment accurate: background, then **boundaries**,
      then edges, then nodes.
- [ ] **Step 2 — update `frame.ts`**: `groupBounds` → `boundaryBounds`,
      `config.groups.map(...)` → `config.boundaries.map(...)`, and the label
      constant to `BOUNDARY_LABEL_SIZE`.
- [ ] **Step 3 — run** `bun run test --filter=@diagram-tool/domain`. The SVG
      snapshot assertions must be **unchanged**: this task renames identifiers,
      not output. If a snapshot moves, the rename broke something.
- [ ] **Step 4 — commit.** `refactor(domain): render boundaries, not groups`

### Task 4 — Authoring guidelines

**Files:** Modify `packages/domain/src/render/guidelines.ts`,
`render/__tests__/guidelines.test.ts`

- [ ] **Step 1 — rewrite the group passages.** "Group what genuinely shares a
      boundary" becomes "Draw a **boundary** around what genuinely shares one",
      `tone` guidance moves to boundaries, and the validation section names
      `MAX_BOUNDARIES`. Keep every number interpolated from constants.
- [ ] **Step 2 — document edge ids** in the schema section: "`id` is optional.
      Leave it out and it is derived from `from` and `to`; write one only when
      two edges connect the same pair and you want to tell them apart."
- [ ] **Step 3 — update the guidelines test** so it asserts the interpolation of
      `MAX_BOUNDARIES` and the tone list from `BOUNDARY_TONES`. Run it green.
- [ ] **Step 4 — commit.** `docs(domain): teach the guidelines the word boundary`

### Task 5 — Editor: boundaries and edges by id

**Files:** Modify `apps/fullstack-fn-only/src/components/editor/editor-tools.ts`,
`pointer-geometry.ts`, `use-diagram-editing.ts`, `editor-page.tsx`,
`diagram-stage.tsx`, `edge-tools.tsx`, `selection.ts`; rename
`group-inspector.tsx` → `boundary-inspector.tsx`; update every
`__tests__` file that names a group.

**Interfaces**

- Consumes: `DiagramBoundary`, edges with ids (Task 2).
- Produces: `addBoundary`, `moveBoundary`, `updateBoundaryFields`,
  `removeBoundary`, `updateEdgeFields(text, id, patch)`,
  `removeEdge(text, id)`, `hitTestBoundary`, `Selection` with
  `kind: "node" | "boundary"`.

- [ ] **Step 1 — write the failing test** in
      `__tests__/use-diagram-editing.test.ts`:

```ts
it("edits the edge with the given id, whatever its position", () => {
  const text = JSON.stringify({
    version: 1,
    title: "t",
    boundaries: [],
    nodes: [
      { id: "a", x: 0, y: 0, emoji: "a", name: "A" },
      { id: "b", x: 100, y: 0, emoji: "b", name: "B" },
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", out: "r", inn: "l" },
      { id: "b-a", from: "b", to: "a", out: "l", inn: "r" },
    ],
  });

  const next = JSON.parse(updateEdgeFields(text, "b-a", { label: "retry" }));

  expect(next.edges[1].label).toBe("retry");
  expect(next.edges[0].label).toBeUndefined();
});

it("is a no-op when no edge carries that id", () => {
  expect(updateEdgeFields(text, "nope", { label: "x" })).toBe(text);
});
```

- [ ] **Step 2 — run it**; it fails because `updateEdgeFields` takes an index.
- [ ] **Step 3 — retarget the edge helpers.** `updateEdgeFields` and
      `removeEdge` find by `edge.id` instead of by index; the "edges have no id,
      so position is the handle" comments are deleted, because they are no
      longer true. An edge written into the text by `addEdge` now carries the
      id the caller supplies.
- [ ] **Step 4 — generate the id when the editor adds an edge.** In
      `editor-page.tsx`'s `handlePickEdgeEnd`, build it with the existing
      `uniqueNodeId` helper from `tile-catalog.ts`, passing `source.id + "-" +
    target.id` as the base and the ids of the current edges as taken, so a
      second connection between the same pair does not clash.
- [ ] **Step 5 — rename the boundary helpers and the inspector**, including
      `Selection`'s `kind` and the toolbar's group tool, which keeps its
      `EDITOR_TOOLS.GROUP` key but becomes `BOUNDARY` with the label
      "Boundary" and the hint "Drag a box around what shares a boundary."
- [ ] **Step 6 — run** `bun run test --filter=fullstack-fn-only`; fix the test
      files' vocabulary. Assertions about behaviour must not change.
- [ ] **Step 7 — commit.** `feat(editor): address edges by id and rename groups to boundaries`

### Task 6 — ADR, docs and verification

**Files:** Create
`apps/documentation/src/content/docs/architecture/decisions/adr-0003-a-boundary-is-an-element-a-group-is-a-relation.mdx`
and `apps/documentation/src/content/docs/changelog/2026-09-02-diagram-boundaries.mdx`;
modify the diagram-tool `index.mdx`, `config-schema.mdx`, `editor-page.mdx`,
`svg-renderer.mdx`, `authoring-guidelines.mdx`, and the changelog index.

- [ ] **Step 1 — write ADR 0003** in the shape of ADR 0002 (front matter,
      Status table, Context, Decision, Alternatives rejected, Consequences,
      Non-goals, What would reopen this). Context is the fused v1 object;
      Decision is the split with the five invariants from the spec;
      Alternatives rejected is the reconciliation rule with the tool survey
      table; What would reopen this is "a user need for frame-style clipping or
      reparenting-on-drop".
      **Status must say `Accepted` with a `Relation modelled in` note pointing
      at plan 02** — this plan renames the box, it does not yet ship the group
      relation, and the ADR must not claim otherwise.
- [ ] **Step 2 — update the feature docs' vocabulary**, including the Shared
      Decisions and Shared Gotchas tables in `index.mdx`, and add the edge-id
      row to `config-schema.mdx`.
- [ ] **Step 3 — changelog entry** naming the two user-visible changes: the
      field is `boundaries`, and edges carry ids.
- [ ] **Step 4 — verify.** `bun run check-types && bun run lint && bun run test && bun run build`,
      then `bun run dev:fullstack-fn` and manually confirm: the seed renders
      identically to `main`, drawing a boundary still works, and editing an edge
      label in the panel still rewrites the right edge.
- [ ] **Step 5 — commit and open the PR** against `main`.
