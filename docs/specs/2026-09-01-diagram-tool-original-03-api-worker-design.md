# 03 — API Worker (Hono + R2)

> **Status: superseded in topology, kept as historical record** (2026-09-01). There is no separate Hono Worker: the repo chose the fullstack-fn-only pattern, so these endpoints ship as TanStack Start server routes inside `apps/fullstack-fn-only` — see [the next-phases design](./2026-09-01-diagram-tool-next-phases-design.md) and plan 02. The endpoint surface, immutable-id storage model and error philosophy carry forward unchanged.

## Endpoints

```
POST /render          config JSON → renders → stores in R2 → { id, pngUrl, svgUrl, editUrl }
GET  /d/:id.png       serves the PNG from R2 (public, strong caching)
GET  /d/:id.svg       serves the SVG
GET  /d/:id.json      returns the config (to open in the editor)
POST /validate        config JSON → { ok } | { ok: false, errors: [...] }
GET  /mcp             MCP endpoint (see doc 04)
```

`editUrl` points to the web app: `https://your-web/editor?d=:id` — the editor
fetches the `.json` and loads it. That is your "last details" step.

## Base implementation

```ts
import { Hono } from "hono";
import { DiagramConfigSchema } from "@diagram/core/schema";
import { renderSVG } from "@diagram/core/render";
import { svgToPng } from "./resvg";

type Env = { BUCKET: R2Bucket; FONTS: Fetcher /* assets */ };

const app = new Hono<{ Bindings: Env }>();

app.post("/render", async (c) => {
  const body = await c.req.json();
  const parsed = DiagramConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, errors: formatZodErrors(parsed.error) }, 400);
  }
  const config = parsed.data;
  const svg = renderSVG(config);
  const fonts = await loadFonts(c.env);          // cached in a module-level variable
  const png = await svgToPng(svg, fonts, 2);

  const id = `${slug(config.title)}-${crypto.randomUUID().slice(0, 8)}`;
  await Promise.all([
    c.env.BUCKET.put(`${id}.png`, png, { httpMetadata: { contentType: "image/png" } }),
    c.env.BUCKET.put(`${id}.svg`, svg, { httpMetadata: { contentType: "image/svg+xml" } }),
    c.env.BUCKET.put(`${id}.json`, JSON.stringify(config), { httpMetadata: { contentType: "application/json" } }),
  ]);

  const base = new URL(c.req.url).origin;
  return c.json({
    ok: true, id,
    pngUrl: `${base}/d/${id}.png`,
    svgUrl: `${base}/d/${id}.svg`,
    editUrl: `https://YOUR_WEB/editor?d=${id}`,
  });
});

app.get("/d/:file", async (c) => {
  const obj = await c.env.BUCKET.get(c.req.param("file"));
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});
```

Objects are immutable (the id includes a uuid): infinite caching, and "editing" a
diagram produces a new id. Free history.

## Validation errors designed for Claude

`formatZodErrors` returns actionable messages, not raw Zod paths:

```
edges[3].to: "d2" does not exist. Available nodes: user, hono, d1
nodes[5]: name "Cloudflare Durable Objects" exceeds 26 characters, abbreviate
nodes[2] and nodes[4] overlap (distance < 110px vertical)
```

When Claude calls via MCP and receives this, it corrects and retries in the same
turn. That is the difference between a tool that "sometimes works" and one
that converges on its own.

## Security / limits

- The `/render` endpoint is a write endpoint: protect it with a bearer token
  (a variable in the Worker). The MCP server injects it; the web app calls it
  server-side from TanStack Start (never expose the token to the client).
- Simple per-IP rate limit (Workers KV or CF's native rate limiting).
- The schema limits (40 nodes, canvas ≤2400px) already bound CPU and size.
- R2: cost irrelevant at this scale (cents). A 2x PNG weighs ~100-300KB.

## Deploy with Alchemy

Resources: `diagram-api` Worker with the R2 binding `BUCKET`, font assets,
and the `diagram-renders` bucket with a public domain or served via the Worker
(recommended: via the Worker, so you control the headers and don't expose the bucket).
