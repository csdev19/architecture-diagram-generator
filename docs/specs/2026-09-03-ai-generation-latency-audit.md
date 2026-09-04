# AI diagram generation — latency audit and revised plan

> **Status:** proposed · **Date:** 2026-09-03 · **Scope:** an audit of
> [AI diagram consumption](./2026-09-03-ai-diagram-consumption-design.md) and
> [AI diagram interaction architecture](./2026-09-03-ai-diagram-interaction-architecture.md),
> against one goal those documents never state: **how long a person waits**.
> It amends both rather than replacing them; the sections it supersedes are
> named at the end.

## Verdict

The two designs are architecturally sound and should be kept. Their layering —
`content`/`layout`, a pure resolver, guidelines derived from constants, a
proposal that never touches the editor's text — is the right foundation, and
nothing below asks to undo it.

They are also **latency-hostile**, and not by a small margin. Neither document
contains a time budget, a turn count, a token count, or the word "streaming".
The protocol they prescribe costs roughly **four model turns and two full
emissions of the same document**. Measured against the code that already
exists, this is optimising the wrong layer: the domain work is 0.15 ms of a
~30 s flow.

The good news is that the largest win is also the cheapest. Removing one tool
and preloading one payload — about half a day of work, no new infrastructure —
is worth an estimated **2.5–3×**. Everything expensive in this document is
worth less than that first half day.

## What was measured

Measured on this branch, against the current domain, on the seed document and
on a synthetic 12-node document (the complexity envelope the interaction spec
proposes).

| Quantity                                    | Value                       | How                      |
| ------------------------------------------- | --------------------------- | ------------------------ |
| `DIAGRAM_GUIDELINES`                        | 6,234 chars (~1,560 tokens) | measured / est. chars÷4  |
| Seed document, 4 nodes, pretty-printed      | 1,530 chars (~380 tokens)   | measured / est.          |
| 12-node document, pretty-printed            | 3,312 chars (~830 tokens)   | measured / est.          |
| Marginal cost per node                      | ~96 tokens                  | derived                  |
| `resolveDiagram` + `renderSVG`, 12 nodes    | **0.11 ms**                 | measured, 200 iterations |
| `diagramDocumentSchema.safeParse`, 12 nodes | **0.04 ms**                 | measured, 200 iterations |

Token counts are `chars ÷ 4`, the standard approximation; they are estimates,
the two timings are not. Everything that follows rests on one ratio: the
domain contributes **0.15 ms** to a flow that currently takes tens of seconds.
There is no meaningful latency work to do in `packages/domain`. All of it is in
how many times a model is asked to speak, and how much it is asked to say.

## The latency model

Time-to-editable decomposes into four terms, and only two of them matter:

```text
T ≈ turns × (TTFT + network) + (output tokens ÷ throughput) + domain + storage
     └── protocol design ──┘   └──── contract design ────┘    └─ ~0 ─┘
```

Working assumptions for the estimates below, stated so they can be argued with:
TTFT 0.6–1.2 s, sustained output 60–100 tok/s for a frontier multimodal model,
one MCP round-trip 150–400 ms, domain 0.15 ms, R2 write 30–80 ms.

Retries multiply the second term, so **first-pass validity is a latency metric,
not a quality metric**. At the consumption spec's 90% target, p95 already
carries a full second emission of the document:

```text
p95 ≈ p50 × (1 + P(invalid) × ~1.9)
```

Moving validity from 90% to 98% is worth more to p95 than most of the code in
either plan. The cheapest routes to it are constrained decoding and
deterministic server-side repair — not prompt tuning.

## Findings

### F1 — The prescribed protocol emits the document twice (critical)

The consumption spec's "Required model protocol" is:

```text
get_diagram_guidelines → produce JSON → validate_diagram → render_diagram
```

In a real agent loop, a tool call _is_ the generation: the model does not
compose a document and then separately call a tool, it composes the document
**inside the tool call arguments**. So `validate_diagram(document)` emits ~830
tokens, and `render_diagram(document)` emits the same ~830 tokens again. The
guidelines call is a third turn that returns a static payload.

