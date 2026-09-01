# 04 — MCP server: opening the tool up to Claude

> **Status: superseded in topology, kept as historical record** (2026-09-01). The MCP endpoint lives on the app's own Worker, and the transport choice is an investigation task in plan 02 of [the next-phases design](./2026-09-01-diagram-tool-next-phases-design.md). The three-tool surface and the render-only scope guard carry forward unchanged.

This is the doc that answers your central question: **yes, you can leave the
tool "open" so Claude can use it directly from claude.ai.**
The mechanism is MCP (Model Context Protocol) over HTTP: you expose tools, connect
them as a custom connector in claude.ai, and in any chat you ask me for a
diagram — I generate the config, call your Worker, and hand you the link to the PNG
rendered on YOUR infra. You open the editUrl for the last details.

## Full flow

```
You (chat): "Diagram of Tapuy's architecture"
   │
Claude: drafts a DiagramConfig following the schema
   │
   ├─► tool validate_diagram(config)   → actionable errors → Claude corrects
   │
   └─► tool render_diagram(config)     → Worker: SVG → PNG → R2
                                        → { pngUrl, editUrl }
   │
Claude (chat): shows pngUrl + editUrl
   │
You: open editUrl, move 2 nodes, re-export. Done.
```

## Implementation on the same Hono Worker

Use the official MCP SDK for TypeScript with streamable HTTP transport,
mounted at `/mcp` on the same API Worker (less infra than a separate
Worker).

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// + HTTP transport adapter for Hono/Workers

const mcp = new McpServer({ name: "diagram-tool", version: "1.0.0" });

mcp.tool(
  "validate_diagram",
  "Validates a DiagramConfig without rendering. Returns actionable errors.",
  { config: DiagramConfigSchema },
  async ({ config }) => {
    // reuse the /validate logic
  }
);

mcp.tool(
  "render_diagram",
  `Renders an architecture diagram and returns the PNG and editor URLs.
   The config must follow the DiagramConfig v1 schema (groups, nodes with x/y
   at the tile center, edges with sides l/r/t/b). Aesthetics guaranteed by the server.`,
  { config: DiagramConfigSchema },
  async ({ config }) => {
    // reuse the /render logic
    return { content: [{ type: "text", text: JSON.stringify({ pngUrl, editUrl }) }] };
  }
);

mcp.tool(
  "get_diagram_guidelines",
  "Returns the schema and the layout rules for building a correct DiagramConfig.",
  {},
  async () => ({ content: [{ type: "text", text: GUIDELINES_MD }] })
);
```

### Why the `get_diagram_guidelines` tool

Tool descriptions have limited space and the model does not always
have the schema fresh in mind. With this tool, the natural flow is: Claude calls it
first, receives the schema + positioning rules (the content of doc
05), and only then builds the config. Self-contained: any Claude
session, with no prior context, can use the tool well.

### Defining tool schemas with Zod

The MCP SDK accepts Zod directly for the input schema — you reuse
`DiagramConfigSchema` from `packages/core` without duplicating anything. A single contract
across the whole system.

## Connecting in claude.ai

1. Deploy the Worker → `https://diagram-api.YOUR_DOMAIN/mcp`.
2. In claude.ai: Settings → Connectors → Add custom connector → paste the URL.
3. Auth: for personal use a static token in a header is enough (configurable in
   the connector). If you later open it up to more people, the standard is OAuth 2.1 —
   claude.ai custom connectors support it; verify the current requirements
   in Anthropic's docs at implementation time, because this
   point has been evolving.
4. From then on, in any chat: "use diagram-tool and make me the diagram
   of X" — or you simply ask for a diagram and Claude will see the tool available.

## Alternative without MCP (day 1, zero friction)

While you set up the MCP, you can already use the semi-manual flow: you ask me for the
diagram in the chat, I give you the config JSON, you paste it in
`your-web/editor` ("import JSON" textarea) and export. It is the same contract;
the MCP only removes the copy-paste. This lets you validate the schema and the
renderer with real usage before investing in the MCP.

## Scope note

The MCP server is about _rendering_, not _knowledge_: do not add tools that
return info about your projects. Claude already has the context of the
conversation (and its memory) to know which architecture to draw; the
tool only needs to receive the final config. Keeping it that way makes it
generic — you could publish it as a product for other devs without touching anything.
