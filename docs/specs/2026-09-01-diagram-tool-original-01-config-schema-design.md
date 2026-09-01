# 01 — Configuration schema (`DiagramConfig`)

> **Status: shipped in phase 0, kept as historical record** (2026-09-01). The contract now lives in `packages/domain/src/schemas/diagram.ts` and `packages/domain/src/constants/diagram.ts`, following the repo's camelCase schema naming — the PascalCase names below are historical. The overlap check shown in later docs was deliberately not implemented; see the phase 0 spec.

This is the central contract. Claude generates it, the editor modifies it, the renderer
consumes it. Validate it with Zod in `packages/core/src/schema.ts` — the MCP server and the
API reject invalid configs with readable errors (Claude can self-correct
if the error is clear).

## Types

```ts
import { z } from "zod";

export const NodeSchema = z.object({
  id: z.string().min(1),
  x: z.number(),            // center of the tile
  y: z.number(),
  emoji: z.string(),        // tile icon (phase 2: iconKey from our own set)
  name: z.string(),         // "TanStack Start"
  sub: z.string().default(""), // "frontend / ssr" — monospace
  tile: z.enum(["light", "dark"]).default("light"),
});

export const GroupSchema = z.object({
  id: z.string(),
  label: z.string(),        // "CLOUDFLARE"
  icon: z.string().default(""),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  tone: z.enum(["orange", "blue", "green", "neutral"]),
  dashed: z.boolean().default(false),
  filled: z.boolean().default(true), // false = border only (nested groups)
});

export const EdgeSchema = z.object({
  from: z.string(),         // node id
  to: z.string(),
  out: z.enum(["l", "r", "t", "b"]),  // exit side
  inn: z.enum(["l", "r", "t", "b"]),  // entry side
  label: z.string().optional(),
  style: z.enum(["solid", "dashed"]).default("solid"),
});

export const DiagramConfigSchema = z.object({
  version: z.literal(1),
  title: z.string().default("diagram"),
  canvas: z.object({
    w: z.number().min(400).max(2400),
    h: z.number().min(300).max(2400),
  }),
  groups: z.array(GroupSchema).max(12),
  nodes: z.array(NodeSchema).min(1).max(40),
  edges: z.array(EdgeSchema).max(80),
});

export type DiagramConfig = z.infer<typeof DiagramConfigSchema>;
```

## Additional validation rules (refine)

- `edge.from` and `edge.to` must exist in `nodes` (and be distinct).
- Node and group IDs must be unique.
- Nodes must be inside the canvas (with a 60px margin for texts).
- Max ~26 characters in `name` and `sub` (avoids tile overflow).

These checks matter because **Claude is the primary producer** of configs:
an error message like `edge[3].to "d2" does not exist; available nodes: [...]`
lets the model correct itself on a second attempt without human intervention.

## `tone` semantics (groups)

| tone    | border    | background | label     | typical use              |
| ------- | --------- | ---------- | --------- | ------------------------ |
| orange  | `#f6a04d` | `#fdf3e7`  | `#c2410c` | cloud provider / runtime |
| blue    | `#93c5fd` | `#f3f8ff`  | `#1d4ed8` | tooling / monorepo       |
| green   | `#86efac` | `#f0fdf4`  | `#15803d` | external services / data |
| neutral | `#cbd5e1` | `#f8fafc`  | `#475569` | other                    |

The config producer picks **semantics**, never hex values. If tomorrow
you change the palette, you change the renderer and every historical diagram
re-renders consistently.

## `style` semantics (edges)

- `solid` (blue): main data/request flow.
- `dashed` (gray): secondary relationships — auth, deploy, hooks, side-channels.

## Coordinates

- Origin at the top-left. A node's `x,y` = the center of its tile (62×62).
- Implicit 26px grid; recommend positions in multiples of ~13 for alignment.
- Node texts take up ~40px below the tile: leave ≥110px of vertical space between
  rows of nodes, and ≥140px of horizontal space between columns.
- Phase 1: Claude computes positions by hand (works well with the prompt rules
  in doc 05). Phase 2: `layout.ts` takes logical rows/columns and
  computes x/y — see the roadmap.

## Complete minimal example

```json
{
  "version": 1,
  "title": "api-simple",
  "canvas": { "w": 700, "h": 360 },
  "groups": [
    { "id": "cf", "label": "CLOUDFLARE", "icon": "☁️",
      "x": 240, "y": 60, "w": 420, "h": 240, "tone": "orange" }
  ],
  "nodes": [
    { "id": "user", "x": 110, "y": 180, "emoji": "🖥️", "name": "User", "sub": "browser" },
    { "id": "hono", "x": 350, "y": 180, "emoji": "🔥", "name": "Hono", "sub": "http server" },
    { "id": "d1",   "x": 550, "y": 180, "emoji": "🗄️", "name": "D1", "sub": "sqlite", "tile": "dark" }
  ],
  "edges": [
    { "from": "user", "to": "hono", "out": "r", "inn": "l", "label": "HTTPS", "style": "solid" },
    { "from": "hono", "to": "d1",   "out": "r", "inn": "l", "label": "SQL",   "style": "solid" }
  ]
}
```
