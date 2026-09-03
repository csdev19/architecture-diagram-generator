# Diagram Document v2 — plan 02: the document and the resolver

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`/docs/specs/2026-09-02-diagram-document-v2-design.md`](../specs/2026-09-02-diagram-document-v2-design.md)
**Branch:** `feat/diagram-document-format` · **Date:** 2026-09-02
**Depends on:** plan 01 (boundaries exist; edges have ids).

**Goal.** The v2 document — `{ version: 2, content, layout }` — its validator,
and the pure function that turns it into the renderer's input. Groups become a
real relation. Nothing in the editor changes yet.

**Architecture.** Two schemas instead of one. `diagram-document.ts` is the
authored contract; `diagram.ts` keeps the _resolved_ contract that `renderSVG`
consumes, renamed `ResolvedDiagram` because it is no longer something anyone
writes. `resolveDiagram` sits between them and is the only place that invents
geometry. `renderSVG` is untouched, which is the test that the split is real.

**Tech stack.** Existing: Zod 4, vitest. No new dependencies.

## Global constraints

- Everything published is English: code, comments, tests, commits, docs.
- `domain` never imports from `application` or `infra-*`; the renderer stays
  free of DOM and Node APIs.
- Every number lives in `constants/diagram.ts`. The resolver must not invent a
  padding or a gap locally.
- `resolveDiagram` is pure and deterministic: same document in, byte-identical
  SVG out. No clock, no randomness, no dependence on object key order beyond
  the array order the author wrote.
- `resolveDiagram` is **total over any document that validates**. It never
  throws and never reports errors; reporting is the validator's job.

## Definition of done

`validateDiagramDocument` accepts the spec's example, rejects each invariant
violation with a message naming the fix, and `resolveDiagram` turns a
content-only document into a `ResolvedDiagram` whose SVG contains every node and
a boundary rectangle that encloses its group siblings.

## File structure

**Create**

```
packages/domain/src/schemas/diagram-document.ts        content, layout, document, validation
packages/domain/src/schemas/__tests__/diagram-document.test.ts
packages/domain/src/render/resolve.ts                  resolveDiagram
packages/domain/src/render/__tests__/resolve.test.ts
packages/domain/src/render/bounds.ts                   nodeBounds/boundaryBounds, shared
packages/domain/src/render/anchors.ts                  facingSides, moved from the app
packages/domain/src/render/__tests__/anchors.test.ts
```

**Modify**

```
packages/domain/src/constants/diagram.ts     BOUNDARY_PADDING, MAX_GROUPS
packages/domain/src/schemas/diagram.ts       DiagramConfig -> ResolvedDiagram, no version
packages/domain/src/render/frame.ts          consume bounds.ts
packages/domain/src/render/layout.ts         pinned obstacles + cluster recursion
packages/domain/src/render/index.ts          export resolveDiagram, ResolvedDiagram type
packages/domain/src/render/guidelines.ts     content-first authoring text
apps/.../editor/*                            mechanical: DiagramConfig -> ResolvedDiagram
apps/documentation/…                         ADR 0004, config-schema, index
```

---

### Task 1 — Constants and the resolved contract

**Files:** Modify `packages/domain/src/constants/diagram.ts`,
`packages/domain/src/schemas/diagram.ts`, `schemas/index.ts`, and every app file
that names `DiagramConfig`.

**Produces:** `BOUNDARY_PADDINGS` / `BOUNDARY_PADDING_SIZE`,
`DIAGRAM_LIMITS.MAX_GROUPS`, `resolvedDiagramSchema`, `ResolvedDiagram`.

- [ ] **Step 1 — add the constants:**

