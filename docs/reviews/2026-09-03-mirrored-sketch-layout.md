# Mirrored sketch layout

> **Date:** 2026-09-03  
> **Status:** fixed in auto-layout and in the sketch prompt

## Trigger

Two more photographed sketches were run through the copied prompt.

1. A notebook page: `Angular ↔ NestJS ← Postgres`, with NestJS and Postgres
   inside a dashed AWS rectangle.
2. A whiteboard: three titled boxes across the top — Cloudflare (TanStack
   Start), Cloudflare (Hono, Drizzle), Neon (Postgres) — wired right to left,
   and a `TOOLS` band underneath holding five unconnected tiles.

Both were **read correctly**. Every node, every icon key, every boundary, every
tone and every group membership matched the picture, and nothing was invented.
Both were then **drawn mirrored**: the first put Postgres left of NestJS inside
the AWS box, the second rendered Neon | Cloudflare | Cloudflare — the whiteboard
back to front.

## Cause

`assignColumns` layers on the solid edges, so `from` is always placed left of
`to`. An arrow's direction and a diagram's reading order are different claims,
and a sketch is exactly where they come apart: people draw the boxes
client-first and then draw the arrows as the data travelling _back_.

The prompt already forbids reversing an arrowhead that can be seen — that rule
is right, and it is why the reading came out faithful. But it means a faithful
document says `db → orm → api → web` about a picture that reads `web api db`,
and nothing in the document carried the difference.

## Fix

**Auto-layout.** Each item at a level carries the index of the earliest node it
holds in `content.nodes`. Where most of a level's solid flow runs against that
order, the level is layered on the reversed edges — columns only. The document
is untouched and every arrowhead is still drawn where it was read; a line simply
runs right to left, which is what the picture showed.

A group's rank is the earliest node it holds, not its position in
`content.groups`: the canonical example declares `runtime` before `pipeline`
while its nodes are in reading order, and ranking by the group array turned that
correct diagram around. The editor's own edge-anchor test caught it.

**The prompt.** Four rules, one per observed failure:

| Observed                                            | Rule added                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Nothing carried the order the boxes were drawn in   | List nodes, group members and groups in the order they read        |
| A double-headed arrow became two opposed edges      | A double-headed arrow is one edge, in the direction of the request |
| A box holding a legible "O" became a tile named `?` | The mark inside becomes `initials`; `?` only if neither is legible |
| A dashed AWS rectangle came back solid              | A broken or dotted rectangle is `dashed: true` on its boundary     |

The two opposed edges also made a two-node cycle that Kahn's algorithm cannot
drain, so that level fell back to declaration order. It happened to look right.

## Still open

- `oxlint` and `vitest` are not in the icon registry, which is why the whiteboard
  tile stayed a monogram. One import and one line each.
- Running `bun test` inside `packages/domain` writes a duplicate key into
  `render.test.ts.snap` — the snapshot was authored by Vitest, whose key format
  differs. Use `bun run test`.
- No model-backed evaluation yet. Whether a model _reads_ a sketch correctly has
  a different answer every run and needs an API key to ask, so it is a scorecard
  rather than a test, and it belongs with the generation layer in
  [the AI consumption design](../specs/2026-09-03-ai-diagram-consumption-design.md).
  The recordings collected below are its corpus.

## What is now covered

`packages/domain/src/render/__tests__/fixtures/sketches/` holds one directory
per photographed sketch: the image, the document a model actually returned from
it, and the reviewed facts about the picture that document must be drawn as.
`sketch-fixtures.test.ts` resolves each recording and checks reading order,
rows, the band, boundary containment and overlap.

Both sketches from this review are in it, and both fail on the commit before the
fix — with `expected [ 'angular', 'postgres', 'nestjs' ] to deeply equal
[ 'angular', 'nestjs', 'postgres' ]`, which is the bug stated in one line.

A recording is never edited. A model's misreading stays in the file and is
written down as prose under `misreadings`, asserted by nothing: the suite's
question is what this project draws from what a model returns, not whether the
model was right.
