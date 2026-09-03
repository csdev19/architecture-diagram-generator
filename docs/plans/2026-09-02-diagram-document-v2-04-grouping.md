# Diagram Document v2 — plan 04: grouping

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`/docs/specs/2026-09-02-diagram-document-v2-design.md`](../specs/2026-09-02-diagram-document-v2-design.md)
**Branch:** `feat/diagram-grouping` · **Date:** 2026-09-02
**Depends on:** plan 03 (the editor edits a v2 document).

**Goal.** Make the relation usable: select several things, group them, move them
as one, and enter a group to work inside it. The format has carried groups since
plan 02; this is where a person can make one.

**Architecture.** A group has no geometry, so nothing here draws one — a group's
rectangle exists only as a selection halo in the editor's overlay, computed from
its members. Grouping is a content edit; moving a group is a layout edit applied
to every member node at once. The strict-tree rule from the validator is
enforced at the gesture level too, so the editor cannot author a document its
own validator rejects.

**Tech stack.** Existing: React 19, vitest + jsdom + RTL. No new dependencies.

## Global constraints

- Everything published is English: code, comments, tests, commits, docs.
- The editor must never produce a document that fails `validateDiagramDocument`:
  no overlapping membership, no cycle, no empty group.
- Nothing changes membership except grouping and ungrouping. Dragging a tile out
  of a boundary removes it from nothing.
- A grouped boundary never gets a rectangle written to it. Resizing one changes
  its `padding`.
- Every mutation still goes through the text.

## Definition of done

Select two tiles, press `⌘G`, drag the group and both move together; the
CLOUDFLARE box drawn around them follows; `⌘⇧G` gives the tiles back; and the
JSON panel shows a `groups` entry appearing and disappearing with no geometry in
it.

## File structure

**Create**

```
apps/.../editor/edits/group-edits.ts        createGroup, ungroup, group membership
apps/.../editor/edits/__tests__/group-edits.test.ts
apps/.../editor/group-tree.ts               parent/descendant lookups over content
apps/.../editor/__tests__/group-tree.test.ts
apps/.../editor/group-inspector.tsx         members, and the ungroup action
```

**Modify**

```
apps/.../editor/selection.ts                many, and a kind for a group
apps/.../editor/diagram-stage.tsx           halo, click-through, group drag
apps/.../editor/pointer-geometry.ts         hit-test a group's union bounds
apps/.../editor/editor-page.tsx             shortcuts, selection routing
apps/.../editor/boundary-inspector.tsx      padding replaces the rectangle when grouped
apps/.../editor/side-panel.tsx              inspector routing for a group
apps/documentation/…                        editor-page doc, index, backlog, changelog
```

---

### Task 1 — Group edits

**Files:** Create `edits/group-edits.ts` and its test.

**Interfaces**

- Produces: `createGroup(text, id, memberIds, diagram: ResolvedDiagram): string`,
  `ungroup(text, groupId, diagram: ResolvedDiagram): string` — the resolved
  diagram is needed to hand a boundary that stops being grouped its rectangle,
  `addMember(text, groupId, memberId): string`,
  `removeMember(text, groupId, memberId): string`. All content-only: none of
  them touches `layout`.

- [ ] **Step 1 — write the failing tests:**