```ts
/**
 * How much room a derived boundary leaves around what it encloses.
 *
 * Named rather than numeric, like every other visual choice in the format: the
 * author says how tight the box should read, the renderer owns the pixels. This
 * is what replaces resizing a grouped boundary by hand.
 */
export const BOUNDARY_PADDINGS = {
  TIGHT: "tight",
  NORMAL: "normal",
  LOOSE: "loose",
} as const;

export type BoundaryPadding = ObjectProperties<typeof BOUNDARY_PADDINGS>;

export const BOUNDARY_PADDING_SIZE: Record<BoundaryPadding, number> = {
  [BOUNDARY_PADDINGS.TIGHT]: 30,
  [BOUNDARY_PADDINGS.NORMAL]: 60,
  [BOUNDARY_PADDINGS.LOOSE]: 90,
};
```

      and `MAX_GROUPS: 12` back into `DIAGRAM_LIMITS`, now meaning the relation.

- [ ] **Step 2 — rename the resolved contract.** In `schemas/diagram.ts`:
      `diagramConfigSchema` → `resolvedDiagramSchema`, `DiagramConfig` →
      `ResolvedDiagram`, `validateDiagramConfig` → `validateResolvedDiagram`.
      Drop `version` from it — a version belongs to the authored document, and
      the resolved shape is never persisted. Keep `canvas` (ADR 0002's escape
      hatch) so `resolveFrame` still works. Move `EXAMPLE_DIAGRAM_CONFIG` out;
      the seed becomes a document in Task 3.
- [ ] **Step 3 — update the app's imports** mechanically. The editor still
      renders a resolved diagram, so only names change.
- [ ] **Step 4 — run** `bun run check-types && bun run test`; green.
- [ ] **Step 5 — commit.** `refactor(domain): DiagramConfig becomes ResolvedDiagram`

### Task 2 — Shared bounds and anchors

**Files:** Create `render/bounds.ts`, `render/anchors.ts`,
`render/__tests__/anchors.test.ts`; modify `render/frame.ts`; delete
`facingSides` from `apps/.../editor/pointer-geometry.ts`.

**Interfaces**

- Produces: `nodeBounds(node): Bounds`, `boundaryBounds(boundary): Bounds`,
  `union(a, b): Bounds`, `Bounds { minX, minY, maxX, maxY }`,
  `facingSides(source: Point, target: Point): { out: AnchorSide; inn: AnchorSide }`.

- [ ] **Step 1 — move** `nodeBounds`, `boundaryBounds`, `union` and the `Bounds`
      interface out of `frame.ts` into `bounds.ts` and export them. `frame.ts`
      imports them; its behaviour and its tests do not change. The resolver
      needs the same reach calculation to size a boundary, and two copies of
      "how wide is a node's label" would drift.
- [ ] **Step 2 — move `facingSides`** from the app's `pointer-geometry.ts` into
      `render/anchors.ts` verbatim, keeping its doc comment. It is pure geometry
      the resolver needs on the server, so it cannot stay in the app.
- [ ] **Step 3 — port its tests** into `render/__tests__/anchors.test.ts` and
      re-point the editor's import at `@diagram-tool/domain/render`.
- [ ] **Step 4 — run** the full test suite; green with no assertion changes.
- [ ] **Step 5 — commit.** `refactor(domain): share bounds and anchor geometry`

### Task 3 — The document schema

**Files:** Create `schemas/diagram-document.ts` and its test; modify
`schemas/index.ts`.

**Interfaces**

- Produces: `diagramContentSchema`, `diagramLayoutSchema`,
  `diagramDocumentSchema`, `validateDiagramDocument(input) -> { ok: true;
document: DiagramDocument } | { ok: false; errors: string[] }`,
  `DiagramDocument`, `DiagramDocumentInput`, `ContentNode`, `ContentBoundary`,
  `DiagramGroup`, `EXAMPLE_DIAGRAM_DOCUMENT`.

- [ ] **Step 1 — write the failing tests.** One `describe` per invariant, each
      asserting the message names the fix:

