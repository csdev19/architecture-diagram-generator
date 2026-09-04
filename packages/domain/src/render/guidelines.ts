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
  .map(([key, written]) => `  - ${written.join(", ")} → \`${key}\``)
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

1. List the components of the system described. Each becomes a node, written
   down in the order the finished diagram reads — left to right along the main
   path. You are not placing anything by doing this; where the edges leave two
   tiles able to sit either way round, that order is what settles it.
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
- \`tile: "dark"\` is emphasis, and emphasis only works while it is rare:
  **usually none at all**, never more than two or three in a large diagram, and
  never a fixed count. Two dark tiles out of three have emphasised nothing.

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
export const DIAGRAM_SKETCH_PROMPT = `# Read this sketch and return JSON

Your entire reply is one JSON document, described below. Nothing else.

**Do not draw, render or generate an image.** You are not making a picture:
another program draws it from the JSON you return. A reply containing an image,
a rendered diagram or any prose is a failed reply, however good the picture is.

You are reading an attached image — a hand drawing, a photograph of a
whiteboard, a drawing on paper, or a screenshot of a diagram. That image is the
only input: whatever you cannot see in it, you do not have.

## What a sketch box is

A box usually carries two readings of the same thing: a mark drawn inside it —
one letter, a rough logo — and a name written beneath or beside it. They
corroborate each other. A box with "P" in it and "POSTGRES" underneath is
Postgres twice over, and if the two disagree you have misread one of them.

## Handwriting is unreliable. The key list is not.

Ballpoint on paper, photographed at an angle, is genuinely hard to read, and the
most expensive mistake available to you is deciding that a familiar technology
is an unknown product with a strange name.

So for every single box, before its label becomes \`initials\`, hold that label
against the key list further down and ask whether it is a near match. "AN
GULAR", "ANGULR" and "ANSULAR" are all \`angular\`. "NOSTJS" and "NEST JS" are
\`nestjs\`. "P0STGRES" is \`postgresql\`. That list is short and everything on it
is common; a near match to it is far likelier than a product nobody has heard
of.

A label becomes \`initials\` only when it matches nothing on that list, and an
\`emoji\` only when it names a role rather than a product — a user, a phone, a
queue, a browser.

## List things in the order they are drawn

Write the nodes into the array in the order they read on the page: left to
right, then top to bottom where the page has more than one row. List a group's
members the same way, and the groups themselves in the order their boxes appear.

You are still not placing anything — there are no coordinates anywhere in your
answer. But a photograph carries an order that arrows alone cannot express. A
sketch is usually drawn client-first and wired with the arrows pointing back the
way the data returns, so the arrows say one thing about direction and the page
says another about reading order. The arrows are yours to read; the order they
are listed in is what tells the drawing program which of the two it is looking
at.

## Names and roles

Write each name the way its own product writes it — Postgres, NestJS, Angular —
not in the block capitals the sketch is drawn in. Handwriting is capitals
because capitals are easier to draw, not because the product shouts. For
anything that is not a known product, the author's words are the name: their
service is called what they called it, and only the letter-casing is yours.

Give every node a \`sub\` as well: its role, in one or two lowercase words —
"client", "api service", "database". For a technology you matched to the key
list this is not a guess, it is what the thing is.

## Do not invent

No cloud provider, protocol, runtime, load balancer, cache, queue,
authentication step or database that is not drawn or written down. A smaller
diagram that matches the picture beats a fuller one that does not.

A label you cannot read is not a guess, but it is not nothing either. Use what
you can see: the mark drawn inside the box becomes \`initials\`, and your best
transcription of the word underneath becomes the \`name\`. A tile showing the
letter someone actually drew is one a reader can recognise and correct. Only a
box where neither is legible is named \`?\`.

## Arrows

- An arrowhead is the direction: it points from \`from\` to \`to\`.
- A line with no arrowhead is a relationship whose direction you choose. Pick
  the one the request travels in — a client calls a server, a service reads a
  database.
- Arrowheads on a photograph are small and easily lost, so read each one twice.
  But **never reverse a visible arrowhead because a usual architecture would
  flow the other way.** A sketch showing a store pushing to a client is telling
  you that is what it does. Only a line with no visible head may be inferred.
- A double-headed arrow is one edge, not two. Two edges between the same pair,
  one each way, draw two lines on top of each other. Write a single edge, in the
  direction the request travels — a client calls a server however the reply
  comes back.
- Text written on or beside a line is that edge's \`label\`. An unlabelled line
  gets no label; do not put "HTTPS" on it because it looked likely.
- A line drawn to the side of the main flow, or dashed in the picture, is a
  \`dashed\` edge.

## Boxes drawn around things

A rectangle enclosing several components is a \`group\`. If that rectangle has a
title written on it — "AWS", "Kubernetes", "monorepo" — the group also gets a
\`boundary\` carrying that title as its \`label\` and a \`tone\`, which is required
and is chosen by meaning from the list further down. An untitled enclosure is a
group with no boundary. Anything drawn outside the rectangle stays outside it.
A rectangle drawn with a broken or dotted line is \`dashed: true\` on its
boundary; a solid one needs nothing said.

---

${DIAGRAM_GUIDELINES}

---

## Reading a picture overrides the general advice above

What you can see in the image is the strongest evidence there is. The guide
above describes how architectures usually read — a request path running left to
right, a protocol on a labelled line — and that advice applies only where the
picture is silent. It never overrules a mark you can actually see.

## Last checks, for a diagram read from a picture

- Is your reply anything other than one JSON document? Delete the rest.
- Does every visible arrowhead agree with its edge's \`from\` and \`to\`? Never
  change an observed direction to make the architecture look conventional.
- Does any node carry \`initials\` while its label resembles something on the key
  list? Look again. This is the single most common way this goes wrong.
- Is any \`name\` in block capitals? Write it the way the product does.
- Do the nodes appear in the array in the order they read across the page?
- Is any pair of nodes joined by two edges, one each way? Make it one.
- Does every node have a \`sub\`, and every boundary a \`tone\`?
- Is anything in your answer not in the picture? Remove it.
`;
