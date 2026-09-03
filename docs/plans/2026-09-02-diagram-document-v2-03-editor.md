# Diagram Document v2 — plan 03: the editor speaks v2

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`/docs/specs/2026-09-02-diagram-document-v2-design.md`](../specs/2026-09-02-diagram-document-v2-design.md)
**Branch:** `feat/diagram-editor-v2` · **Date:** 2026-09-02
**Depends on:** plan 02 (`validateDiagramDocument`, `resolveDiagram`).

**Goal.** The textarea holds a v2 document. Every edit lands in exactly one half
of it: a rename touches `content`, a drag touches `layout`, and the canvas is
what the resolver makes of the two.

**Architecture.** The invariant that carried phase 0 is unchanged and is the
reason this plan is small: the text is the single source of truth, and every
gesture parses it, mutates raw JSON and prints it back. What changes is the
path a mutation writes to, and that the render pipeline gains one step —
`text → parse → validate → resolve → renderSVG`. Nothing holds a parsed
document, so the canvas and the JSON still cannot disagree.

**Tech stack.** Existing: React 19, vitest + jsdom + RTL. No new dependencies.

## Global constraints

- Everything published is English: code, comments, tests, commits, docs.
- Mutations parse raw JSON and never round-trip through Zod. Parsing with the
  schema would stamp defaults into lines the author never touched.
- Mutations do not validate. A rename that overruns the tile still gets written
  and the existing error channel reports it; silently refusing an edit is worse.
- A mutation on text that does not parse returns the text byte-identical.
- Every coordinate written by a gesture is snapped through `snapToGrid`.
- The editor must never leave a stale layout key behind: an element's layout
  entries die in the same edit as the element.

## Definition of done

The seed loads as a content-only v2 document and renders through auto-layout.
Dragging a tile writes `layout.nodes`, renaming one writes `content.nodes`,
deleting one leaves no trace in either half, Arrange empties `layout.nodes`, and
the JSON panel shows all of it happening.

## File structure

**Create**

```
apps/.../editor/edits/edit-document.ts     parse -> mutate -> print, shared
apps/.../editor/edits/content-edits.ts     names, tones, membership-free content
apps/.../editor/edits/layout-edits.ts      positions, rectangles, anchors
apps/.../editor/edits/materialise.ts       pin what is on screen
apps/.../editor/edits/__tests__/           one test file per module above
```

**Delete**

```
apps/.../editor/editor-tools.ts            split into the three modules above
                                           (EDITOR_TOOLS and the hints move to
                                            editor-toolbar-tools.ts unchanged)
```

**Modify**

```
apps/.../editor/use-diagram-editing.ts     binds the new modules to setText
apps/.../editor/editor-page.tsx            buildState resolves; seed is a document
apps/.../editor/diagram-stage.tsx          draws the resolved diagram
apps/.../editor/pointer-geometry.ts        hit-tests the resolved diagram
apps/.../editor/node-inspector.tsx         content fields only
apps/.../editor/boundary-inspector.tsx     content fields; geometry only when ungrouped
apps/.../editor/diagram-panel.tsx          background writes content
apps/.../editor/edge-tools.tsx             content fields and layout anchors, split
apps/.../editor/__tests__/*                every fixture becomes a v2 document
apps/documentation/…                       editor-page doc, index, changelog
```

---

### Task 1 — Render the document

**Files:** Modify `editor-page.tsx`, `diagram-stage.tsx`,
`__tests__/editor-page.test.tsx`

**Interfaces**

- Consumes: `validateDiagramDocument`, `resolveDiagram`, `EXAMPLE_DIAGRAM_DOCUMENT`.
- Produces: `ParsedState { errors: string[]; resolved: ResolvedDiagram | null }`.
  Everything downstream keeps receiving a `ResolvedDiagram`, so the stage, the
  export and the hit-tests are untouched by this task.

- [ ] **Step 1 — write the failing test:**