```ts
it("creates a group with no geometry at all", () => {
  const next = JSON.parse(createGroup(document, "g1", ["api", "db"]));

  expect(next.content.groups).toContainEqual({ id: "g1", members: ["api", "db"] });
  expect(next.layout.groups).toBeUndefined();
});

it("nests inside the parent when the members already share one", () => {
  const text = withGroup("runtime", ["cf", "api", "db"]);
  const next = JSON.parse(createGroup(text, "g1", ["api", "db"]));

  expect(next.content.groups.find((group) => group.id === "runtime").members).toEqual(["cf", "g1"]);
  expect(next.content.groups.find((group) => group.id === "g1").members).toEqual(["api", "db"]);
});

it("never leaves a parent holding a boundary and nothing else", () => {
  const text = withGroup("runtime", ["cf", "api", "db"]);
  const next = JSON.parse(createGroup(text, "g1", ["api", "db"]));

  expect(validateDiagramDocument(next).ok).toBe(true);
});

it("lands in the nearest common ancestor when the members span two groups", () => {
  const text = withGroups({ outer: ["left", "right"], left: ["api"], right: ["db"] });
  const next = JSON.parse(createGroup(text, "g1", ["api", "db"]));

  expect(next.content.groups.find((group) => group.id === "outer").members).toEqual(["g1"]);
  expect(next.content.groups.some((group) => group.id === "left")).toBe(false);
});

it("hands a dissolved parent's boundary its rectangle back", () => {
  const text = withGroups({ left: ["cf", "api"], right: ["db"] });
  const next = JSON.parse(createGroup(text, "g1", ["api", "db"], resolved));

  expect(next.content.groups.some((group) => group.id === "left")).toBe(false);
  expect(next.layout.boundaries.cf).toMatchObject({ w: expect.any(Number) });
});

it("refuses a group that would contain its own ancestor", () => {
  const text = withGroups({ outer: ["inner", "web"], inner: ["api", "db"] });
  expect(createGroup(text, "g1", ["inner", "outer"])).toBe(text);
});

it("refuses to put two boundaries in one group", () => {
  const text = withBoundaries(["cf", "aws"]);
  expect(createGroup(text, "g1", ["cf", "aws", "api"])).toBe(text);
});

it("refuses a group that would hold no node", () => {
  const text = withBoundaries(["cf"]);
  expect(createGroup(text, "g1", ["cf"])).toBe(text);
});

it("refuses to add a second boundary to a group", () => {
  const text = withGroup("runtime", ["cf", "api"]);
  expect(addMember(text, "runtime", "aws")).toBe(text);
});

it("refuses to take the last node out of a group that still has a boundary", () => {
  const text = withGroup("runtime", ["cf", "api"]);
  expect(removeMember(text, "runtime", "api")).toBe(text);
});

it("ungroups without moving anything", () => {
  const grouped = withGroup("g1", ["api", "db"]);
  const next = JSON.parse(ungroup(grouped, "g1"));

  expect(next.content.groups).toEqual([]);
  expect(next.layout).toEqual(JSON.parse(grouped).layout);
});

it("gives a grouped boundary its rectangle back when the group dissolves", () => {
  const next = JSON.parse(ungroup(withGroupedBoundary, "g1"));
  expect(next.layout.boundaries.cf).toMatchObject({ w: expect.any(Number) });
});
```

- [ ] **Step 2 — run**; failing on the missing module.
- [ ] **Step 3 — implement.** Three rules carry all of it.

      **Grouping nests; it does not steal.** The new group is inserted into the
      *nearest common ancestor* of the elements being grouped, taking their
      place in that ancestor's member list. Pulling a subset out into a sibling
      group is the obvious implementation and it is wrong: a parent left holding
      only its boundary has nothing to frame, which is a document this editor's
      own validator rejects. Nesting is also what Figma does, and it is what
      keeps membership a strict tree. When the selection spans several parents,
      each of them loses its members, and a parent left with no node is
      dissolved into its own parent.

      **A boundary that stops being grouped is handed a rectangle** in the same
      edit — it derived its geometry from the group, so dropping the group
      without writing the resolved rectangle leaves a boundary with no geometry.
      This applies to `ungroup` and to a parent dissolved by `createGroup`,
      which is why both take the resolved diagram as an argument, exactly as
      `materialiseLayout` does.

      **A gesture that would break an invariant writes nothing.** Return the
      text byte-identical when the result would contain a group inside itself,
      two direct boundaries in one group, or a group with no node in it —
      directly or through nesting. The caller shows a toast; refusing silently
      in one place is what keeps every invariant checkable in one function
      rather than at every call site.

- [ ] **Step 4 — run**; green. **Commit.** `feat(editor): create and dissolve groups`

### Task 2 — The group tree

**Files:** Create `group-tree.ts` and its test.

**Interfaces**

- Produces: `parentGroup(content, id): DiagramGroup | undefined`,
  `outermostGroup(content, id): DiagramGroup | undefined`,
  `descendantNodeIds(content, groupId): string[]`,
  `groupBounds(content, diagram, groupId): DiagramFrame` — the union of the
  member bounds, which is the only rectangle a group ever has and which exists
  only in the editor's overlay.

- [ ] **Step 1 — write the failing tests**, including the two that matter for
      correctness on a hand-written document:

```ts
it("finds the outermost group through nesting", () => {
  expect(outermostGroup(nested, "db")?.id).toBe("outer");
});

it("collects every node under a group, however deep", () => {
  expect(descendantNodeIds(nested, "outer").sort()).toEqual(["api", "cache", "db"]);
});

it("terminates on a document whose groups form a cycle", () => {
  expect(() => outermostGroup(cyclic, "api")).not.toThrow();
});
```

- [ ] **Step 2 — implement** with an explicit visited set rather than naive
      recursion. The validator rejects cycles, but this module also runs against
      the _last good_ document while the user is mid-edit, so it must be total.
- [ ] **Step 3 — run**; green. **Commit.** `feat(editor): navigate the group tree`

### Task 3 — Selecting more than one thing

**Files:** Modify `selection.ts`, `diagram-stage.tsx`, `editor-page.tsx`,
`side-panel.tsx`, and the stage tests.

**Interfaces**

- Produces: `Selection = { kind: "node" | "boundary" | "group"; ids: string[] } | null`,
  `isSelected(selection, kind, id): boolean`, `toggle(selection, kind, id)`.

