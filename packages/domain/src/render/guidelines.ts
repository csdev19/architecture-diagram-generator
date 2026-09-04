import {
  BOUNDARY_PADDINGS,
  BOUNDARY_TONES,
  CANVAS_TONES,
  DIAGRAM_LIMITS,
} from "../constants/diagram";
import { DIAGRAM_ICON_ALIASES, DIAGRAM_ICON_KEYS } from "../constants/diagram-icons";

/**
 * The alias map as one line per key, for a model that has a label and needs a
 * key. Derived, so an alias added to the registry advertises itself.
 */
const ALIAS_LINES = Object.entries(DIAGRAM_ICON_ALIASES)
  .map(([key, written]) => `  - ${(written ?? []).join(", ")} → \`${key}\``)
  .join("\n");

/**
 * The authoring guide for a `DiagramDocument` — the text that turns "draw me
 * the architecture of X" into a diagram.
 *
 * This is the single source. Phase 1's MCP `get_diagram_guidelines` tool
 * returns it verbatim, and it doubles as the system prompt if documents are
 * ever generated through the Anthropic API. When a model makes the same mistake
 * twice, add the rule here rather than correcting it by hand each time.
 *
 * It is a TypeScript string rather than a `.md` asset because a Cloudflare
 * Worker has to return it: importing markdown needs bundler-specific raw-text
 * loaders, while a string needs nothing.
 *
 * Every limit is interpolated from the constants the schema enforces, so the
 * guidance cannot drift from what validation actually accepts.
 */
