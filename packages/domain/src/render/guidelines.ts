import { CANVAS_TONES, DIAGRAM_GEOMETRY, DIAGRAM_LIMITS, GROUP_TONES } from "../constants/diagram";
import { FRAME_PADDING } from "./frame";
import { DIAGRAM_ICON_KEYS } from "../constants/diagram-icons";

/**
 * The authoring guide for a `DiagramConfig` — the text that turns "draw me the
 * architecture of X" into a well-positioned config.
 *
 * This is the single source. Phase 1's MCP `get_diagram_guidelines` tool
 * returns it verbatim, and it doubles as the system prompt if configs are ever
 * generated through the Anthropic API. When a model makes the same mistake
 * twice, add the rule here rather than correcting it by hand each time.
 *
 * It is a TypeScript string rather than a `.md` asset because a Cloudflare
 * Worker has to return it: importing markdown needs bundler-specific raw-text
 * loaders, while a string needs nothing.
 *
 * Every limit is interpolated from the constants the schema enforces, so the
 * guidance cannot drift from what validation actually accepts.
 */
export const DIAGRAM_GUIDELINES = `# DiagramConfig v1 — authoring guidelines

You are generating a \`DiagramConfig\` for an architecture diagram.
Return ONLY the JSON object — no markdown fence, no commentary.

## Process

1. List the components of the system described. Each becomes a node.
2. Group what genuinely shares a boundary: a cloud provider, a runtime, a
   monorepo, third-party services. Do not invent a group that adds nothing.
3. Trace the main request/data path. Those are \`solid\` edges, labelled with the
   protocol — "HTTPS", "SQL", "query", "WebSocket".
4. Everything else — auth, deploy, hooks, queues, side channels — is a
   \`dashed\` edge.

## Coordinates

\`x\` and \`y\` are the **centre** of a node's tile, not its corner. A tile is
${DIAGRAM_GEOMETRY.TILE_SIZE}x${DIAGRAM_GEOMETRY.TILE_SIZE}px, and its name and
sublabel occupy roughly ${DIAGRAM_GEOMETRY.NODE_TEXT_BLOCK}px underneath it.
Forgetting that text block is the most common cause of a cramped diagram.

## The canvas has no edges

Do NOT emit a \`canvas\`. There is no fixed sheet to fit the diagram into: the
exported document is sized from what you draw, plus ${FRAME_PADDING}px of
whitespace on every side. Coordinates are unbounded and may be negative, and no
position is ever "off the canvas".

This means layout is about the *relationships between* nodes — spacing, rows,
reading order — and never about staying inside a rectangle. Place the first node
wherever you like and build outward from it.

(\`canvas: { w, h }\` still exists for the rare diagram that must be an exact
size, such as a slide. Setting it re-imposes a fixed frame, and anything outside
that frame is then cropped. Leave it out unless the user asked for a size.)

## Layout

- The main flow occupies ONE horizontal row, left to right, at a constant \`y\`.
  External actors (users, clients) sit on the left; data stores (databases,
  buckets) on the right.
- Secondary nodes — auth, cache — go in a second row 140px below, aligned on \`x\`
  with whatever they attach to.
- Tooling and infrastructure (build, lint, IaC) belong in their own group, in a
  lower band of their own.
- Keep at least 140px between node centres, horizontally and vertically.
- Give a group about 60px of padding around the nodes it contains. A nested
  group uses \`filled: false\` and \`dashed: true\`.

## Content

- \`name\`: the technology's proper name, at most ${DIAGRAM_LIMITS.TEXT_MAX}
  characters — "Drizzle ORM", not "Drizzle ORM with Postgres".
- \`sub\`: its role, lowercase, at most ${DIAGRAM_LIMITS.TEXT_MAX} characters —
  "orm / migrations".
- \`tile: "dark"\` for only 2-3 key nodes; everything else stays light.
- \`background\` is the paper tone, and it is optional — leave it out unless the
  user asked for one. The choices are \`${Object.values(CANVAS_TONES).join("`, `")}\`,
  all of them near-white. \`${CANVAS_TONES.CREAM}\` reads as a legal pad and
  \`${CANVAS_TONES.BLUE}\` as blueprint paper; the rest are neutral.
- Edge labels: short and technical. Protocol names stay as they are; other words
  follow the language the user is writing in.
- Group \`tone\` is semantic, never a colour: \`${GROUP_TONES.ORANGE}\` for the
  primary cloud or runtime, \`${GROUP_TONES.BLUE}\` for tooling and the monorepo,
  \`${GROUP_TONES.GREEN}\` for external services and data, \`${GROUP_TONES.NEUTRAL}\`
  for anything else. The renderer owns the palette — pick meaning and let it
  choose the hex.

## The mark inside a tile

Every node shows one mark, and needs either an \`iconKey\` or an \`emoji\`. A node
with neither is rejected; a node carrying both draws the icon.

- \`iconKey\`: the technology's real logo, drawn in its brand colour. Prefer it
  whenever the technology has a key below — a logo is recognised faster than any
  glyph, and it is what makes a diagram look deliberate. Do not invent a key:
  anything outside this list is rejected. The available keys are exactly:
  ${DIAGRAM_ICON_KEYS.join(", ")}.
- \`emoji\`: one evocative, distinct glyph, for everything with no key above —
  human actors, generic clients, queues, concepts. Client, server, database,
  auth, packages, runtime, cloud and tooling all read better with different
  glyphs.

## Edge anchors

\`out\` is the side the line leaves, \`inn\` the side it arrives at, each one of
\`l\`, \`r\`, \`t\`, \`b\`. A left-to-right flow is \`out: "r"\`, \`inn: "l"\`. Prefer
horizontal anchors: a \`b\` anchor has to drop past the node's text, so it draws a
noticeably longer line.

## What validation enforces

- \`version\` must be 1.
- Coordinates are unbounded. Nothing is rejected for being too far out.
- At most ${DIAGRAM_LIMITS.MAX_GROUPS} groups, ${DIAGRAM_LIMITS.MIN_NODES}-${DIAGRAM_LIMITS.MAX_NODES} nodes, at most ${DIAGRAM_LIMITS.MAX_EDGES} edges.
- Node ids and group ids must each be unique.
- Every \`edge.from\` and \`edge.to\` must name a node that exists, and an edge
  cannot connect a node to itself.
- Every node carries an \`iconKey\` from the list above or an \`emoji\`.

## Check before answering

- Does every \`edge.from\` and \`edge.to\` name a node that exists?
- Does every node have an \`iconKey\` or an \`emoji\`, and is every \`iconKey\` one
  of the keys listed above?
- Are any two node centres closer than 140px? Move them apart.
- Is any \`name\` or \`sub\` longer than ${DIAGRAM_LIMITS.TEXT_MAX} characters? Abbreviate it.
- Does the main flow read left to right without lines crossing? Reorder it.
`;
