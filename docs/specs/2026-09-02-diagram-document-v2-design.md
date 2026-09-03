# Diagram Document v2 — design

> **Status: accepted, not implemented** · **Date:** 2026-09-02
> **Scope:** `packages/domain` (schemas, render, layout) and
> `apps/fullstack-fn-only/src/components/editor`. No infrastructure.
> **Branches:** one per plan — `feat/diagram-boundaries`,
> `feat/diagram-document-format`, `feat/diagram-editor-v2`, `feat/diagram-grouping`.

v2 replaces v1. There are no users and no stored documents, so there is no
migration, no version negotiation and no compatibility layer: the only v1
artefact that survives is the seed example, converted by hand.

| Plan                                                                               | Delivers                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [01 — Boundaries](../plans/2026-09-02-diagram-document-v2-01-format.md)            | The word "group" is freed: today's box becomes a `boundary`. Edges gain ids |
| [02 — Document + resolver](../plans/2026-09-02-diagram-document-v2-02-resolver.md) | `content`/`layout` envelope, groups as a relation, `resolveDiagram`         |
| [03 — Editor speaks v2](../plans/2026-09-02-diagram-document-v2-03-editor.md)      | The editor's text becomes the v2 document; every edit targets one half      |
| [04 — Grouping](../plans/2026-09-02-diagram-document-v2-04-grouping.md)            | Group, ungroup, drag a group, nested selection                              |

## Problem

`DiagramConfig` puts two independent kinds of change in one object. **Content**
is what the architecture is — technologies, names, roles, relationships.
**Layout** is how it is composed — coordinates, rectangles, anchor sides. That
is convenient for a hand-authored config, but it asks a model to solve
architecture and geometry in one response, and it means dragging a tile edits
the same document that carries the architectural meaning.

The authoring flow must stay one JSON document. Two coordinated snippets would
add friction exactly where the tool exists to remove it.

## The document

```json
{
  "version": 2,
  "content": {
    "title": "payments",
    "nodes": [
      { "id": "web", "iconKey": "react",      "name": "Web", "sub": "portal" },
      { "id": "api", "iconKey": "hono",       "name": "API", "sub": "http server" },
      { "id": "db",  "iconKey": "cloudflare", "name": "D1",  "sub": "sqlite", "tile": "dark" },
      { "id": "ci",  "emoji": "⚙️",           "name": "CI",  "sub": "deploy" }
    ],
    "boundaries": [
      { "id": "cf", "label": "CLOUDFLARE", "tone": "orange", "padding": "normal" }
    ],
    "groups": [
      { "id": "runtime",  "members": ["cf", "api", "db"] },
      { "id": "pipeline", "members": ["ci", "web"] }
    ],
    "edges": [
      { "id": "web-api", "from": "web", "to": "api", "label": "HTTPS", "style": "solid" },
      { "id": "api-db",  "from": "api", "to": "db",  "label": "SQL",   "style": "solid" }
    ]
  },
  "layout": {
    "nodes": { "db": { "x": 510, "y": 320 } }
  }
}
```

`layout` is optional and may be partial. It is not called `position` because it
holds more than tile positions: boundary rectangles, edge anchors and the fixed
frame all belong to it.

| Part      | Owns                                                                      | Does not own                           |
| --------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `content` | Identity, nodes, boundaries, grouping, relationships, semantic style      | Coordinates, rectangles, anchor sides  |
| `layout`  | Node positions, ungrouped boundary rectangles, edge anchors, fixed canvas | Names, relationships, membership, tone |
| Resolved  | The complete renderer input                                               | A second persisted format              |

## Boundaries and groups

The v1 `group` was two ideas fused: a drawn rectangle, and the claim that some
nodes belong together. v2 separates them, which is what every mature tool does.

- A **boundary** is a drawable element, like a tile. It has a label, a tone and
  a rectangle. It is Figma's Frame, draw.io's container, Excalidraw's frame.
- A **group** is a pure relation over N elements — nodes, boundaries and other
  groups. It is never drawn and has no geometry, ever. It is Figma's Group,
  Excalidraw's `groupIds`, Graphviz's `cluster`. Its only effects are that
  moving it moves every member, and that auto-layout keeps its members together.

### Why the split, and why not a reconciliation rule

An earlier draft kept one object carrying both `nodeIds` and `{x,y,w,h}`, with a
rule for who wins when they contradict — plus a "fit to members" button to
repair the contradiction. Surveying the field showed that nobody does this:

| Tool                               | Object      | Source of truth | Dragging a member out         |
| ---------------------------------- | ----------- | --------------- | ----------------------------- |
| Figma Group, tldraw group          | relation    | membership      | Stays a member; the box grows |
| Excalidraw `groupIds`              | relation    | membership      | Stays a member; the box grows |
| Figma Frame, Excalidraw frame      | element     | the rectangle   | Leaves the frame              |
| draw.io / mxGraph container        | element     | the rectangle   | Is reparented out             |
| Graphviz cluster, Mermaid subgraph | declarative | membership      | N/A — no direct manipulation  |

Either the box derives from the membership, or the membership derives from the
box. **The direction of derivation is the object's identity**, and no tool
authors both. Figma did not resolve the conflict — it avoided it by shipping two
objects. v2 does the same, and the contradiction stops existing rather than
being repaired.

### The invariants

1. A group is never drawn and never has geometry. `layout.groups` does not exist.
2. A group has **at most one direct boundary**. That boundary frames the group's
   other direct members; nested groups may each have their own direct boundary.
   Two sibling boundaries would have the same enclosing responsibility and no
   unambiguous geometry, so the validator rejects them.