```tsx
it("renders the seeded document through auto-layout", async () => {
  render(<EditorPage />);

  const json = await screen.findByLabelText(/diagram json/i);
  expect(JSON.parse((json as HTMLTextAreaElement).value)).toMatchObject({ version: 2 });
  expect(screen.getByRole("img", { name: /diagram/i })).toBeInTheDocument();
});

it("reports a document error without blanking the canvas", async () => {
  render(<EditorPage />);
  const json = await screen.findByLabelText(/diagram json/i);

  await userEvent.clear(json);
  await userEvent.type(json, '{"version":2,"content":{"nodes":[]}}');

  expect(screen.getByText(/at least one node/i)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /diagram/i })).toBeInTheDocument();
});
```

- [ ] **Step 2 — run**; the first fails on `version: 1`.
- [ ] **Step 3 — implement `buildState`:**

```ts
const buildState = (text: string): ParsedState => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unparseable";
    return { errors: [`Invalid JSON — ${detail}`], resolved: null };
  }

  const result = validateDiagramDocument(parsed);
  return result.ok
    ? { errors: [], resolved: resolveDiagram(result.document) }
    : { errors: result.errors, resolved: null };
};
```

      The seed becomes `JSON.stringify(EXAMPLE_DIAGRAM_DOCUMENT, null, 2)`.
      `lastGoodRef` keeps holding the last resolved diagram and the text that
      produced it, for the same reason as before: half of authoring JSON is
      spent in states that do not parse, and losing the picture at each one
      makes the panel unusable.

- [ ] **Step 4 — rename downstream props** from `config` to `diagram` where they
      now carry a `ResolvedDiagram`, so nothing in the app still says "config"
      about something nobody authors.
- [ ] **Step 5 — run** the app suite. Fixtures in other test files are still v1
      and will fail; that is expected and Task 2 through Task 5 fix them as each
      module moves. Keep this commit's own tests green.
- [ ] **Step 6 — commit.** `feat(editor): render the v2 document through the resolver`

### Task 2 — The edit core and layout writes

**Files:** Create `edits/edit-document.ts`, `edits/layout-edits.ts` and their
tests; delete the mutation half of `editor-tools.ts`.

**Interfaces**

- Produces: `editDocument(text, edit): string`, `isRecord`, and from
  `layout-edits.ts`: `moveNode(text, id, x, y)`,
  `setNodePosition(text, id, point: Point | null)`, `moveBoundary`,
  `resizeBoundary`, `setEdgeAnchors(text, edgeId, anchors)`,
  `clearNodeLayout(text)`, `dropLayoutFor(text, ids: string[])`.

- [ ] **Step 1 — write the failing tests:**

```ts
it("creates the layout branch on the first write", () => {
  const next = JSON.parse(moveNode(contentOnly, "api", 130, 260));
  expect(next.layout.nodes.api).toEqual({ x: 130, y: 260 });
  expect(next.content.nodes.find((node) => node.id === "api").x).toBeUndefined();
});

it("snaps a dragged position to the half grid", () => {
  const next = JSON.parse(moveNode(contentOnly, "api", 134, 261));
  expect(next.layout.nodes.api).toEqual({ x: 130, y: 260 });
});

it("deletes the entry when a drag is cancelled on a node that had none", () => {
  const dragged = moveNode(contentOnly, "api", 130, 260);
  const cancelled = JSON.parse(setNodePosition(dragged, "api", null));

  expect(cancelled.layout.nodes.api).toBeUndefined();
});

it("restores an exact position when a drag is cancelled on a pinned node", () => {
  const cancelled = JSON.parse(setNodePosition(pinnedAt(111, 222), "api", { x: 111, y: 222 }));
  expect(cancelled.layout.nodes.api).toEqual({ x: 111, y: 222 });
});

it("drops every layout entry an id owns", () => {
  const next = JSON.parse(dropLayoutFor(fullyPinned, ["api", "api-db"]));
  expect(next.layout.nodes.api).toBeUndefined();
  expect(next.layout.edges["api-db"]).toBeUndefined();
});

it("returns unparseable text unchanged", () => {
  expect(moveNode("{ not json", "api", 0, 0)).toBe("{ not json");
});
```

