# Sketch fixtures — growing the corpus, and the scorecard that needs it

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Review:** [`/docs/reviews/2026-09-03-mirrored-sketch-layout.md`](../reviews/2026-09-03-mirrored-sketch-layout.md)
**Spec:** [`/docs/specs/2026-09-03-ai-diagram-consumption-design.md`](../specs/2026-09-03-ai-diagram-consumption-design.md)
**Branch:** `docs/sketch-fixture-corpus-plan` · **Date:** 2026-09-04
**Status:** not started. This document is the plan, not a record of work done.
**Depends on:** #36 (the reading-order fix) and #37 (the fixture suite), both open.

**Goal.** Grow the sketch corpus until it covers the ways a photograph actually
goes wrong, land the two icon keys the last whiteboard asked for, and — once the
generation layer exists — turn the corpus into a scorecard for how well a model
reads a picture.

**What already exists.** `packages/domain/src/render/__tests__/fixtures/sketches/`
holds one directory per photographed sketch — the image, the document a model
actually returned from it, and the reviewed facts about the picture that
document must be drawn as. `sketch-fixtures.test.ts` resolves each recording and
checks reading order, rows, the band, boundary containment and overlap. Two
fixtures are in it. Its README is the protocol; this plan does not restate it.

## Global constraints

- Everything published is English: code, comments, tests, commits, docs.
- A recording is never edited. A model's misreading is recorded as prose under
  `misreadings` and asserted by nothing.
- Nothing here may put a model call in the path of `bun run test`.

## Step 1 — Grow the corpus

Deliberate variety beats volume. Five sketches that each break something
different are worth more than twenty clean ones, and a sketch drawn _from_ a
generated diagram removes the very failure modes the product exists to survive:
bad handwriting, perspective, glare, an arrowhead three pixels wide, a box that
does not close.

**Protocol, in this order.** Decide the architecture → draw it by hand from that
decision → run the copied prompt → write `expected.json` from the photograph.
Writing the expectation after reading the output is how a fixture ends up
certifying whatever the model happened to do.

Two things are needed per sketch, and only the first is hard: **the photograph**,
and **the document the model returned, verbatim** — including, especially, a
document that got something wrong.

- [ ] **Nested perimeters** — a boundary inside a boundary (a VPC inside an
      account, a package inside a monorepo). Nothing in the corpus exercises
      `withBoundaryRoom` on a real reading yet.
- [ ] **No arrows at all** — boxes in a row with no lines between them. The whole
      reading order rests on the array order, with no flow to check it against.
- [ ] **Arrows both ways** — a diagram whose flow genuinely runs in both
      directions, so the reading-order majority is a tie and the declared order
      has to carry it alone.
- [ ] **A technology outside the icon registry** — what a monogram fallback looks
      like when it is the honest answer rather than a misread.
- [ ] **Deliberately bad handwriting** — the case the prompt's near-match rule
      exists for, and the one no synthetic input can produce.
- [ ] **A screenshot of somebody else's diagram** — clean input, different
      failure modes: colour, dense labels, an icon set that is not ours.

Each lands as one directory plus one line in `FIXTURES`, in
`sketch-fixtures.test.ts`.

## Step 2 — The two missing icon keys

The last whiteboard held a box labelled `OXUNT` over the letter `O` — oxlint —
and a project of this shape will keep drawing it. Independent of everything
else, and one import plus one line each.

- [ ] Add `oxlint` and `vitest` to `DIAGRAM_ICONS`, if `simple-icons` carries
      them under those slugs. Confirm the mark before adding the key: the
      registry test gates a renamed or dropped upstream export, not a wrong one.
- [ ] Check the contrast floor for each new mark — a brand hex below
      `DIAGRAM_ICON_CONTRAST_MIN` falls back to the tile colour, which is fine
      but should be a known outcome rather than a surprise.
- [ ] Add an alias only where the written word cannot be guessed into the key.

## Step 3 — The scorecard

Whether a model _reads_ a sketch correctly has a different answer every run.
That is not a test and must never gate a PR; it is a report, run on demand,
whose output is a table pasted into a review document.

**Blocked on the generation layer.** The editor copies a prompt to the
clipboard today — it does not call a model, and there is no place for an API key
to live. Building the runner first would be infrastructure with no owner. It is
the first slice of the AI consumption design, and should land with it.

- [ ] `bun run eval:sketches` — for each fixture, send `sketch.jpg` plus
      `DIAGRAM_SKETCH_PROMPT` to the model, N times, and score each reply against
      the fixture's reviewed facts.
- [ ] Record, per fixture and in aggregate: valid on the first try, semantic
      precision (nodes, icon keys, boundary membership, arrow direction),
      unsupported inventions, and reading order correct.
- [ ] Write each run's documents into the fixture directory as new recordings,
      so the corpus grows by being used.
- [ ] Never in CI. No API call inside `bun run test`.

## Step 4 — The snapshot nit

- [ ] Running `bun test` inside `packages/domain` writes a duplicate key into
      `render.test.ts.snap`: the snapshot was authored by Vitest, whose key
      format differs. Either make `bun test` fail fast with a message pointing
      at `bun run test`, or stop the snapshot file from being writable by it.

## Definition of done

Steps 1, 2 and 4 are done when their boxes are ticked and `bun run test`,
`bun run lint` and `bun run check-types` are clean. Step 3 is done when a
scorecard for the whole corpus can be produced by one command and pasted into a
review, and no part of it runs during `bun run test`.

**What would reopen this.** A sketch that is read correctly and still drawn
wrong, in a way none of the five expectation keys can express. That is the
signal the vocabulary is too small — and widening it is a deliberate change to
what the suite claims to guarantee, not a fix.
