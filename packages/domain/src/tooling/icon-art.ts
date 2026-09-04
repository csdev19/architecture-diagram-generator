/**
 * Turns any SVG document into the `art` half of a registry entry.
 *
 * Tooling, not runtime: this is what `bun run icon:add` calls, and it ships in
 * no bundle. It lives under `src` so it is type-checked and tested like the
 * code it feeds, and it uses nothing but strings so it could run anywhere.
 *
 * Three things happen to the source. The root `<svg>` element goes, taking its
 * `width`/`height`/`xmlns` with it — the tile decides the size. Every `id` is
 * renumbered `{key}-{n}` in order of appearance, along with every `url(#…)` and
 * `href="#…"` that names one: a diagram inlines every mark into one document,
 * so two brands that both called their gradient `a` would swap colours — and
 * the number rather than the name because sources hand out random ids, and a
 * regenerated entry must come out identical. And the whitespace collapses, so
 * the body is one line a person can paste.
 */
export const normaliseIconArt = (key: string, svg: string): { viewBox: string; body: string } => {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open || open.index === undefined) throw new Error("not an SVG document: no <svg> element");

  const viewBox = open[0].match(/\bviewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error("the <svg> element has no viewBox to scale from");

  const close = svg.lastIndexOf("</svg>");
  let body = svg.slice(open.index + open[0].length, close === -1 ? undefined : close);

  const ids = [
    ...new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? "")),
  ].filter((id) => id.length > 0);
  const renamed = new Map(ids.map((id, index) => [id, `${key}-${index}`]));

  // Longest first, so `ab` is rewritten before `a` can be found inside it.
  for (const id of [...ids].sort((left, right) => right.length - left.length)) {
    const next = renamed.get(id) ?? id;
    body = body
      .replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`url(#${id})`, `url(#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`);
  }

  body = body.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  return { viewBox, body };
};