export const DIAGRAM_GUIDELINES = `# Diagram Document v2 — authoring guidelines

You are generating a \`DiagramDocument\` for an architecture diagram.
Return ONLY the JSON object — no markdown fence, no commentary.

## The shape

\`\`\`json
{ "version": 2, "content": { "title": …, "nodes": [], "boundaries": [], "groups": [], "edges": [] } }
\`\`\`

\`content\` is what the architecture **is**. A second part, \`layout\`, holds
where everything sits — and you do not write it.

## You do not place anything

Do NOT emit a \`layout\`, and do NOT put \`x\`, \`y\`, \`w\` or \`h\` on anything.
Positions, boundary rectangles and edge anchors are computed from what you
describe. A layout you invent will be worse than the one derived from your own
edges, and a node carrying coordinates is rejected outright.

Say what belongs together with a **group**. Draw a **boundary** only when that
group is a real named perimeter — a cloud provider, a runtime, a monorepo. A
group with no boundary is perfectly normal: it keeps those tiles together
without drawing a box around them.

## Process

1. List the components of the system described. Each becomes a node.
2. Trace the main request/data path. Those are \`solid\` edges, labelled with the
   protocol — "HTTPS", "SQL", "query", "WebSocket". They are also what decides
   the left-to-right reading order, so get them right before anything else.
3. Everything else — auth, deploy, hooks, queues, side channels — is a
   \`dashed\` edge, and lands in a band below the flow.
4. Group what genuinely belongs together, and give the group a boundary if the
   perimeter has a name worth printing.

## Nodes

- \`id\`: short, lowercase, stable. Edges and groups refer to it.
- \`name\`: the technology's proper name, at most ${DIAGRAM_LIMITS.TEXT_MAX}
  characters — "Drizzle ORM", not "Drizzle ORM with Postgres".
- \`sub\`: its role, lowercase, at most ${DIAGRAM_LIMITS.TEXT_MAX} characters —
  "orm / migrations".
- \`tile: "dark"\` for only 2-3 key nodes; everything else stays light.

Every node shows one mark, and needs an \`iconKey\`, \`initials\` or an \`emoji\`. A
node with none of the three is rejected; when a node carries more than one, the
icon is drawn, then the initials.

- \`iconKey\`: the technology's real logo, drawn in its brand colour. Prefer it
  whenever the technology has a key below — a logo is recognised faster than any
  glyph, and it is what makes a diagram look deliberate. Do not invent a key:
  anything outside this list is rejected. The available keys are exactly:
  ${DIAGRAM_ICON_KEYS.join(", ")}.

  Several keys are not what a person writes on a box. When a label reads like
  the left side, the key is the one on the right:

${ALIAS_LINES}
- \`initials\`: at most ${DIAGRAM_LIMITS.INITIALS_MAX} characters, for a named
  product with no logo in the list above — "ST" for Stripe, "K8" for Kubernetes.
  Drawn exactly as written, so type the capitals you want to see. Prefer it over
  an emoji whenever the thing has a name a reader would recognise.
- \`emoji\`: one evocative, distinct glyph, for a role rather than a product —
  human actors, generic clients, queues, concepts. Client, server, database,
  auth, packages, runtime, cloud and tooling all read better with different
  glyphs.

## Boundaries and groups

A **boundary** is a drawn box: \`{ "id", "label", "tone", "padding" }\`, and
optionally an \`icon\`. A **group** is the relation: \`{ "id", "members" }\`, where
members are node ids, a boundary id, and other group ids.

- A group holds **at most one boundary**, and that boundary frames the group's
  other members. A nested group may carry its own.
- A group holds **at least one node**, directly or through a group inside it.
- An element belongs to **at most one group**. Nest groups instead of overlapping
  them.
- \`tone\` is semantic, never a colour: \`${BOUNDARY_TONES.ORANGE}\` for the primary
  cloud or runtime, \`${BOUNDARY_TONES.BLUE}\` for tooling and the monorepo,
  \`${BOUNDARY_TONES.GREEN}\` for external services and data,
  \`${BOUNDARY_TONES.NEUTRAL}\` for anything else. The renderer owns the palette —
  pick meaning and let it choose the hex.
- \`padding\` is how tightly the box hugs what it holds:
  \`${Object.values(BOUNDARY_PADDINGS).join("`, `")}\`. Leave it out for
  \`${BOUNDARY_PADDINGS.NORMAL}\`. A nested boundary reads better with
  \`filled: false\` and \`dashed: true\`.

## Edges

\`{ "from", "to", "label", "style" }\`, where \`from\` and \`to\` are node ids — an
edge connects tiles, never boundaries or groups.

- \`id\` is optional: it is derived from the two endpoints. Write one only when
  two edges connect the same pair and you want to tell them apart.
- Labels are short and technical. Protocol names stay as they are; other words
  follow the language the user is writing in.
- Do not write \`out\` or \`inn\`. Which side a line leaves is composition, and it
  is computed from where the tiles end up.

## The diagram itself

- \`title\`: a short slug for the file it becomes.
- \`background\` is the paper tone, and it is optional — leave it out unless the
  user asked for one. The choices are \`${Object.values(CANVAS_TONES).join("`, `")}\`,
  all of them near-white. \`${CANVAS_TONES.CREAM}\` reads as a legal pad and
  \`${CANVAS_TONES.BLUE}\` as blueprint paper; the rest are neutral.
- There is no canvas to fit inside. The exported document is sized from what the
  diagram contains, so nothing is ever "off the page".

## What validation enforces

- \`version\` must be 2, and \`content\` must be present.
- At most ${DIAGRAM_LIMITS.MAX_BOUNDARIES} boundaries, ${DIAGRAM_LIMITS.MAX_GROUPS} groups, ${DIAGRAM_LIMITS.MIN_NODES}-${DIAGRAM_LIMITS.MAX_NODES} nodes, at most ${DIAGRAM_LIMITS.MAX_EDGES} edges.
- Node, boundary and group ids share one namespace and must all be unique.
- Every \`edge.from\` and \`edge.to\` names a node that exists, and an edge cannot
  connect a node to itself.
- Every group member exists, belongs to no other group, and the nesting has no
  cycle.
- Every node carries an \`iconKey\` from the list above, \`initials\`, or an \`emoji\`.

## Check before answering

- Is there any \`x\`, \`y\`, \`w\`, \`h\`, \`out\`, \`inn\` or \`layout\` in your answer?
  Delete it.
- Does every \`edge.from\` and \`edge.to\` name a node that exists?
- Does every node have an \`iconKey\`, \`initials\` or an \`emoji\`, and is every
  \`iconKey\` one of the keys listed above?
- Does every group hold at least one node and at most one boundary?
- Is any \`name\` or \`sub\` longer than ${DIAGRAM_LIMITS.TEXT_MAX} characters? Abbreviate it.
- Does the solid path read left to right through the whole system? That path is
  the diagram's spine, and everything else is placed relative to it.
`;

/**
 * The prompt a person copies out of the editor and pastes into a chat together
 * with a picture of a whiteboard, a drawing on paper or a screenshot.
 *
 * It is `DIAGRAM_GUIDELINES` with a preamble, not a second document. The
 * contract has exactly one text; what changes when the input is a picture is
 * how to *read* it, and that is all the preamble says. Composing rather than
 * copying is what makes it impossible for the pasted prompt to describe a
 * format the validator no longer accepts.
 *
 * Every rule below exists because of a specific way a sketch goes wrong:
 * a model that read "ANGULAR" as "AN BUILDR" and reached for a monogram while
 * \`angular\` sat in the key list further down the same prompt; one that read an
 * arrowhead backwards and put the client at the far right of its own diagram;
 * one that copied a sketch's block capitals into a shouting label; and one that
 * was pulled towards a worked example the prompt itself had planted.
 */