3. A group contains **at least one node**, directly or through nesting. A group
   whose only member is a boundary would ask the resolver to enclose nothing,
   and `resolveDiagram` is total over every document that validates — so the
   document that has no answer must be the one that does not validate. This is
   also what stops a chain of empty nested groups.
4. A boundary **in a group** derives its rectangle from its group siblings. A
   boundary **in no group** carries its rectangle in `layout.boundaries[id]`.
   Being grouped is what decides the direction of derivation, so there is no
   ambiguous case.
5. Resizing a grouped boundary does not write a rectangle: it changes its
   semantic `padding` (`tight` | `normal` | `loose`). The renderer stays the
   owner of pixels, exactly as it owns colour.
6. Moving a group moves every member by the same delta.
7. Nothing changes membership except grouping and ungrouping. Dragging a tile
   out of a boundary removes it from nothing; the derived box grows to follow it.

### Membership is a strict tree

An element has at most one direct group, and a group may contain another group.
Nesting is where the "N contexts" come from. Overlapping membership is rejected:
it leaves undefined which cluster auto-layout places a node in and what a click
selects, and not one of the tools above allows it.

## Resolution

```ts
resolveDiagram(document: DiagramDocument): ResolvedDiagram
```

A pure domain function, total over any document that validates:

1. Node positions: supplied ones are used verbatim; missing ones come from
   deterministic auto-layout that treats supplied ones as fixed obstacles.
2. Boundary rectangles: a grouped boundary is sized to enclose its group
   siblings plus its padding; an ungrouped one uses `layout.boundaries[id]`.
   A sibling's extent is its node's bounds, a nested boundary's resolved
   rectangle, or — for a nested group with no boundary of its own — the union of
   that group's own members, taken recursively.
3. Edge anchors: supplied pairs are used; missing ones are the facing pair.
4. The result is the complete renderer input. `renderSVG` is unchanged in role:
   it draws a fully resolved diagram and never knows whether the geometry came
   from a model, from auto-layout or from a drag.

Stale layout keys — an id that no longer exists in content — are a **validation
error**, not a silent drop. The editor keeps layout clean as it edits, so the
error can only be reached by hand-editing the JSON, which is exactly when the
author wants to be told.

## Auto-layout

The v1 `layoutDiagram` re-places every node from topology. v2 needs two things
it does not have.

**Pinned obstacles.** Placement runs over the nodes with no supplied position,
treating supplied positions as occupied space. Same columns-from-topology rule
as v1; collisions push down by `NODE_SPACING` in declaration order.

**Clusters.** A group's members are laid out together, recursively: the graph is
condensed so each top-level group is one super-node, the condensed graph is laid
out with the v1 algorithm, and then each group's members are laid out inside
their own slot by the same function. Containment is guaranteed by construction,
which is what lets a boundary's derived rectangle be trustworthy.

A group's block is measured **including the rectangle its boundary will get** —
its padding on all four sides and its label above. Measuring the members alone
would leave a box drawn outside the space reserved for it, and one level of
nesting or a `loose` padding is enough to push it over the neighbouring column.
The boundary is derived after placement but has to be paid for during it.

## The editor

The textarea's text stays the single source of truth. Every edit parses the
current text, mutates raw JSON, and prints it back. Nothing holds a parsed
document as editing state.

- A content edit writes only inside `content`.
- A drag writes only inside `layout`.
- **Materialise on first touch:** the first gesture that writes layout also
  writes the resolved positions of everything currently on screen. Otherwise
  pinning one node lets auto-layout move the others around it, and the drawing
  would shuffle under a gesture that touched one tile.
- Arrange deletes `layout.nodes` wholesale and lets auto-layout own the
  placement again. Arranging rewrites layout and never content.
- Deleting an element deletes its layout entries in the same edit, so the
  document never contains a stale key.
- Cancelling a drag on a node that had no layout entry deletes the entry rather
  than writing the resolved position back.
- **Grouping a subset nests, it does not steal.** Grouping elements that already
  share a group puts the new group _inside_ that group, in their place. Pulling
  them out into a sibling would leave the parent holding a boundary with nothing
  to frame — a document the editor's own validator rejects. Where the selection
  spans several parents, the new group lands in the nearest common ancestor, and
  a parent left empty is dissolved, handing its boundary a rectangle on the way
  out exactly as ungrouping does.
- A gesture that would break an invariant writes nothing and says so: grouping
  two boundaries together, adding a second boundary to a group, or taking the
  last node out of a group that still has one.
- A grouped boundary is reached by entering its group. Double-clicking inside
  its rectangle, away from any tile, selects the boundary and opens its padding
  control — which is the only route to the affordance that replaced resizing.

## Non-goals

- Two JSON files in the normal copy-and-paste workflow. The one-file envelope is
  the interchange format; splitting it into `payments.diagram.json` +
  `payments.layout.json` stays possible later and is deliberately deferred until
  repository collaboration is a demonstrated need.
- v1 compatibility, migration tooling or a version negotiation path.
- A second renderer or a client-side graph store.
- Overlapping group membership.
- A decorative boundary containing no nodes is supported (it is simply an
  ungrouped boundary), but frame-style clipping and reparenting-on-drop are not.
- Changing the palette or the SVG contract.

## Related

- ADR 0002 — the frame is derived, not declared. `canvas` survives as
  `layout.canvas`, still an escape hatch and still absent by default.
- ADR 0003 (plan 01) — a boundary is an element, a group is a relation.
- ADR 0004 (plan 02) — content and layout are separate parts of one document.
