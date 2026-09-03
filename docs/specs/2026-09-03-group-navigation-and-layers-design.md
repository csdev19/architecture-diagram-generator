# Group navigation and layers — design

> **Status: accepted, not implemented** · **Date:** 2026-09-03
> **Scope:** `apps/fullstack-fn-only/src/components/editor` only. No schema
> change, no renderer change, no new ADR.
> **Branches:** one per plan — `feat/group-navigation`, `feat/marquee-selection`,
> `feat/layers-panel`.

Grouping shipped in [Diagram Document v2 plan 04](2026-09-02-diagram-document-v2-design.md).
Entering a group was part of it and the code is correct, but until
[#15](https://github.com/csdev19/architecture-diagram-generator/pull/15) the
gesture never fired, so nobody had used it. With the gesture working, what is
missing is everything around it: the editor never says you are inside a group,
double-click drops to the deepest element instead of stepping, Escape leaves
entirely rather than stepping back out, there is no way to select several
children at once, and member order can only be changed by editing the JSON.

| Plan              | Delivers                                                             |
| ----------------- | -------------------------------------------------------------------- |
| 01 — Navigation   | The entered group is visible; double-click and Escape step one level |
| 02 — Marquee      | Drag on empty canvas selects the tiles it encloses                   |
| 03 — Layers panel | A tree in the left rail: reorder members, reparent, reach anything   |

Plans 01 and 02 are independent. Plan 03 relies on the `entered` semantics
plan 01 settles, so it goes last.

## Problem

`entered` is state in `editor-page.tsx` and nothing draws it. The whole
drill-in model — a click selects the outermost group, entering one lets the
next click reach inside — is invisible, and three gestures around it are wrong
or missing.

Concretely, against the seed document (`runtime` holds `cf`, `api`, `db`):

- Entering `runtime` changes nothing on screen. The only way to know where you
  are is to click something and infer it from what got selected.
- `handleEnterGroup` enters `parentGroup(id)` — the element's _immediate_
  parent. With `A > B > node`, a double-click on the node enters `B` directly,
  so `B` can never be selected by pointer at all.
- Escape clears `entered` and `selection` together, so there is no way back to
  the enclosing group; you drop to the root and start again.
- Rearranging two of a group's four children means shift-clicking them one by
  one.
- Member order decides how auto-layout places members and how boundaries paint,
  and the only way to change it is the JSON tab.

## What stays fixed

Three decisions bound this work, taken before the design and not revisited by it:

**Order exists only inside a group.** Dragging in the tree reorders
`content.groups[].members`, which is where order already has meaning. The root
is not reorderable; it is listed in declaration order — every top-level group,
then every ungrouped boundary, then every ungrouped node, each in the order the
document writes them. The alternative — a document-level `content.order` — is a
v2 format change touching the schema, the resolver, the renderer and migration,
and buys nothing this work needs.

**Selection keeps one `kind`.** The marquee selects tiles and only tiles, so a
marquee result is always `{ kind: "node", ids: [...] }`. `selection.ts` refuses
a mixed selection deliberately: the bin, Delete, the inspector and `⌘G` would
each have to invent a tie-break for a mixture. Boundaries stay reachable by
click.

**The tree lives in the left rail, under the palette.** Layers left, inspector
right — the Figma arrangement, and the only one where the tree and the selected
element's fields are visible at the same time, which is exactly the moment you
need both. It shares the palette's 272px, so `insets.left` is unchanged.

## Plan 01 — Navigation

### Saying where you are

Two pieces, both in the stage's overlay SVG, never in the scene — the export
must stay the document the renderer produced, byte for byte.

- **A halo around the entered group**, drawn from `groupBounds` like the
  selection halo but _continuous and quiet_ where the selection halo is _dashed
  and accented_. The contrast is what separates "I am inside this" from "this
  is selected", and both can be on screen at once.
- **A breadcrumb**, anchored top-left of the stage: `runtime › api`. It goes
  top-left rather than into the existing status line, which is centred and
  already carries the tool hint. Its crumbs are labels, not controls — clicking
  one to jump to that level is the layers tree's job, and giving the same
  gesture two homes before either exists is how they end up disagreeing.

Dimming everything outside the entered group is deliberately **not** part of
this. On a technical diagram a scrim hides the context you are working against.
If the halo turns out not to read clearly it is one more layer in the same
overlay, added then.

### Double-click steps one level

`handleEnterGroup` is replaced by a step: given the current `entered` and the
element that was hit, enter **the next group along the chain from `entered`
down to that element**.

```
chain(api) = [runtime]      entered = null  → enter runtime, select api
chain(x)   = [A, B]         entered = null  → enter A,       select group B
                            entered = A     → enter B,       select x
                            entered = B     → already deepest, no-op
```

The selection itself is still computed by `resolveSelection` against the new
`entered`. It already returns the child on the way down, and a second
implementation of that walk would be a second answer to "what does this click
mean", one of them eventually wrong.

### Escape steps one level out

Escape becomes a ladder rather than a reset:

| State                         | Escape does                                       |
| ----------------------------- | ------------------------------------------------- |
| inside a group                | leaves one level, and selects the group just left |
| at the root, something picked | clears the selection                              |
| nothing picked                | clears `edgeFrom`                                 |

Selecting the group you just stepped out of is what makes the ladder usable:
Escape then Escape walks you out of a nesting, and at every rung the thing you
left is what is selected.

### The Escape collision

There are two Escape listeners on `window`, and today they both run.
`diagram-stage.tsx` registers one while a gesture is in flight, to abandon a
drag and put back what it moved. `editor-page.tsx` registers one for the whole
session. Cancelling a drag therefore also clears `entered` and `selection`
today — a pre-existing bug that nobody hit while entering a group did nothing.

Making Escape a ladder makes it visible, so plan 01 fixes it: the stage gains an
`onGestureEnd` callback beside the `onGestureStart` it already has, the page
tracks whether a gesture is in flight, and the page's handler stands down while
one is.

Letting the two cooperate by listener order instead would be a trap. Window
listeners fire in registration order, but the page's is re-registered whenever
its dependencies change — and one of them is the document text, which a drag
rewrites on every pointer move. So the two handlers swap places partway through
the very gesture they are meant to coordinate on. A flag the page owns does not
care what order anything runs in.

⚠️ This is the only place plan 01 changes something that works today. It lands
as its own commit so it can be reviewed apart from the navigation work.

## Plan 02 — Marquee

Under the select tool, a drag that starts on empty canvas draws a rectangle and
selects what it encloses. The gesture is free: today
`handlePointerDown` calls `onSelect(null)` and returns when a press hits
neither a node nor a boundary. It reuses the `draft` state and `boxBetween`
that drawing a boundary already uses, and draws through the same overlay.

- **Tiles whose centre falls inside**, which is the rule
  `handleDrawBoundary` already applies when a drawn box becomes a group. One
  rule for "what does this rectangle contain", used twice.
- **Scoped to the entered group.** Inside one, only its descendants are
  candidates; at the root, every tile is.
- **A box below the minimum side is a click that slipped**, and clears the
  selection exactly as a click on empty canvas does today.
- **A marquee replaces the selection**, it does not extend it. Holding shift to
  add a rectangle to what is already picked is a real gesture, but it is a
  second one, and it belongs with any other multi-select refinement rather than
  with the plan that introduces the first.

⚠️ A deliberate difference from Figma: at the root the marquee yields the loose
tiles, not the groups that hold them. Figma would give you the groups. Doing
that here would produce `kind: "group"` for grouped tiles and `kind: "node"`
for ungrouped ones in the same gesture, which is the mixed selection the model
refuses. Tiles-only is the version that keeps `kind` single, and it is what a
marquee is usually reached for anyway — picking several things to move.

## Plan 03 — Layers panel

A tree in the left rail below the palette, sharing its 272px.

**Shape.** Groups and their members, nested; loose nodes and boundaries at the
root. Each row says what the element is in the diagram's own words, the way
`GroupInspector`'s `describe` already does.

**Click** selects the row's element and sets `entered` to its parent, so the
tree and the canvas never disagree about which level is open.

**Drag** does three things, all of them writes to `content.groups[].members`:

| Gesture               | Edit                                |
| --------------------- | ----------------------------------- |
| within the same group | `reorderMember` — new               |
| onto another group    | `moveMember` — new, remove then add |
| out to the root       | `removeMember` — exists             |

`addMember` and `removeMember` already exist in `edits/group-edits.ts`;
`reorderMember` and `moveMember` join them there. Every one of them goes through
`settled`, like every other edit that can change geometry.

**ADR 0003 is not reopened.** Its non-goal is "reparenting an element by
dropping it into a box" — a boundary on the canvas owning what lands inside it,
which is Figma's Frame and a third object. Reparenting from a tree is the same
membership edit the group inspector already offers by button, reached by a
better gesture.

`GroupInspector` keeps its member list. The tree is navigation across the whole
document; the inspector is the selected group.

**If plan 03 needs splitting**, the cut is a read-only tree first — shape,
click-to-select, `entered` synchronisation — and the three drag gestures after.
Everything before the drags is useful on its own.

## Testing

The regression that made this work necessary is instructive: every jsdom test
passed while the feature was completely broken, because `fireEvent.doubleClick`
dispatches the event rather than earning it from two presses. Tests here assert
state transitions and document writes, which jsdom is honest about, and not
that a browser will synthesise an event.

- **Navigation:** stepping in and out of `A > B > node` reaches every rung;
  Escape during a drag cancels the drag and leaves `entered` alone.
- **Marquee:** the enclosed set matches `handleDrawBoundary`'s rule on the same
  box; a marquee inside a group excludes everything outside it; an
  under-minimum box clears the selection.
- **Layers:** each gesture writes the expected `members` array, and a reparent
  leaves the element in exactly one group.

Plans 01 and 02 additionally get a walk-through in a real browser before their
PRs, for the same reason: the parts that only a browser can be wrong about are
the parts jsdom cannot speak to.

## Non-goals

- A document-level `content.order`, and reordering the tree's root.
- Mixed-kind selection.
- Dimming the canvas outside the entered group. Reconsidered only if the halo
  and breadcrumb prove not to read.
- Reparenting by dropping onto a boundary on the canvas. That is ADR 0003's
  non-goal and stays one.
- Multi-select in the tree, renaming an element from it, and shift-marquee to
  extend a selection.
- Hiding or locking elements. The tree navigates and reorders; it is not a
  visibility model.

## Related

- [Diagram Document v2 — design](2026-09-02-diagram-document-v2-design.md), whose
  plan 04 shipped grouping and deferred marquee selection and member reordering
  to the backlog. This spec is those two backlog rows plus the navigation the
  gesture needed to be usable.
- ADR 0003 — a boundary is an element, a group is a relation. Unchanged.
- ADR 0004 — content and layout are separate parts of one document. Every edit
  here writes to `content`, never to `layout`.