- [ ] **Step 2 — run**; they fail on the missing modules.
- [ ] **Step 3 — implement `editDocument`** as today's `editConfig`, unchanged
      except for its name and its doc comment, plus a small helper that creates
      the `layout` and `layout.<kind>` records on demand so a content-only
      document accepts its first position without the caller checking:

```ts
/** The layout record for a kind, created on demand. A content-only document is normal. */
const layoutBranch = (document: RawRecord, kind: "nodes" | "boundaries" | "edges"): RawRecord => {
  const layout = isRecord(document.layout) ? document.layout : {};
  document.layout = layout;

  const branch = isRecord(layout[kind]) ? (layout[kind] as RawRecord) : {};
  layout[kind] = branch;
  return branch;
};
```

      `setNodePosition(text, id, null)` deletes the key and, when that empties
      the branch, deletes the branch too — a document should not accumulate
      `"nodes": {}`.

- [ ] **Step 4 — run**; green. **Commit.** `feat(editor): layout edits write only the layout half`

### Task 3 — Content writes, and cleaning up after a delete

**Files:** Create `edits/content-edits.ts` and its test.

**Interfaces**

- Produces: `updateNodeFields(text, id, patch)`, `addNode(text, node)`,
  `removeNode(text, id)`, `addBoundary`, `updateBoundaryFields`,
  `removeBoundary`, `addEdge`, `updateEdgeFields`, `removeEdge`,
  `setBackground`, `setTitle`.

- [ ] **Step 1 — write the failing tests.** The delete cases are the point of
      this task — every one of them is a stale-key bug waiting to happen:

```ts
it("removes a node, its edges, and every layout entry they owned", () => {
  const next = JSON.parse(removeNode(fullyPinned, "api"));

  expect(next.content.nodes.some((node) => node.id === "api")).toBe(false);
  expect(next.content.edges.some((edge) => edge.from === "api" || edge.to === "api")).toBe(false);
  expect(next.layout.nodes.api).toBeUndefined();
  expect(Object.keys(next.layout.edges)).not.toContain("web-api");
});

it("removes a boundary and its rectangle", () => {
  const next = JSON.parse(removeBoundary(withPlacedBoundary, "cf"));
  expect(next.layout.boundaries?.cf).toBeUndefined();
});

it("writes a name into content and touches nothing else", () => {
  const next = JSON.parse(updateNodeFields(fullyPinned, "api", { name: "Gateway" }));

  expect(next.content.nodes.find((node) => node.id === "api").name).toBe("Gateway");
  expect(next.layout).toEqual(JSON.parse(fullyPinned).layout);
});

it("adds a node with no position at all", () => {
  const next = JSON.parse(addNode(contentOnly, { id: "queue", emoji: "📮", name: "Queue" }));
  expect(next.content.nodes.at(-1)).toEqual({ id: "queue", emoji: "📮", name: "Queue" });
});
```

- [ ] **Step 2 — run**; failing.
- [ ] **Step 3 — implement.** Port each helper from `editor-tools.ts`, changing
      only the path (`document.content.nodes` instead of `config.nodes`) and
      adding the layout cleanup to the three removals. `addNode` writes no
      coordinate: the caller decides whether the new tile is pinned, and Task 4
      is where it decides.
- [ ] **Step 4 — run**; green. **Commit.** `feat(editor): content edits, and deletes that leave no stale layout`

### Task 4 — Materialise on first touch

**Files:** Create `edits/materialise.ts` and its test; modify
`use-diagram-editing.ts`, `editor-page.tsx`

**Interfaces**

- Produces: `materialiseLayout(text: string, diagram: ResolvedDiagram): string`
  — writes the resolved position of every node that has none, and the resolved
  rectangle of every ungrouped boundary that has none. A no-op when the document
  already pins everything.

