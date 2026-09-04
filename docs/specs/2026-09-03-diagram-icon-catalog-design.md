# Diagram icon catalog — scaling from a curated set to a searchable library

> **Status:** proposed · **Date:** 2026-09-03 · **Scope:** how a node picks a
> brand mark, for both the editor's tile palette and an AI-authored
> `DiagramDocument v2`. It extends the icon registry introduced in
> [`2026-09-01-diagram-tool-next-phases-01-icons.md`](../plans/2026-09-01-diagram-tool-next-phases-01-icons.md);
> it does not replace the renderer, schema, or MCP transport.

## Outcome

Someone building a diagram — by hand in the editor, or through an AI agent via
MCP — can use the real logo of any technology `simple-icons` ships (3,457
marks today, upstream-maintained and growing), not only the ~28 the project
hand-curated at launch. Excalidraw's element library is the reference
experience: browse or search a large catalog, only pay for what you actually
place.

This does **not** mean shipping the whole catalog to every visitor, and it
does not mean the AI needs the full key list in its context window either —
both of those break at this scale and are the reason this needs a design
before it needs code.

## Current state

| Concern                      | Today                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry                     | `packages/domain/src/constants/diagram-icons.ts` — 20-odd named imports from `simple-icons` (`siReact`, `siDocker`, …), reduced to `{ title, path, hex }`                           |
| Schema                       | `iconKey: z.enum(DIAGRAM_ICON_KEYS).optional()` in `packages/domain/src/schemas/diagram.ts` — a compile-time closed set                                                             |
| Guidelines sent to the model | `DIAGRAM_GUIDELINES` interpolates `DIAGRAM_ICON_KEYS.join(", ")` in full — `packages/domain/src/render/guidelines.ts`                                                               |
| Editor picker                | `tile-catalog.ts` derives `PALETTE_TILES` from the registry; `tile-palette.tsx` filters it client-side with `Array.filter`, no network call                                         |
| Render                       | `renderSVG` (`packages/domain/src/render/node.ts`) reads `DIAGRAM_ICONS[iconKey].path` synchronously — pure, isomorphic (browser preview and Worker PNG export share the same call) |
| MCP surface                  | `get_diagram_guidelines`, `validate_diagram`, `render_diagram` — three tools, render-oriented only (`docs/specs/2026-09-03-ai-diagram-consumption-design.md`)                       |

`simple-icons` 16.29.0 (the pinned version) ships the catalog two ways that
matter here:

- `simple-icons/icons.json` → `data/simple-icons.json`, **448KB**, one entry
  per mark with `title`, `slug`, `hex`, `source`, no path data. This is a
  search index, not a render source.
- `simple-icons/icons/<slug>.svg` → one raw SVG file per mark, a few KB each,
  ~15MB for all 3,457 combined. This is the render source, fetched per icon.

Every other entry point (`simple-icons` bare import, `simple-icons/icons`)
pulls in `index.mjs`, a single 5MB module with every mark as a named export —
the shape the current curated registry deliberately avoids by importing one
name at a time.

## Product boundary

Two consumers pick an `iconKey`, and both must keep working through this
change without a code change on their side:

| Consumer            | What it needs                                                | Must not have to do                        |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Editor tile palette | Search the catalog, preview a mark, place it on a node       | Download 3,457 SVG paths to load `/editor` |
| AI agent (MCP)      | Resolve a technology name to a valid `iconKey`               | Hold 3,457 keys in its prompt or context   |
| `renderSVG`         | The path for whatever `iconKey`s a document already contains | Become async, or change its call signature |

`renderSVG` staying synchronous and pure is a hard constraint carried over
from the phase-0 renderer design: it is the reason browser preview and
`resvg` PNG export can share one code path. This design does not touch that
contract — it resolves icon paths **before** `renderSVG` is called, not
inside it.

## Architecture

### Two tiers, one registry shape

The curated registry does not go away — it becomes the fast tier of a
two-tier system:

1. **Core set** (today's ~28, grown as needed): statically imported by name,
   exactly as now. Path data is in the JS bundle, resolution is synchronous,
   zero latency. This tier exists because a handful of marks appear in nearly
   every diagram this tool draws (this repo's own stack, the neighbours it
   keeps adding) and deserve zero-cost resolution — plus the manual review
   the current registry gives every mark (contrast against the tile,
   label overrides such as `cloudflareworkers` → "Workers").
2. **Extended catalog**: the full `simple-icons` set, addressed by its own
   `slug` as `iconKey`, resolved **on demand**. Nothing outside the core set
   ships as bundled path data anywhere, client or server.

`DiagramIconKey` stops being `keyof typeof DIAGRAM_ICONS` (a closed union)
and becomes `string`, validated at runtime against the union of core keys and
the 3,457 extended slugs — the same relaxation the original icons plan
already flagged as the compliant fallback for when `z.enum` cannot hold the
list: _"a `z.string().refine(isValidDiagramIconKey)` with the same message is
the compliant fallback."_ This design promotes that fallback to the only
path once the extended tier exists.

### The search index

`simple-icons/icons.json` (448KB, metadata only) is imported once as a
module-level constant in `packages/domain/src/constants/diagram-icons.ts` —
the same admissibility argument the registry file already documents for
plain-data imports (no DOM, no bundler magic, Worker-safe) applies unchanged
to this file; it is a JSON array of plain objects.

```ts
export const searchDiagramIcons = (query: string, limit = 5): IconMatch[] => { … }
```

A simple match over `title` + `slug` (substring, then a short fuzzy pass) is
enough at this size — 3,457 in-memory string comparisons run in
sub-millisecond time, this is not a performance-sensitive path. This one
function is the shared engine for three call sites:

- the editor's search box (replacing `matchesQuery`'s flat `Array.filter`
  over an eagerly-bundled array),