```ts
it("accepts a content-only document", () => {
  expect(validateDiagramDocument(EXAMPLE_DIAGRAM_DOCUMENT).ok).toBe(true);
});

it("rejects the same element in two groups", () => {
  const result = validateDiagramDocument(documentWith({
    groups: [
      { id: "one", members: ["api"] },
      { id: "two", members: ["api"] },
    ],
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      '"api" is already a member of "one" — an element belongs to at most one group',
    );
  }
});

it("rejects a group that contains itself, however indirectly", () => {
  const result = validateDiagramDocument(documentWith({
    groups: [
      { id: "outer", members: ["inner"] },
      { id: "inner", members: ["outer"] },
    ],
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join("\n")).toContain("cycle");
});

it("rejects a layout key that names nothing", () => {
  const result = validateDiagramDocument(documentWith({
    layout: { nodes: { ghost: { x: 0, y: 0 } } },
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      'layout.nodes.ghost: "ghost" is not a node in content',
    );
  }
});

it("rejects a rectangle for a grouped boundary", () => {
  const result = validateDiagramDocument(documentWith({
    groups: [{ id: "runtime", members: ["cf", "api"] }],
    layout: { boundaries: { cf: { x: 0, y: 0, w: 100, h: 100 } } },
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      'layout.boundaries.cf: "cf" is in a group, so its rectangle is derived from its members. ' +
        "Remove the layout entry, or take it out of the group.",
    );
  }
});

it("rejects a boundary that is neither grouped nor placed", () => {
  const result = validateDiagramDocument(documentWith({ groups: [] }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      '"cf" has no geometry: put it in a group so it encloses its members, ' +
        "or give it a rectangle in layout.boundaries.",
    );
  }
});

it("rejects a group whose only member is a boundary", () => {
  const result = validateDiagramDocument(documentWith({
    groups: [{ id: "runtime", members: ["cf"] }],
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      '"runtime" contains no node, so "cf" has nothing to enclose. ' +
        "Add a node to the group, or take the boundary out of it and place it.",
    );
  }
});

it("rejects a chain of groups that bottoms out in no node", () => {
  const result = validateDiagramDocument(documentWith({
    groups: [
      { id: "outer", members: ["inner"] },
      { id: "inner", members: ["cf"] },
    ],
  }));

  expect(result.ok).toBe(false);
});

it("rejects two boundaries in one group", () => {
  const result = validateDiagramDocument(documentWith({
    boundaries: [boundary("cf"), boundary("aws")],
    groups: [{ id: "runtime", members: ["cf", "aws", "api"] }],
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join("\n")).toContain(
      '"runtime" has two boundaries, "cf" and "aws" — a group is framed by at most one',
    );
  }
});

it("accepts a nested group with its own boundary", () => {
  const result = validateDiagramDocument(documentWith({
    boundaries: [boundary("cf"), boundary("data")],
    groups: [
      { id: "runtime", members: ["cf", "api", "storage"] },
      { id: "storage", members: ["data", "db"] },
    ],
  }));

  expect(result.ok).toBe(true);
});

it("rejects a partial position", () => {
  const result = validateDiagramDocument(documentWith({
    layout: { nodes: { api: { x: 10 } } },
  }));

  expect(result.ok).toBe(false);
});

it("rejects an edge that names a boundary", () => {
  const result = validateDiagramDocument(documentWith({
    edges: [{ from: "cf", to: "api" }],
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join("\n")).toContain("Available nodes:");
});

it("reports every problem in one parse", () => {
  const result = validateDiagramDocument(documentWith({
    edges: [{ from: "ghost", to: "other" }],
    layout: { nodes: { ghost: { x: 0, y: 0 } } },
  }));

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.length).toBeGreaterThan(2);
});
```

- [ ] **Step 2 — run them**; every one fails on a missing module.
- [ ] **Step 3 — write the schemas.** Content reuses plan 01's field rules
      minus geometry:

