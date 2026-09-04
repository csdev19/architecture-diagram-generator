# Sketch generation follow-up

> **Date:** 2026-09-03  
> **Status:** prompt-only safeguard implemented; defer product work to the next AI review

## Trigger

A photographed sketch intended to represent `Angular → NestJS → Postgres`,
with NestJS and Postgres inside AWS, produced a schema-valid document named
`AN BUILDR → NOTES → POSTGRES`. The Postgres logo rendered, but Angular and
NestJS fell back to monograms and the relationships did not represent the
sketch.

A second run, with the same prompt, returned no document at all: the model
rendered a picture and described it in prose. The prompt opened with
`# Turn this sketch into a diagram` — an instruction to produce a diagram,
placed in the strongest position a prompt has — and nothing in the heading said
the output was text.

## Scope of this change

1. A visible arrowhead is now stronger evidence than a conventional request
   path. The sketch prompt permits inference only for a line whose head is not
   visible; it never reverses a visible head merely because the resulting flow
   is unusual.
2. The copied prompt now has one output contract: a single JSON object. It no
   longer asks the model to append assumptions to JSON that is pasted directly
   into the editor. Two rules said otherwise before — the preamble collected
   assumptions after the JSON while the appended guide, read last, allowed no
   commentary — so a model obeyed one or the other and the round trip broke
   either way.
3. The prompt names its output in the title and forbids the alternative
   outright: it opens `# Read this sketch and return JSON`, and states that a
   reply containing an image or any prose is a failed reply.
4. Where the sketch preamble and the generic guide disagree, the picture wins,
   and the prompt now says so after the generic advice rather than leaving the
   precedence to chance.

## Explicitly deferred

The editor currently copies a prompt into a third-party chat; it does not call
a model, retain the image, or receive visual evidence separately from the final
JSON. Do not add semantic generation rules to the persisted-document parser for
this phase: doing so would make historical diagrams and intentional monograms
invalid without improving the external ChatGPT round trip.

At the next AI review, consider a model-backed flow with two operations:

```text
image → extracted sketch evidence → catalogue normalisation → validate → render
```

The evidence operation would record boxes, nearby text, internal mark,
arrowheads and enclosing rectangles. Normalisation would map only supported
evidence into a `DiagramDocument`; validation and rendering stay where they are
today.

## Regression fixture for that future flow

Keep the source image private and assert these reviewed facts, rather than just
that the returned JSON parses:

| Fact                        | Expected value                                           |
| --------------------------- | -------------------------------------------------------- |
| nodes                       | Angular, NestJS, Postgres                                |
| icons                       | `angular`, `nestjs`, `postgresql`                        |
| AWS membership              | NestJS and Postgres inside the AWS boundary              |
| edges                       | the visible arrowheads, without reversal by plausibility |
| unsupported invention count | 0                                                        |

Record schema-valid first-pass rate, semantic precision, repair count and
unsupported-invention count for every fixture. Prompt-string tests prevent
contract regressions; this fixture evaluates the model-facing outcome.