- [ ] **Step 1 — write the failing test:**

```tsx
it("adds to the selection on shift-click and shows how many are picked", async () => {
  render(<EditorPage />);

  await clickTile("web");
  await clickTile("api", { shiftKey: true });

  expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
});
```

- [ ] **Step 2 — widen `Selection` to a list of ids of one kind.** Keeping one
      kind per selection is deliberate: the inspector, the bin and the Delete
      key all ask "which kind am I looking at", and a mixed selection would make
      every one of them invent a tie-break — the same reason the single-slot
      shape was chosen originally. Shift-clicking a different kind replaces the
      selection rather than mixing it.
- [ ] **Step 3 — update the inspector routing:** one id shows the existing
      inspector, several show a count and the actions that make sense on a set
      (group, delete).
- [ ] **Step 4 — run** the app suite; the single-selection tests must still pass
      unchanged apart from the shape of the state they assert on.
- [ ] **Step 5 — commit.** `feat(editor): select several elements at once`

### Task 4 — Group, ungroup, and entering a group

**Files:** Modify `editor-page.tsx`, `diagram-stage.tsx`, `pointer-geometry.ts`;
create `group-inspector.tsx`.

- [ ] **Step 1 — write the failing tests:**

```tsx
it("groups the selection with the keyboard", async () => {
  render(<EditorPage />);
  await clickTile("web");
  await clickTile("api", { shiftKey: true });
  await userEvent.keyboard("{Meta>}g{/Meta}");

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  expect(document.content.groups.at(-1).members.sort()).toEqual(["api", "web"]);
});

it("clicking a member selects the group it belongs to", async () => {
  render(<EditorPage />);
  await clickTile("api");

  expect(screen.getByRole("heading", { name: /group/i })).toBeInTheDocument();
});

it("double-clicking enters the group and selects the tile itself", async () => {
  render(<EditorPage />);
  await doubleClickTile("api");

  expect(screen.getByLabelText(/node name/i)).toHaveValue("API");
});

it("double-clicking inside the box, away from a tile, selects the boundary", async () => {
  render(<EditorPage />);
  await doubleClickAt(emptyPointInside("cf"));

  expect(screen.getByRole("radiogroup", { name: /padding/i })).toBeInTheDocument();
});

it("says why a gesture was refused instead of doing nothing visible", async () => {
  render(<EditorPage />);
  await clickBoundary("cf");
  await clickBoundary("aws", { shiftKey: true });
  await userEvent.keyboard("{Meta>}g{/Meta}");

  expect(await screen.findByText(/a group is framed by at most one boundary/i)).toBeInTheDocument();
});
```

- [ ] **Step 2 — implement selection routing.** A click resolves to
      `outermostGroup(content, hitId)` unless the user has entered that group;
      a double-click enters it and selects the child, exactly as Figma does.
      Entered-group state lives beside `selection` in `EditorPage`, is cleared
      by Escape and by selecting anything outside it, and is the only thing that
      makes a click reach a member.
- [ ] **Step 3 — wire `⌘G` / `⌘⇧G`.** Both are suppressed inside fields, like
      the existing shortcuts. Grouping needs at least two selected elements;
      ungrouping needs a selected group. When a gesture would be invalid — a
      group containing its own ancestor, two boundaries, or no node — nothing is
      written, because `createGroup` already returns the text unchanged. Compare
      the returned text with the text that went in and, when they are identical,
      toast the reason. A refused gesture that looks exactly like a broken one
      is the worst of the three outcomes available here.
- [ ] **Step 4 — write `group-inspector.tsx`:** the member list by name, the
      count, and Ungroup. It edits membership through `addMember` /
      `removeMember`, which is the only place membership can be edited by hand.
- [ ] **Step 5 — hit-test and halo.** A group's overlay rectangle is
      `groupBounds`, drawn dashed in the selection overlay and never in the
      exported SVG — the overlay is a separate SVG on top precisely so nothing
      has to be stripped before export. Entering a group also has to make its
      boundary reachable: inside an entered group, a press that misses every
      tile hits the boundary whose rectangle covers it. That is the only route
      to the padding control, which is the affordance that replaced resizing.
- [ ] **Step 6 — run**; green. **Commit.** `feat(editor): group, ungroup, and enter a group`

### Task 5 — Moving a group

**Files:** Modify `diagram-stage.tsx`, `edits/layout-edits.ts` and their tests.

**Interfaces**

- Produces: `moveNodes(text, deltas: Record<string, Point>): string` — one edit
  writing every member's new position, so a group drag is one entry in the
  undo history rather than one per tile.

- [ ] **Step 1 — write the failing test:**