- [ ] **Step 1 — write the failing tests.** This is the rule that stops the
      canvas shuffling under the user's hand, so it gets tested as behaviour,
      not just as a helper:

```ts
it("pins every node the resolver placed", () => {
  const next = JSON.parse(materialiseLayout(contentOnly, resolveDiagram(parsed(contentOnly))));

  for (const node of JSON.parse(contentOnly).content.nodes) {
    expect(next.layout.nodes[node.id]).toBeDefined();
  }
});

it("leaves positions the author already wrote", () => {
  const next = JSON.parse(materialiseLayout(pinnedAt(111, 222), resolved));
  expect(next.layout.nodes.api).toEqual({ x: 111, y: 222 });
});
```

```tsx
it("does not move the other tiles when one is dragged", async () => {
  render(<EditorPage />);
  const before = positionsOf(await screen.findByLabelText(/diagram json/i));

  await dragTile("web", { by: { x: 60, y: 0 } });

  const after = positionsOf(await screen.findByLabelText(/diagram json/i));
  for (const id of Object.keys(before)) {
    if (id !== "web") expect(after[id]).toEqual(before[id]);
  }
});

it("does not move the existing tiles when a new one is placed", async () => {
  render(<EditorPage />);
  const before = positionsOf(await screen.findByLabelText(/diagram json/i));

  await placeTileAt({ x: 400, y: 400 });

  const after = positionsOf(await screen.findByLabelText(/diagram json/i));
  for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id]);
});
```

      `positionsOf` reads the *resolved* positions, not the raw layout: the
      claim under test is that the picture does not move, whether or not the
      document happened to pin anything.

- [ ] **Step 2 — run**; the drag test fails because auto-layout re-flows the
      unpinned nodes around the one that just got pinned.
- [ ] **Step 3 — implement.** In `useDiagramEditing`, every helper that writes
      layout or changes the set of elements runs `materialiseLayout` first,
      against the currently rendered diagram:

```ts
/**
 * Pin what is on screen before changing anything that could re-flow it.
 *
 * Auto-layout is a function of the whole document, so pinning one tile — or
 * adding one — can legally move the tiles that were never pinned. That is
 * correct for a document and wrong for a gesture: the user moved one thing and
 * expects one thing to move. So the first touch writes down what auto-layout
 * had already decided, and from then on the drawing only changes where it is
 * told to.
 */
const withMaterialisedLayout = (diagram: ResolvedDiagram | null, edit: (text: string) => string) =>
  (text: string): string => (diagram ? edit(materialiseLayout(text, diagram)) : edit(text));
```

      Applies to: `moveNode`, `addNode`, `removeNode`, `addBoundary`,
      `moveBoundary`, `resizeBoundary`, `addEdge` and `removeEdge`. It does not
      apply to field edits, which cannot change geometry, and it must not apply
      to Arrange, whose entire job is to unpin.

- [ ] **Step 4 — run** both tests; green. **Commit.** `feat(editor): materialise layout on first touch`

### Task 5 — Arrange, place, draw, connect

**Files:** Modify `use-diagram-editing.ts`, `editor-page.tsx`,
`diagram-stage.tsx`, `pointer-geometry.ts`, `edge-tools.tsx`, the inspectors,
and every remaining fixture in `__tests__`.

- [ ] **Step 1 — write the failing tests:**

```ts
it("arranging hands placement back to auto-layout", () => {
  const next = JSON.parse(arrangeNodes(fullyPinned));

  expect(next.layout.nodes).toBeUndefined();
  expect(next.content).toEqual(JSON.parse(fullyPinned).content);
});
```