- the `search_icons` MCP tool,
- "did you mean" suggestions inside the Zod validation error for an unknown
  `iconKey`.

Building it once and exposing it three ways is cheaper than building it once
per consumer, and keeps the three surfaces from drifting.

### Resolving a path before render

A new domain function sits between "a document with `iconKey`s" and
`renderSVG`:

```ts
resolveIconPaths(document: DiagramDocument): Promise<Map<DiagramIconKey, IconPath>>
```

For core-tier keys it resolves from the static registry, synchronously
underneath the `Promise` wrapper. For extended-tier keys it resolves the
specific `simple-icons/icons/<slug>.svg` file from R2 — Workers have no
runtime filesystem, so the extended tier must be seeded into R2 once (a build
or release step, not a per-request cost) and read back through a fetch path
shared by the render API and the editor's own client-side request (the
editor never fetches `simple-icons` package contents directly; see the MVP
verdict below for why this is the phase that actually costs time). The
result is a plain lookup map; `renderSVG` itself keeps taking
that map as an argument alongside the document and stays synchronous — no
consumer of `renderSVG` sees an API change beyond the render API
(`POST /render` / server function) and the editor's preview both awaiting
`resolveIconPaths` first.

This is the piece that keeps the sync/pure contract alive: the async
boundary moves to one call site, once per render, instead of leaking into
the renderer.

### Editor picker

