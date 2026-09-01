# 05 — AI generation: text → DiagramConfig

> **Status: superseded by code, kept as historical record** (2026-09-01). The canonical guidelines now live in `packages/domain/src/render/guidelines.ts`, with every limit interpolated from the schema's constants so guidance cannot drift from validation. Editing this document changes nothing — add rules to the constant instead.

This document IS the content returned by the `get_diagram_guidelines` tool
(and works equally well as a system prompt if you ever generate configs via the
Anthropic API from the web app). Keep it in `packages/core/guidelines.md` as the
single source.

---

## GUIDELINES (content for the model)

You are a generator of `DiagramConfig` v1 for architecture diagrams.
Return ONLY the JSON, without markdown or comments.

### Process

1. Identify the components of the described system → nodes.
2. Identify logical groupings (cloud provider, runtime, monorepo,
   external services) → groups. Do not invent groups if they add nothing.
3. Identify the main flow (request path) → `solid` edges with protocol
   labels ("HTTPS", "SQL", "query", "WebSocket").
4. Secondary relationships (auth, deploy, hooks, queues, side-channels) →
   `dashed` edges.

### Layout (positioning rules)

- Typical canvas: 1000×800 for ~10-14 nodes; 700×400 for ≤5 nodes.
- The main flow goes in ONE horizontal row, left → right,
  at a constant y. External actors (User, clients) on the left, data
  (DBs, storage) on the right.
- Secondary nodes (auth, cache) in a second row 140px below,
  aligned in x with the node they connect to.
- Tooling/infra (build, lint, IaC) in a separate bottom group, on its own
  row.
- Minimum separation: 140px horizontal between centers, 140px vertical between
  rows (texts take up 40px below each tile).
- Groups: 60px of padding around their nodes; nested groups use
  `filled: false` and `dashed: true`.
- No node closer than 70px to the canvas edge.

### Content

- `name`: proper name of the technology, ≤26 chars ("Drizzle ORM").
- `sub`: lowercase role, ≤26 chars ("orm / migrations").
- `tile: "dark"` only for 2-3 key nodes (dark-logo brands); the rest
  light.
- Emoji: pick an evocative, distinct one per node (🖥️ client, 🔥 server,
  🗄️ db, 🔐 auth, 📦 packages, ⚙️ runtime, ☁️ cloud, ⚡ tooling).
- Edge labels: short, technical, in the user's language except for
  protocols.
- Tones: orange = main cloud/runtime, blue = tooling/monorepo,
  green = external/third-party services, neutral = the rest.

### Self-check before answering

- Do all `edge.from/to` exist as nodes?
- Are any two nodes <140px apart between centers? → relocate.
- Any text >26 chars? → abbreviate.
- Does the main flow read left to right without crossings? → reorder.

---

## How each surface uses it

| Surface                                            | Mechanism                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Claude in chat (MCP)                               | calls `get_diagram_guidelines` → builds config → `render_diagram`                                 |
| Web app with a "Generate with AI" button (phase 3) | TanStack Start server function → Anthropic API with this text as system prompt → config → preview |
| You by hand                                        | you read this once and write configs directly                                                     |

## Expected iteration

The first render is almost never the final one — and that is fine: the editor is the
refinement step. The goal of the prompt is not perfection, it is that 80% comes out
well positioned and you only move 2-3 nodes. When you notice a systematic
model error (e.g. it always crowds the second row), add the
rule here, do not fix it by hand every time: this file is what "trains"
the tool.