```ts
/** A node, without geometry. Where it sits is `layout`'s business. */
export const contentNodeSchema = diagramNodeSchema.omit({ x: true, y: true });

/** A boundary, without geometry, plus how tightly it should hug its members. */
export const contentBoundarySchema = diagramBoundarySchema
  .omit({ x: true, y: true, w: true, h: true })
  .extend({ padding: z.enum(BOUNDARY_PADDINGS).default(BOUNDARY_PADDINGS.NORMAL) });

/**
 * A group is a relation, never a drawing. It has no geometry and never will:
 * that is precisely what stops it from contradicting the picture.
 */
export const diagramGroupSchema = z.object({
  id: z.string().trim().min(1, "Group id is required"),
  members: z
    .array(z.string().trim().min(1))
    .min(1, "A group needs at least one member"),
});

const pointSchema = z.strictObject({ x: z.number(), y: z.number() });
const rectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().positive("Boundary width must be positive"),
  h: z.number().positive("Boundary height must be positive"),
});
const anchorsSchema = z.strictObject({
  out: z.enum(ANCHOR_SIDES),
  inn: z.enum(ANCHOR_SIDES),
});

export const diagramLayoutSchema = z.object({
  nodes: z.record(z.string(), pointSchema).default({}),
  boundaries: z.record(z.string(), rectSchema).default({}),
  edges: z.record(z.string(), anchorsSchema).default({}),
  /** ADR 0002's escape hatch: a fixed frame, for a slide of an exact size. */
  canvas: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});

export const diagramDocumentSchema = z
  .object({
    version: z.literal(2),
    content: diagramContentSchema,
    layout: diagramLayoutSchema.default({}),
  })
  .superRefine(checkDocument);
```

      `strictObject` on the layout values is what rejects `{ x: 10 }` and a
      stray `zIndex` without a rule of its own.

- [ ] **Step 4 — write `checkDocument`,** one pass reporting everything:
      nodes, boundaries and groups share **one id namespace** (group members and
      layout keys address them by bare id, so a node and a boundary called `api`
      would be ambiguous); edge ids are their own namespace; every `edges.from`
      / `.to` names a node and not a boundary and not itself; every group member
      exists, is not the group itself, and appears in no other group's members;
      every group contains at most one direct boundary, because that boundary is
      the group's sole visual frame; every group contains at least one node,
      directly or through nesting, because a boundary with nothing to enclose
      has no rectangle the resolver could compute and `resolveDiagram` must stay
      total; the group graph has no cycle (walk it iteratively — a hand-written
      document may be cyclic and the validator must not recurse forever); every
      layout key names an existing element of the right kind; a grouped boundary
      has no layout rectangle; an ungrouped boundary has one.
- [ ] **Step 5 — write `EXAMPLE_DIAGRAM_DOCUMENT`** as the spec's payments
      example, content-only, and export it as the editor's future seed. It is
      the only example anyone maintains, so it must exercise both cases: a group
      with a boundary, and a group without one.
- [ ] **Step 6 — run** the tests; green.
- [ ] **Step 7 — commit.** `feat(domain): the v2 diagram document and its validator`

### Task 4 — Auto-layout: pinned obstacles

**Files:** Modify `render/layout.ts`, `render/__tests__/layout.test.ts`

**Interfaces**

- Produces: `layoutNodes(content: DiagramContent, pinned: Readonly<Record<string,
Point>>): Map<string, Point>`. `layoutDiagram(resolved)` is deleted — the
  editor's Arrange goes through the resolver from plan 03 onwards.

- [ ] **Step 1 — write the failing tests:**