`tile-catalog.ts`'s eager, statically-imported `PALETTE_TILES` array stays
exactly as-is for the core tier — the palette's default view (what a user
sees before typing) is still the curated set, unchanged UX. The search index
(448KB) is not part of the editor's initial bundle: it loads via a dynamic
`import()` triggered the first time the "Add a tile" panel opens, not on
`/editor` page load. Typing a query that matches only outside the core tier
shows extended-catalog results (title + brand colour swatch, resolved from
the metadata's `hex` — no path needed for the swatch); placing one of those
tiles is what triggers `resolveIconPaths` for that single slug, cached
client-side for the rest of the session.

### AI / MCP surface

A fourth tool, alongside the three `docs/specs/2026-09-03-ai-diagram-consumption-design.md`
already defines:

```text
search_icons(query: string) → [{ iconKey, title }, …]   (top ~5 matches)
```

The chosen policy is guess-first with `search_icons` as the fallback: the
model attempts the obvious slug from the naming convention below, and only
calls the tool when it is unsure or `validate_diagram` rejects the guess —
the round-trip cost stays on the uncommon case instead of every node.
`DIAGRAM_GUIDELINES` stops interpolating the full key list (impossible at
3,457 entries) and instead teaches the naming convention: the `iconKey` is
the technology's `simple-icons` slug — lowercase, no separator, and not
always the obvious guess (`nodedotjs`, not `nodejs`; `cloudflareworkers`, not
`cloudflare-workers`). The model protocol gains one branch:

```text
1. Read image or inspect the repository available in its own workspace.
2. Call get_diagram_guidelines.
3. For each node needing a brand mark, guess the iconKey from the
   technology's name using the slug convention above.
4. Produce content-only DiagramDocument v2 JSON.
5. Call validate_diagram.
6. If invalid because of an iconKey, either take the suggestion the error
   already carries, or call search_icons and pick the closest match.
   Validate again.
7. Call render_diagram only after validation succeeds.
```

This keeps the common case — well-known slugs the model already guesses
right — at zero extra round-trips, while giving the model a deterministic
way out of an unfamiliar or ambiguous name instead of retrying blind
guesses. `search_icons` is render-contract knowledge (which mark exists,
under which key), not project or source-code knowledge, so it does not cross
the boundary the consumption design already draws around the MCP surface
("no source-code or project-knowledge tools").

### Validation error quality

The Zod refine for `iconKey` calls `searchDiagramIcons` on a rejected value
and folds the top match into the message, matching the project's existing
actionable-error philosophy:

```text
nodes[2].iconKey: "postgres" is not a known icon. Did you mean "postgresql"?
```

This upgrade matters more at 3,457 entries than it did at 28: the guess-first
policy above leans on it as the primary recovery path, not a nicety.

## Backward compatibility

A persisted `DiagramDocument` only ever stores an `iconKey` string — never a
path. Every diagram authored against the current 28-key closed enum stays
valid unchanged: those keys are a subset of the core tier, which is a subset
of the combined validation set. No migration, no re-render of existing
stored documents.

## Non-goals

- Vendoring or forking `simple-icons`, or building a second icon design
  system. The catalog stays exactly what upstream ships; the project
  curates a fast-path subset of it, nothing more.
- User-uploaded or custom icons. "Import whatever you need" here means
  _whatever `simple-icons` already has_, not arbitrary SVG upload — that is
  a materially different feature (storage, sanitisation, abuse surface) and
  out of scope for this design.
- A CDN or caching layer beyond what already exists: the browser's own
  cache for the per-icon SVG fetch, and R2/Worker edge caching for anything
  served through the app's own routes. No new infrastructure is being
  introduced to serve icon assets.
- Changing which marks belong in the core tier as part of this design — that
  stays an editorial decision made the way it is today (one import, one
  line, reviewed), just no longer the _only_ way to get a logo.

## Open questions for implementation time

- Exact fuzzy-match approach for `searchDiagramIcons` (plain substring vs. a
  small library such as Fuse.js) — a build-time decision, not an
  architectural one; either sits behind the same function signature.
- Whether the R2 seed script runs manually per `simple-icons` bump or as a CI
  job triggered by the dependency update — decide when writing the
  implementation plan.

## MVP verdict: deferred

This design is not launch-blocking, and should not be scheduled as near-term
work. Recorded here so the reasoning survives whoever revisits this later.

**Estimate.** Roughly 5-9 focused engineering days across the four phases
below, more realistically 2-3 calendar weeks once per-phase review lands (this
repo branches and reviews one unit at a time). Phase B carries most of the
risk and most of the estimate's uncertainty: it is the one phase that adds
real infrastructure rather than domain logic. `resolveIconPaths` cannot be a
Worker-side dynamic `import()` of an npm package path the way an earlier
draft of this document assumed — Workers have no filesystem at runtime, so
"resolve an extended-tier icon on demand" means seeding all 3,457
`simple-icons/icons/*.svg` files into R2 once and reading them back through a
fetch path shared by the editor and the render API. That is ordinary work,
the same shape as the render pipeline's existing R2 usage, but it is new
infrastructure with its own edge cases (seed-script drift when `simple-icons`
bumps a version, cache headers, a fetch failure path) — not a same-day
addition to an existing function.

**Why it can wait:**

1. The 28 curated marks already cover this project's own stack plus the
   common neighbours most architecture diagrams reuse. The realistic gap this
   design closes — a rarer or newer technology's logo — is narrow.
2. The gap already has a working answer: `emoji` fallback. A technology
   outside the curated set does not break a diagram today, it degrades
   gracefully to a lower-fidelity mark. This is breadth-of-polish, not a
   broken flow.
3. Phase B's infrastructure has no user-visible payoff on its own — nothing
   in Phases C or D can ship incrementally ahead of it, and nothing in A or C
   is worth shipping without it either. It is an all-or-nothing feature,
   which is a bad fit for launch-week scope.
4. What is actually launch-blocking is documented separately, in
   `2026-09-03-ai-diagram-consumption-design.md`: the AI-authored generation
   flow working correctly is the product's core claim. A wider icon catalog
   is not.

**Reopen condition:** revisit once the AI-consumption flow (Phase A there)
has shipped and real usage shows the curated set's coverage gap actually
costs users diagrams they care about — not before.

## Delivery plan

### Phase A — the search engine and validation upgrade

- Import `simple-icons/icons.json`, add `searchDiagramIcons`.
- Relax the schema from `z.enum` to the runtime-validated `refine` already
  documented as the compliant fallback; add "did you mean" to the error.
- Acceptance: every existing core-tier diagram still validates unchanged; an
  unknown `iconKey` error suggests a real match.

### Phase B — path resolution and the extended tier

- Seed script: upload all `simple-icons/icons/*.svg` to a dedicated R2
  bucket, keyed by slug; re-run on every `simple-icons` version bump.
- Add `resolveIconPaths`, backed by an R2 read; wire it into the render API
  and the editor preview ahead of `renderSVG`, both currently synchronous
  call sites.
- Acceptance: a document referencing an extended-tier `iconKey` renders
  identically in browser preview and server PNG export.

### Phase C — editor picker

- Code-split the search index behind "Add a tile" opening; extend
  `tile-palette.tsx` to show and place extended-tier results.
- Acceptance: `/editor`'s initial bundle size is unchanged from before this
  design; searching an extended-tier technology finds and places it.

### Phase D — MCP `search_icons` tool and guidelines rewrite

- Add the tool; drop the interpolated key list from `DIAGRAM_GUIDELINES` in
  favour of the slug convention and the model protocol's fallback branch.
- Acceptance: a fresh AI conversation resolves both an obvious slug
  (zero extra round-trips) and a non-obvious one (one `search_icons` call,
  no failed `validate_diagram` retry) to a correct `iconKey`.

## Evaluation

Reuse the fixture-and-regression approach `2026-09-03-ai-diagram-consumption-design.md`
already establishes for generation quality: track, per fixture, the
`iconKey` first-pass validity rate and the `search_icons` call rate before
and after this lands. A rising unnecessary-call rate on obvious slugs is a
guidelines problem, not an engine problem — fix the convention wording, not
the search function.