```tsx
it("places a dropped tile exactly where it was dropped", async () => {
  render(<EditorPage />);
  await placeTileAt({ x: 400, y: 400 });

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  const placed = document.content.nodes.at(-1);
  expect(document.layout.nodes[placed.id]).toEqual({ x: 400, y: 400 });
});

it("draws a boundary as an ungrouped, placed rectangle", async () => {
  render(<EditorPage />);
  await dragBoundaryBox({ from: { x: 0, y: 0 }, to: { x: 300, y: 200 } });

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  const boundary = document.content.boundaries.at(-1);
  expect(document.layout.boundaries[boundary.id]).toMatchObject({ w: 300, h: 200 });
});
```

- [ ] **Step 2 — implement Arrange** as `delete document.layout.nodes` (and the
      whole `layout` key when nothing else is left in it). It is now the
      smallest mutation in the editor, and it is exactly "hand placement back to
      the algorithm". The button stays enabled whenever the document validates.
- [ ] **Step 3 — placing a tile** writes the node into `content` and its
      dropped, snapped point into `layout.nodes` — a tile put somewhere on
      purpose is pinned by definition.
- [ ] **Step 4 — drawing a boundary** writes content (`label: "GROUP"` becomes
      `label: "BOUNDARY"`, `tone: neutral`, `padding: normal`) plus a rectangle
      in `layout.boundaries`, because a boundary in no group is a placed one.
      Grouping it is plan 04's gesture.
- [ ] **Step 5 — connecting two tiles** writes the edge into `content` with an
      id from `uniqueNodeId`, and its facing anchors into `layout.edges` — the
      pair was computed from where the tiles are, which is a layout fact.
      Changing an anchor in the edges panel writes `layout.edges[id]`; changing
      a label or a style writes `content`. Split the panel's handlers
      accordingly, so the two halves stay visible in the UI as well.
- [ ] **Step 6 — hit-testing** keeps reading the resolved diagram's coordinates.
      `hitTestBoundary` iterates back to front, which now means innermost first,
      because plan 02 emits boundaries outermost-first.
- [ ] **Step 7 — the boundary inspector** edits `label`, `tone`, `dashed`,
      `filled` and `padding` from content. It shows `x/y/w/h` only for an
      ungrouped boundary; for a grouped one it shows the padding control and a
      line saying the rectangle is derived from its members. In this plan every
      boundary is ungrouped, so wire the branch and cover it with a document
      fixture that has a group in it, ready for plan 04.
- [ ] **Step 8 — run** the whole app suite, converting every remaining fixture
      to a v2 document. Behavioural assertions must not change: the same drag
      still moves the same tile.
- [ ] **Step 9 — commit.** `feat(editor): every gesture writes to exactly one half of the document`

### Task 6 — Docs and verification

**Files:** Modify the diagram-tool `index.mdx`, `editor-page.mdx`,
`config-schema.mdx`, `diagram-document-v2.mdx`; create a changelog entry.

- [ ] **Step 1 — update `editor-page.mdx`** with the two decisions this plan
      makes and the gotcha it creates: every gesture targets one half of the
      document; layout is materialised on first touch and the reason why;
      ⚠️ a mutation that can re-flow the drawing must go through
      `withMaterialisedLayout`, or the canvas shuffles under the user's hand.
- [ ] **Step 2 — update the Shared Gotchas** in `index.mdx`: the text is still
      the single source of truth, but what it holds is now a document, and the
      canvas is what `resolveDiagram` makes of it.
- [ ] **Step 3 — flip the status** of ADR 0004 and the `diagram-document-v2`
      page from "domain only" to implemented, now that the branch actually
      contains the editor using it.
- [ ] **Step 4 — verify.** `bun run check-types && bun run lint && bun run test && bun run build`,
      then `bun run dev:fullstack-fn` and walk the whole loop by hand: load the
      seed, drag a tile and watch only `layout` change in the panel, rename it
      and watch only `content` change, delete it and confirm no orphan key is
      left, Arrange and watch `layout.nodes` disappear, export a PNG and check
      it matches the canvas.
- [ ] **Step 5 — commit and open the PR** against `main`.