Estimated cost of the protocol as written, 12-node diagram:

| Turn | Purpose                      | Output tokens | Est.         |
| ---- | ---------------------------- | ------------- | ------------ |
| 1    | `get_diagram_guidelines`     | ~20           | ~1.5 s       |
| 2    | `validate_diagram(document)` | ~830          | ~10–14 s     |
| 3    | `render_diagram(document)`   | ~830          | ~10–14 s     |
| —    | repair path, when it fires   | +~830         | +~10–14 s    |
|      | **happy path total**         |               | **~22–30 s** |

**Fix.** One tool. `render_diagram` already has to validate before it renders;
returning `{ ok: false, diagnostics }` instead of rendering is the same repair
loop with half the turns. Keep `validate_diagram` as an optional escape hatch
for an agent that wants to check without committing — but stop _prescribing_
it, because the prescription is what costs the turn.

### F2 — `get_diagram_guidelines` should not be a tool call

The guidelines are static per deploy. Spending a model turn to fetch a constant
is pure overhead. MCP already offers three cheaper channels, all of which land
the payload in context before the model's first word:

- server `instructions` on initialise,
- an MCP **resource** the client preloads,
- the tool's own `description`.

**Fix.** Publish the guidelines as a resource plus server instructions; keep a
tool only as a fallback for clients that support neither. Saves a full turn and
~1.5 s. With Anthropic prompt caching, the 1,560 tokens are then near-free on
every subsequent turn of the conversation.

### F3 — `ArchitectureBrief` is mandatory for every source, and it costs a whole model pass

The interaction spec's own diagram makes the brief unconditional:

```text
evidence → ArchitectureBrief → generation + validation → DiagramDocument v2
```

For the **repository** path this is right and free: a coding agent builds the
brief from files it is already reading, and the brief is what keeps source code
out of the request. For the **sketch** path it is neither. Image → brief →
document is two generations where one suffices, and the intermediate is thrown
away. It roughly doubles the sketch path's latency to buy nothing the document
does not already carry.

**Fix.** Make the brief a property of the repository source, not of the
pipeline. Sketches go image → document in one pass. The `generateDiagram` seam
is unchanged; only the internal path per source kind differs.

### F4 — Output tokens are the second-largest lever, and no design constrains them

~96 tokens per node is a _choice_, not a constant. It comes from a document
shape designed for a human reading JSON in a side panel, which is the right
design for the editor and the wrong one for a wire format a model must emit
under a stopwatch.

A terse authoring dialect — normalised into v2 by the domain before anything
else sees it — plausibly cuts this by 55–60%:

```text
pretty v2, 12 nodes   ~830 tokens   ~10–14 s
terse dialect         ~350 tokens   ~4–6 s
```

This is in direct tension with the consumption spec's rule "There is no
AI-specific JSON format", and that tension is real, not a misunderstanding. The
honest framing: it is an _input dialect_, not a second persisted format —
lossless into v2, never stored, never returned, never rendered from. The rule
worth keeping is "one persisted format", which this does not break. The rule as
written is stronger than the problem it protects against.

**Recommendation:** do not build it first. Ship F1 + F2, measure real
documents, and build the dialect only if p50 is still above budget. It is the
highest-risk item in this audit and the second-largest win; that ordering means
it should be earned, not assumed.

### F5 — No streaming, and streaming is the only route to "immediate"

Both specs correctly forbid partial model output from touching the editor's
canonical text. That invariant should stand. But it has been over-applied: the
interaction spec's own proposal state exists precisely so that a candidate can
be shown _without_ being authoritative, and a proposal preview is free to
update as tokens arrive.

Incrementally parsing the partial document and rendering tiles as they land
takes perceived time-to-first-tile from ~11 s to roughly **1–1.5 s**, without
any partial state ever reaching `editor-page`'s text. This is the only lever
that makes generation _feel_ immediate, and it is also the most expensive item
here.