```tsx
it("moves every member of a group by the same delta", async () => {
  render(<EditorPage />);
  const before = positionsOf(await screen.findByLabelText(/diagram json/i));

  await clickTile("api");           // selects the group
  await dragSelectionBy({ x: 60, y: 40 });

  const after = positionsOf(await screen.findByLabelText(/diagram json/i));
  for (const id of ["api", "db"]) {
    expect(after[id]).toEqual({ x: before[id].x + 60, y: before[id].y + 40 });
  }
  expect(after.web).toEqual(before.web);
});
```

- [ ] **Step 2 — implement.** A drag on a selected group collects
      `descendantNodeIds`, snaps the delta once — snapping each member
      separately would shear the group apart — and writes them all in one
      `moveNodes`. Boundaries inside the group need no write at all: their
      rectangles derive from the members that just moved. Escape cancels by
      restoring the positions captured at press.
- [ ] **Step 3 — run**; green. **Commit.** `feat(editor): dragging a group moves its members`

### Task 6 — The boundary tool becomes a grouping gesture

**Files:** Modify `editor-page.tsx`, `boundary-inspector.tsx`, and their tests.

- [ ] **Step 1 — write the failing tests:**

```tsx
it("groups the tiles a drawn boundary encloses", async () => {
  render(<EditorPage />);
  await dragBoundaryBox({ around: ["api", "db"] });

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  const boundary = document.content.boundaries.at(-1);
  const group = document.content.groups.at(-1);

  expect(group.members).toEqual(expect.arrayContaining([boundary.id, "api", "db"]));
  expect(document.layout.boundaries?.[boundary.id]).toBeUndefined();
});

it("leaves a boundary drawn around nothing as a placed rectangle", async () => {
  render(<EditorPage />);
  await dragBoundaryBox({ from: { x: 900, y: 900 }, to: { x: 1100, y: 1050 } });

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  const boundary = document.content.boundaries.at(-1);
  expect(document.layout.boundaries[boundary.id]).toBeDefined();
});

it("resizing a grouped boundary changes its padding, not a rectangle", async () => {
  render(<EditorPage />);
  await dragBoundaryBox({ around: ["api", "db"] });
  await userEvent.click(screen.getByRole("radio", { name: /loose/i }));

  const document = JSON.parse((await screen.findByLabelText(/diagram json/i)).value);
  expect(document.content.boundaries.at(-1).padding).toBe("loose");
  expect(document.layout.boundaries).toBeUndefined();
});
```

- [ ] **Step 2 — implement.** Drawing a box now means "these belong together":
      the tiles whose centres fall inside it, plus the new boundary, become a
      group, and the boundary keeps no rectangle. The box the user drew is
      therefore a _statement of membership_, and the rectangle they see
      afterwards is the derived one — it can snap tighter or looser on release,
      which is the same thing Figma's `⌘G` does and is worth one line in the
      tool hint. A box drawn around nothing has no members to derive from, so it
      stays an ungrouped, placed rectangle: that is the decorative boundary.
      The gesture goes through `createGroup`, so drawing a box around tiles that
      already share a group nests inside it rather than tearing it apart, and
      drawing one around a group that already has a boundary is refused with the
      same toast as `⌘G`.
- [ ] **Step 3 — replace the resize handles** on a grouped boundary with the
      padding control, and leave them on an ungrouped one. The inspector already
      branched on this in plan 03; this is where the branch gets its second
      case for real.
- [ ] **Step 4 — run**; green. **Commit.** `feat(editor): drawing a boundary groups what it encloses`

### Task 7 — Docs, backlog and verification

**Files:** Modify the diagram-tool `index.mdx`, `editor-page.mdx`,
`config-schema.mdx`, the backlog index, ADR 0003; create a changelog entry.

- [ ] **Step 1 — update ADR 0003's status.** The relation now exists in the
      editor as well as the format, so the "relation modelled in plan 02" note
      is replaced with the consequences as shipped, including what was given up:
      a grouped boundary cannot be resized by hand.
- [ ] **Step 2 — document the gestures** in `editor-page.mdx`: shift-click,
      `⌘G` / `⌘⇧G`, double-click to enter, drag to move the set, and the two
      meanings of the boundary tool. Add the gotcha: ⚠️ a group is never drawn —
      the dashed rectangle around one is an overlay, and anything that puts it
      in the exported SVG is a bug.
- [ ] **Step 3 — add the deferred items to the backlog** as their own rows:
      marquee selection on the canvas, and reordering a group's members. Neither
      is needed to make grouping usable, and both would have widened this plan.
- [ ] **Step 4 — verify.** `bun run check-types && bun run lint && bun run test && bun run build`,
      then walk the definition of done by hand in `bun run dev:fullstack-fn`,
      finishing with a PNG export to confirm no selection halo leaked into it.
- [ ] **Step 5 — commit and open the PR** against `main`.
