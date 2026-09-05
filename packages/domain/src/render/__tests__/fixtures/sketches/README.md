# Sketch fixtures

One directory per photographed sketch that has been through the copied
`DIAGRAM_SKETCH_PROMPT`. Each holds three files, and none of them is optional.

| File            | What it is                                                               |
| --------------- | ------------------------------------------------------------------------ |
| `sketch.jpg`    | The photograph. Evidence for whoever writes or reviews the expectations. |
| `observed.json` | A document a model actually returned from that photograph, verbatim.     |
| `expected.json` | The reviewed facts about the picture that document must be drawn as.     |

## Never edit `observed.json`

It is a recording, not a specification. If a model misread the sketch, that
misreading stays in the file and is written down under `misreadings` in
`expected.json` — a sentence for a person to read, asserted by nothing.

This is the whole point of the suite. The question it answers is _given what a
model actually returns, does this project draw it the way the sketch reads?_ —
which is a question about `resolveDiagram`, and can be answered in a
millisecond with no API key, no cost and no flake. "Did the model read the
sketch correctly?" is a different question with a different answer every run,
and it does not belong in a test.

## Writing `expected.json`

Read the photograph, not the JSON. Describe the drawing you would accept, using
only these keys:

| Key            | Claim                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `sketch`       | What the photograph shows, for a reader who does not have it open            |
| `readingOrder` | Node ids left to right across the page. This is what catches a mirrored flow |
| `rows`         | Groups of node ids that sit on one row                                       |
| `below`        | Node ids that sit under the main row, in the band                            |
| `inside`       | Node ids whose tile falls inside a boundary's rectangle                      |
| `outside`      | Node ids that must _not_ fall inside it                                      |
| `misreadings`  | What the model got wrong. Prose, for a person. Never asserted                |

Every fixture is also checked for things nobody has to declare: the document
validates, and no two tiles overlap.

If a fact about a sketch cannot be written with those keys, it is either a
statement about the model's reading — which belongs in `misreadings` — or the
vocabulary is missing something, and adding a key is a deliberate change to
what this suite claims to guarantee.