### F6 — Nothing is cached, and generation is deterministic enough to cache

The same document renders to the same SVG — that is an existing, tested
guarantee of the renderer. So `render_diagram` should be keyed on a content
hash: an identical document returns the stored URLs without re-resolving,
re-rendering or re-writing R2. Repeat renders, undo/redo, and the "try again"
that follows a rejected proposal all collapse to ~50 ms.

The contract and guidelines payloads are immutable per deploy and should carry
a strong ETag and a long max-age.

### F7 — Blocking `render_diagram` on PNG will dominate the tail

Phase A returns `{ pngUrl, svgUrl }`. SVG is synchronous string building at
0.11 ms. PNG is not: it needs `resvg-wasm` instantiated per isolate, and —
already flagged in the SVG renderer's own docs — **real font files bundled**,
because the renderer uses system font stacks that do not exist in a Worker.
Rasterising inside the request makes cold start and font loading part of every
generation.

**Fix.** Return the SVG and the edit link immediately; produce the PNG in
`waitUntil`, or lazily on first request of the PNG URL. Nobody is waiting on
the PNG — they are waiting to see the diagram.

### F8 — Auto-repair is forbidden by a rule that was aimed at something else

The interaction spec says a diagnostic's `suggestion` "must not invent
architecture on the caller's behalf". Correct, and it should stay. But it is
being read as a ban on the server fixing anything, and that conflates two
different classes:

| Class                                                        | Repairable server-side? |
| ------------------------------------------------------------ | ----------------------- |
| Missing `version`, missing `content` envelope                | Yes — mechanical        |
| Unknown `iconKey` with an unambiguous nearest registry match | Yes — with a warning    |
| Missing edge `id`                                            | Yes — already derived   |
| `layout` present when it should be absent                    | Yes — strip and warn    |
| Missing node, invented database, guessed direction           | **No — architecture**   |

Every row in the first group currently costs a full extra model turn (~10 s) to
fix something the server can fix in microseconds. Repairing the _contract_ is
not inventing _architecture_.

**Fix.** A bounded, enumerated repair set applied before validation, each
repair reported in `warnings` so nothing is silent. This is the single most
effective attack on p95.

### F9 — Non-latency: the two specs have already drifted

On day one, with no code written:

- `GenerationResult` is defined twice, with different shapes — the interaction
  spec adds `diagnostics`, the consumption spec omits it.
- The MCP surface is three tools in one document and possibly four
  (`get_diagram_contract`) in the other.
- Phase A depends on `docs/plans/2026-09-01-diagram-tool-next-phases-02-api-mcp.md`,
  which the spec itself notes still uses v1 names.

Two documents describing one surface will keep drifting. Consolidate them into
one spec once this audit's changes are accepted.

### F10 — Non-latency: no authentication, quota, or cost ceiling

A public MCP that writes to R2 and calls a paid multimodal model has no
described auth, rate limit, per-caller quota or spend cap, and none of these
appear under Non-goals either. This is a launch blocker rather than a
refinement, and it is unowned in both documents.

### F11 — Non-latency: acceptance criteria that cannot be evaluated

Phase B requires "at least 90% of the evaluation sketches produce schema-valid
JSON on first response" before the fixture set exists. A threshold with no
baseline cannot pass or fail a phase. Build the fixture harness and metrics
_first_, publish the measured baseline, then set the target relative to it.

## Revised protocol

```text
Before (as specified)                     After
─────────────────────                     ─────
1. get_diagram_guidelines   (turn)        guidelines preloaded as MCP resource
2. compose document                       1. render_diagram(document)   (turn)
3. validate_diagram         (turn)           ├── ok    → { svgUrl, editUrl, warnings }
4. render_diagram           (turn)           └── !ok   → { diagnostics } → one repair turn
   + repair                 (turn)
```

The document is emitted **once**. `validate_diagram` survives as an optional
tool, no longer as a prescribed step.

## Projected latency