export const DIAGRAM_SKETCH_PROMPT = `# Turn this sketch into a diagram

You are reading an attached image — a hand drawing, a photograph of a whiteboard,
a drawing on paper, or a screenshot of a diagram. An image is the only input:
whatever you cannot see in it, you do not have. Turn it into the JSON document
described below, and return ONLY that JSON.

## What a sketch box is

A box usually carries two readings of the same thing: a mark drawn inside it —
one letter, a rough logo — and a name written beneath or beside it. They
corroborate each other. A box with "P" in it and "POSTGRES" underneath is
Postgres twice over, and if the two disagree you have misread one of them.

## Handwriting is unreliable. The key list is not.

Ballpoint on paper, photographed at an angle, is genuinely hard to read, and the
most expensive mistake available to you is deciding that a familiar technology
is an unknown product with a strange name.

So before a label becomes \`initials\`, hold it against the key list further down
and ask whether it is a near match. "AN GULAR", "ANGULR" and "ANSULAR" are all
\`angular\`. "NOSTJS" and "NEST JS" are \`nestjs\`. "P0STGRES" is \`postgresql\`.
That list is short and everything on it is common; a near match to it is far
likelier than a product nobody has heard of.

Only when a label matches nothing on the list does it become \`initials\`.

## Names

Write each name the way its own product writes it — Postgres, NestJS, Angular —
not in the block capitals the sketch is drawn in. Handwriting is capitals
because capitals are easier to draw, not because the product shouts.

For anything that is not a known product, the author's words are the name: their
service is called what they called it. Only the letter-casing is yours to fix.

## Roles

Give every node a \`sub\`: its role, in one or two lowercase words — "client",
"api service", "database". For a technology you matched to the key list this is
not a guess, it is what the thing is. Leave \`sub\` out only when neither the
picture nor the technology says what the component is for.

## Do not invent

No cloud provider, protocol, runtime, load balancer, cache, queue,
authentication step or database that is not drawn or written down. A smaller
diagram that matches the picture beats a fuller one that does not. A label you
genuinely cannot read is reported at the end, after the JSON, not guessed.

## Arrows

- An arrowhead is the direction: it points from \`from\` to \`to\`.
- A line with no arrowhead is a relationship whose direction you must choose.
  Pick the one the request travels in — a client calls a server, a service reads
  a database — and list it as an assumption after the JSON.
- Arrowheads on a photograph are small and easily lost. Once every edge is
  placed, read the solid path end to end: it should run from whoever makes the
  request to whatever finally answers or stores it. **If it runs backwards — a
  database calling a client, a service calling its own front end — you misread a
  head.** Turn it round and say so in your assumptions.
- Text written on or beside a line is that edge's \`label\`. An unlabelled line
  gets no label; do not put "HTTPS" on it because it looked likely.
- A line drawn to the side of the main flow, or dashed in the picture, is a
  \`dashed\` edge.

## Boxes drawn around things

A rectangle enclosing several components is a \`group\`. If that rectangle has a
title written on it — "AWS", "Kubernetes", "monorepo" — the group also gets a
\`boundary\` with that title as its label. An untitled enclosure is a group with
no boundary. Anything drawn outside the rectangle stays outside it.

## Choosing a mark for each box

For every component, in this order:

1. Its label names a technology in the key list, exactly or nearly — use that
   \`iconKey\`. Check this before anything else, for every single box.
2. It names a specific product or service that is not on the list — use
   \`initials\`: one or two characters from that name.
3. It names a role rather than a product — a user, a phone, a queue, a browser —
   use an \`emoji\`.

Never leave a node without one of the three, and never invent an \`iconKey\`.

## Before you answer

- Does any node carry \`initials\` while its label resembles something on the key
  list? Look again. This is the single most common way this goes wrong.
- Is any \`name\` in block capitals? Write it the way the product does.
- Does every node have a \`sub\`?
- Does the solid path run from the client through the services to the data
  store? If not, re-read the arrowheads.
- Is anything in your answer not in the picture? Remove it.

## After the JSON

Return the JSON first, alone. Then, in a few short lines, list anything you
assumed: a direction you chose for an arrow with no head, a label you could not
read, a box whose product you could not identify.

---

${DIAGRAM_GUIDELINES}`;