```ts
it("places every node when nothing is pinned", () => {
  const placed = layoutNodes(content, {});
  expect(placed.size).toBe(content.nodes.length);
});

it("leaves a pinned node exactly where it was put", () => {
  const placed = layoutNodes(content, { api: { x: -400, y: 900 } });
  expect(placed.get("api")).toEqual({ x: -400, y: 900 });
});

it("never places a node on top of a pinned one", () => {
  const placed = layoutNodes(content, { api: { x: 110, y: 110 } });
  const others = [...placed].filter(([id]) => id !== "api").map(([, point]) => point);

  for (const point of others) {
    const collides =
      Math.abs(point.x - 110) < NODE_SPACING && Math.abs(point.y - 110) < NODE_SPACING;
    expect(collides).toBe(false);
  }
});

it("is deterministic", () => {
  expect(layoutNodes(content, {})).toEqual(layoutNodes(content, {}));
});

it("terminates on a cycle", () => {
  expect(() => layoutNodes(cyclicContent, {})).not.toThrow();
});
```

- [ ] **Step 2 — run them**; they fail on the missing export.
- [ ] **Step 3 — implement.** Keep `assignColumns` (longest-path over solid
      edges, Kahn's queue, cycle remainder in declaration order) exactly as it
      is — it is the same opinion the guidelines teach. Change what happens
      after: a node with a pinned position takes it verbatim and is added to the
      occupied set before anything else is placed; every other node gets its
      grid candidate and is then pushed down by `NODE_SPACING` while it lands
      within `NODE_SPACING` of anything already occupied, in declaration order.
- [ ] **Step 4 — document the known limitation** in the module comment: a
      document that pins some nodes and not others can put an auto-placed node
      somewhere a human would not have chosen. The editor avoids the state
      entirely by materialising layout on first touch (plan 03); a hand-written
      document can hit it, and the fix is to pin or to Arrange.
- [ ] **Step 5 — run**; green. **Commit.** `feat(domain): auto-layout that treats supplied positions as fixed`

### Task 5 — Auto-layout: clusters

**Files:** Modify `render/layout.ts`, `render/__tests__/layout.test.ts`

- [ ] **Step 1 — write the failing test.** The guarantee is containment, because
      that is what makes a derived boundary trustworthy:

```ts
it("keeps a group's members together, with nothing else between them", () => {
  const placed = layoutNodes(contentWithGroups, {});
  const members = ["api", "db"].map((id) => placed.get(id)!);
  const box = boxAround(members);

  const outsiders = ["web", "ci"].map((id) => placed.get(id)!);
  for (const point of outsiders) expect(inside(box, point)).toBe(false);
});

it("reserves room for the rectangle a boundary will be given", () => {
  const placed = layoutNodes(twoLooseGroups, {});
  const left = derivedRect("cf", placed, twoLooseGroups);
  const right = derivedRect("aws", placed, twoLooseGroups);

  expect(intersects(left, right)).toBe(false);
});

it("lays out a group nested inside a group", () => {
  const placed = layoutNodes(nestedContent, {});
  const inner = boxAround(["db", "cache"].map((id) => placed.get(id)!));
  const outer = boxAround(["api", "db", "cache"].map((id) => placed.get(id)!));

  expect(contains(outer, inner)).toBe(true);
});
```

- [ ] **Step 2 — implement the recursion.** Lay out a _list of items_, where an
      item is a node or a group: 1. Condense the graph: an edge joins two items when any node inside one
      connects to any node inside the other. Edges internal to an item are
      invisible at this level. 2. Run the existing column/row assignment over the condensed items. 3. Recurse into each group to lay its members out locally, which yields
      that item's block size; a node's block is one tile plus its text. A
      group carrying a boundary pays for it here: its block grows by
      `BOUNDARY_PADDING_SIZE[padding]` on all four sides and by
      `BOUNDARY_LABEL_SIZE` on top. The rectangle is derived after placement,
      but the room for it has to be reserved during placement — measuring the
      members alone leaves the box drawn outside its own slot, and one level
      of nesting or a `loose` padding is enough to push it over the
      neighbouring column. 4. Advance columns by the widest block in the column plus
      `LAYOUT_COLUMN_GAP`, rather than by a fixed step, so a group's block
      never overlaps its neighbour. 5. Translate each group's local positions into its slot.
      Containment then holds by construction — no post-hoc check is needed, and
      no member can be separated from its group by a stranger.
- [ ] **Step 3 — run** both layout test files; green. Determinism test still
      passes.
- [ ] **Step 4 — commit.** `feat(domain): lay out a group's members as one block`

### Task 6 — `resolveDiagram`

**Files:** Create `render/resolve.ts` and its test; modify `render/index.ts`

**Interfaces**

- Consumes: `layoutNodes`, `facingSides`, `nodeBounds`, `boundaryBounds`,
  `BOUNDARY_PADDING_SIZE`, `DIAGRAM_TYPOGRAPHY.BOUNDARY_LABEL_SIZE`.
- Produces: `resolveDiagram(document: DiagramDocument): ResolvedDiagram`.

- [ ] **Step 1 — write the failing tests:**

```ts
it("renders a content-only document", () => {
  const svg = renderSVG(resolveDiagram(EXAMPLE_DIAGRAM_DOCUMENT));
  expect(svg).toContain("<svg");
  for (const node of EXAMPLE_DIAGRAM_DOCUMENT.content.nodes) {
    expect(svg).toContain(escapeXml(node.name));
  }
});

it("sizes a grouped boundary around its members plus its padding", () => {
  const resolved = resolveDiagram(EXAMPLE_DIAGRAM_DOCUMENT);
  const cf = resolved.boundaries.find((boundary) => boundary.id === "cf")!;
  const members = ["api", "db"].map((id) => resolved.nodes.find((node) => node.id === id)!);

  for (const member of members) {
    expect(member.x).toBeGreaterThan(cf.x);
    expect(member.x).toBeLessThan(cf.x + cf.w);
    expect(member.y).toBeGreaterThan(cf.y);
    expect(member.y).toBeLessThan(cf.y + cf.h);
  }
});

it("grows a derived boundary to follow a member dragged out of it", () => {
  const moved = withLayout(EXAMPLE_DIAGRAM_DOCUMENT, { nodes: { db: { x: 1200, y: 800 } } });
  const cf = resolveDiagram(moved).boundaries.find((boundary) => boundary.id === "cf")!;

  expect(cf.x + cf.w).toBeGreaterThan(1200);
});

it("uses a supplied position verbatim", () => {
  const pinned = withLayout(EXAMPLE_DIAGRAM_DOCUMENT, { nodes: { web: { x: -300, y: 40 } } });
  const web = resolveDiagram(pinned).nodes.find((node) => node.id === "web")!;

  expect(web).toMatchObject({ x: -300, y: 40 });
});

it("derives a missing edge anchor from the facing sides", () => {
  const resolved = resolveDiagram(EXAMPLE_DIAGRAM_DOCUMENT);
  expect(resolved.edges[0]).toMatchObject({ out: "r", inn: "l" });
});

it("draws an outer boundary before the boundary nested inside it", () => {
  const resolved = resolveDiagram(nestedDocument);
  const ids = resolved.boundaries.map((boundary) => boundary.id);

  expect(ids.indexOf("outer")).toBeLessThan(ids.indexOf("inner"));
});

it("is byte-stable", () => {
  expect(renderSVG(resolveDiagram(EXAMPLE_DIAGRAM_DOCUMENT))).toBe(
    renderSVG(resolveDiagram(EXAMPLE_DIAGRAM_DOCUMENT)),
  );
});
```

- [ ] **Step 2 — run them**; they fail on the missing module.
- [ ] **Step 3 — implement**, in this order, because each step consumes the one
      before: 1. `positions = layoutNodes(content, layout.nodes)`. 2. Boundaries, depth-first from the innermost: a grouped boundary's
      rectangle is the union of its group siblings' bounds grown by
      `BOUNDARY_PADDING_SIZE[padding]`, with `BOUNDARY_LABEL_SIZE` extra on
      top so the label that rides the border has room. A sibling contributes
      its `nodeBounds` if it is a node, its already-resolved rectangle if it
      is a nested boundary, and — if it is a nested group with no boundary of
      its own — the union of that group's own members, taken recursively.
      Depth-first order is what guarantees the rectangle a nested boundary
      contributes has already been computed. An ungrouped boundary takes
      `layout.boundaries[id]` verbatim. 3. Edges: `layout.edges[id]` if present, otherwise
      `facingSides(positions[from], positions[to])`. 4. Emit boundaries sorted by nesting depth ascending, content order within
      a depth, so an outer box paints under the one nested in it — which is
      also what makes the editor's back-to-front hit-testing select the
      innermost. 5. Carry `title`, `background` and `layout.canvas` across unchanged.
- [ ] **Step 4 — export** `resolveDiagram` from `render/index.ts` and the
      document schemas from `schemas/index.ts`. Run the whole domain suite.
- [ ] **Step 5 — commit.** `feat(domain): resolveDiagram composes content and layout`

### Task 7 — Content-first authoring guidelines

**Files:** Modify `render/guidelines.ts`, `render/__tests__/guidelines.test.ts`

- [ ] **Step 1 — rewrite the guidelines for v2.** The model's job becomes
      architecture, not pixels. Delete the "Coordinates" and "The canvas has no
      edges" sections outright and replace the Layout section with:

```
## You do not place anything

Return `content` only. Do not emit a \`layout\`: positions, boundary rectangles
and edge anchors are computed from what you describe, and a layout you invent
will be worse than the one auto-layout derives from your own edges.

Say what belongs together with a **group**; draw the boundary only when the
group is a real named perimeter — a cloud provider, a runtime, a monorepo.
A group with no boundary is fine: it keeps those tiles together without drawing
a box around them.
```

- [ ] **Step 2 — document the split** at the top: `version` is 2, `content` is
      what the architecture is, `layout` is how it is composed and belongs to
      the editor. Keep every limit interpolated from the constants.
- [ ] **Step 3 — update the guidelines test** to assert the new invariants: the
      text names `MAX_GROUPS`, does not mention `x` or `y` as author fields, and
      still interpolates every tone from `BOUNDARY_TONES`. Run green.
- [ ] **Step 4 — commit.** `docs(domain): content-first authoring guidelines`

### Task 8 — ADR, docs and verification

**Files:** Create
`apps/documentation/src/content/docs/architecture/decisions/adr-0004-content-and-layout-are-separate-parts-of-one-document.mdx`;
modify the diagram-tool `index.mdx`, `config-schema.mdx`,
`authoring-guidelines.mdx`, `diagram-document-v2.mdx`, and the changelog.

- [ ] **Step 1 — write ADR 0004** in ADR 0002's shape. Context: one object
      carrying two independent kinds of change. Decision: the envelope, the
      resolution pipeline, and the rule that the renderer never sees a document.
      Alternatives rejected: two files in the paste flow, and a client-side
      graph store. Consequences: a model that returns only content still
      produces an editable diagram; a drag diff is local to the `layout`
      subtree. What would reopen it: repository collaboration making a
      two-file export worth its friction.
- [ ] **Step 2 — mark the status honestly.** The editor still edits a resolved
      diagram at this point. Both ADRs and the `diagram-document-v2` page must
      say the format and resolver exist in `packages/domain` and that the editor
      adopts them in plan 03. Do not write that v2 is the editor's format yet.
- [ ] **Step 3 — verify.** `bun run check-types && bun run lint && bun run test && bun run build`.
      Then a domain-level smoke check: resolve the spec's example document,
      write the SVG to a scratch file, open it, and confirm the CLOUDFLARE box
      encloses `api` and `db` and nothing else.
- [ ] **Step 4 — commit and open the PR** against `main`.