Estimates, on the assumptions stated above, for a 12-node diagram.

| Configuration                                  | Turns | Output tokens | Est. time-to-editable   |
| ---------------------------------------------- | ----- | ------------- | ----------------------- |
| As specified today                             | 3–4   | ~1,680        | ~22–30 s                |
| **+ F1, F2** (one tool, preloaded guidelines)  | 1     | ~830          | **~11–15 s**            |
| + F8 (server-side contract repair)             | 1     | ~830          | ~11–15 s, p95 −40%      |
| + F4 (terse dialect)                           | 1     | ~350          | ~5–8 s                  |
| + fast model tier for text and simple sketches | 1     | ~350          | ~3–5 s                  |
| + F5 (streaming preview)                       | 1     | ~350          | first tile **~1–1.5 s** |
| + F6, cache hit on identical content           | 0     | 0             | **~50 ms**              |

## On "almost immediate"

It is worth being exact about what is achievable. While a frontier multimodal
model must emit several hundred tokens, the floor is TTFT plus tokens ÷
throughput. A 12-node sketch cannot be a sub-second round trip in 2026; a
4-node one, on a fast model with a terse dialect, roughly can.

So the goal should be restated as two budgets that can actually be held, and
that neither spec currently defines:

| Budget                                       | Target                  |
| -------------------------------------------- | ----------------------- |
| **Time-to-first-tile** (something on screen) | p50 < 1.5 s             |
| **Time-to-editable** (valid, resolved, open) | p50 < 6 s, p95 < 12 s   |
| Repeat / cached generation                   | < 200 ms                |
| Domain share of either budget                | < 1% (currently 0.001%) |

Both belong in the generation module's tests as asserted budgets, in the same
way the schema's limits are asserted today.

## Revised sequencing

The ordering changes because the cheap wins are not where the specs put them.

| Step | Work                                                                                 | Why here                                       |
| ---- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 0    | Fixture harness and metrics — first-pass validity, TTFT, time-to-editable            | F11: no target is meaningful before a baseline |
| 1    | Server routes over the existing domain, R2, content-hash cache, SVG-only render      | Phase A minus its slowest part                 |
| 2    | MCP with **one** render tool; guidelines and contract as preloaded resources         | F1, F2 — the 2.5–3× for half a day             |
| 3    | Structured diagnostics, strict unknown keys, bounded contract repair                 | F8 — the p95 attack                            |
| 4    | `generateDiagram` seam, fake adapter, sketch path without a brief                    | F3                                             |
| 5    | Proposal state in the editor + `reconcileDiagram` with `replace` only                | interaction spec steps 3–4, trimmed            |
| 6    | Auth, quota, spend ceiling                                                           | F10 — blocks any public exposure               |
| 7    | Repository path: brief, agent instructions, evaluation repositories                  | consumption Phase C                            |
| 8    | Measure. Then, **only if p50 is still over budget**: terse dialect, then streaming   | F4, F5 — earned, not assumed                   |
| —    | Deferred: `preserve_layout`, `merge_by_id`, PNG in the request path, visual families | no evidence yet demands them                   |

## Effort and difficulty

One focused day is a day of real implementation at this repository's standard —
TDD, the existing comment density, docs updated. It is not a calendar day.

