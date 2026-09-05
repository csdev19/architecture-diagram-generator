# Edge label placement — design

> **Status: proposed, not implemented** · **Date:** 2026-09-03
> **Scope:** `packages/domain/src/render/` only. No schema change, no document
> format change, no new ADR — nothing an author writes changes.
> **Branch:** `fix/edge-label-placement`

Both defects were found while testing AI generation end to end: hand a model a
picture of an architecture, take the `DiagramDocument` it returns, paste it into
`/editor`. They are not reachable by fixing the document, because they are
decisions the renderer makes after every coordinate is settled.

They became visible only once
[#17](https://github.com/csdev19/architecture-diagram-generator/pull/17)
straightened the main path. While the spine bent around the boundary, edge
labels happened to land in empty space; on a straight row they land on the text
under the tiles.

| Defect                                     | What it looks like                                                   |
| ------------------------------------------ | -------------------------------------------------------------------- |
| 01 — A label lands on a node's text        | `session store` printed across Hono's `http server`, both unreadable |
| 02 — A label's backing is the wrong colour | A grey-white patch under `SQL` sitting on an orange boundary fill    |

## Defect 01 — a label lands on a node's text

`renderEdge` puts a label at the geometric midpoint of the line and nothing
looks at what is already there. A node's name and sublabel occupy roughly
`NODE_TEXT_BLOCK` (40px) directly under its tile, which is exactly where a
horizontal edge passing beneath a row of tiles puts its own label.

Reproduced by the fullstack reference document: `better-auth → Cloudflare D1`,
labelled `session store`, is a long dashed run passing under the flow row. Its
midpoint lands on Hono. Nodes are painted after edges, so the node's sublabel
draws over the label — neither is legible and the diagram reads as damaged.

The rule the renderer already follows is the right one to extend: a label sits
at the midpoint _unless_ something is there. It needs a second option to fall
back to, and a test for what "something is there" means.

**Approach.** Give `renderEdge` the same `nodeBounds` the layout already uses,
and slide the label along its own line — in steps, away from the midpoint,
first one way then the other — to the first position whose backing rectangle
intersects no node's tile-and-text box. If the whole line is covered, offset it
perpendicular instead, on the side with more room. Deterministic, pure, and it
never moves a label that was never in trouble.

**Explicitly not in scope.** Orthogonal routing, label rotation along the line,
and moving the _line_ rather than the label. `renderEdge` documents straight
lines as a deliberate choice and this does not reopen it.

## Defect 02 — a label's backing is painted with the paper

`renderEdge` takes a `paper` colour and paints an opaque rectangle behind the
label with it. The comment is honest about why it exists: "without this the
label collides with the background grid and is unreadable." It is only correct
when the paper is what is actually behind the label.

Inside a boundary it is not. A boundary paints a tinted fill —
`BOUNDARY_TONE_INFO.orange.fill` is `#fdf3e7`, the grey paper is `#f8f9fa` —
so every label inside a box gets a visible off-colour patch. Both reference
documents show it, on `SQL`, on `query`, and on `session store`.

The same bug is in `renderBoundary`: a nested boundary's label cover is painted
with the paper too, so `WORKERS RUNTIME` carries a pale rectangle across the
Cloudflare box's fill. One defect, two call sites.

**Approach.** The backdrop behind a point is a property of the resolved
diagram, not of a single edge: it is the innermost `filled` boundary whose
rectangle contains that point, or the paper when there is none. `renderSVG`
already holds the boundaries in paint order, so it can resolve the backdrop
once and hand each label the colour behind it. `renderEdge` and
`renderBoundary` keep taking a colour and stop assuming which one it is.

Note the ordering constraint: boundaries are painted before edges and both
before nodes, so a label's backdrop is decided by boundaries only. That is what
makes the answer a pure function of the rectangles rather than of paint order.

## What has to be true to close this

1. In both reference documents, no edge label's backing rectangle intersects
   any node's tile or text block.
2. Every edge label and every boundary label is backed by the colour actually
   behind it — paper outside every box, the boundary's fill inside one, and the
   innermost fill where boxes nest.
3. A regression test per defect, each failing on the current renderer: one
   asserting non-intersection on a document that reproduces the collision, one
   asserting the resolved backdrop for a point inside a nested boundary.
4. `render.test.ts.snap` regenerated, and the diff read rather than accepted —
   a snapshot that changes in a way nobody explains is worth less than no
   snapshot.
5. The renderer stays pure and DOM-free. It runs unchanged inside a Worker, and
   the editor's canvas and the exported PNG must remain the same function.

## Non-goals

- Changing the document format. An author does not place a label today and must
  not start to.
- A manual label offset in `layout`. It would be a real feature, and it is not
  this: these are two cases of the renderer drawing over itself, and a document
  should not have to carry a workaround for them.
- Collision between two edge labels. It has not been observed yet; adding a
  rule for it now would be speculative.