| Work item                                                          | Difficulty | Days | Main risk                                            |
| ------------------------------------------------------------------ | ---------- | ---- | ---------------------------------------------------- |
| Fixture harness + latency/validity metrics                         | Medium     | 2    | Fixture sourcing, not code                           |
| `/api/validate`, `/api/render` server routes over the domain       | Low        | 0.5  | —                                                    |
| R2 storage, content-hash ids, `/d/:id` open-in-editor              | Low–Med    | 1    | Object lifecycle, orphan cleanup                     |
| Content-hash idempotent cache + ETags                              | Low        | 0.5  | —                                                    |
| MCP endpoint, streamable HTTP, one render tool                     | Medium     | 1.5  | Transport conformance across clients                 |
| Guidelines + contract as resources; `z.toJSONSchema` from Zod 4    | Low        | 0.75 | Keeping examples asserted against the live validator |
| Structured diagnostics + explicit unknown-key policy               | Low–Med    | 1    | Touching a schema the editor depends on              |
| Bounded server-side contract repair                                | Medium     | 1.5  | Repair taxonomy must never touch architecture        |
| Constrained/structured model output                                | Low        | 0.5  | Provider API differences                             |
| `generateDiagram` seam + fake model adapter                        | Low–Med    | 1    | —                                                    |
| Sketch path, multimodal, single pass                               | Medium     | 1.5  | Image handling, size limits                          |
| Editor proposal state machine                                      | Medium     | 2    | `editor-page.tsx` is already large                   |
| `reconcileDiagram`, `replace` only                                 | Low–Med    | 1    | —                                                    |
| Auth, quota, rate limit, spend ceiling                             | Medium     | 1    | **Unowned in both specs**                            |
| Repository path: brief type, agent instructions, eval repositories | Low code   | 1.5  | Prompt quality, high variance                        |
| Prompt iteration to reach the budgets                              | Low        | 3–5  | Open-ended by nature                                 |
| Server-side PNG: `resvg-wasm` + **bundled fonts**                  | Med–High   | 2    | Fonts are a known unknown                            |
| Terse dialect + lossless normaliser + round-trip tests             | Med–High   | 2    | Second input format; contradicts a stated rule       |
| Streaming partial-document preview                                 | **High**   | 3    | Incremental parse, partial render, cancellation      |
| `preserve_layout`                                                  | Medium     | 2    | Needs stable node identity first                     |
| `merge_by_id` + conflict UI                                        | High       | 3    | Defer until real conflicts exist                     |

**Totals.**

| Scope                                                                         | Focused days |
| ----------------------------------------------------------------------------- | ------------ |
| **Fast path to a usable, fast sketch → editable diagram** (steps 0–6, no PNG) | **13–16**    |
| Everything above plus the repository path                                     | 18–22        |
| Plus terse dialect, streaming and server-side PNG                             | 26–32        |
| Plus deferred reconciliation strategies                                       | +5           |

At three focused days a week the fast path is roughly five weeks; at five, about
three. The full scope is ten and six weeks respectively. Step 2 — the item worth
an estimated 2.5–3× — is **half a day** inside that first block.

**Difficulty summary.** Nothing here is research. Three items carry genuine
technical risk: the streaming preview (incremental parsing of an incomplete
document, and rendering it without flicker), server-side PNG fonts (a known
unknown, already flagged in this repo's own renderer docs), and MCP transport
conformance across clients that each interpret the spec slightly differently.
Everything else is ordinary work over a domain that is already correct — which
is why the domain does not appear in the risk column at all.

## Supersedes

- **Consumption spec, "Required model protocol"** — replaced by the revised
  protocol above (one tool, guidelines preloaded).
- **Consumption spec, MCP surface table** — `validate_diagram` becomes optional
  rather than a prescribed step; `render_diagram` returns diagnostics on
  failure.
- **Consumption spec, Phase B acceptance** — a baseline is measured before a
  threshold is set (F11).
- **Interaction spec, the `evidence → ArchitectureBrief → generation` diagram** —
  the brief becomes specific to the repository source (F3).
- **Interaction spec, step ordering** — the fixture harness moves to step 0 and
  the reconciliation strategies move behind evidence.

Everything else in both documents stands, including every one of their
non-goals.

## Open questions

1. Is the terse dialect acceptable in principle if it is provably an input
   dialect and never persisted? The answer changes the ceiling of what is
   reachable on latency, and it is a judgement call, not a technical one.
2. Which model tier is the default for text and simple sketches? A smaller
   model with constrained output is 2–4× faster, and the fixtures should decide
   this rather than an assumption.
3. Who may call the public MCP, and what is the monthly spend ceiling before it
   refuses? Nothing can be exposed publicly until this has an answer.
