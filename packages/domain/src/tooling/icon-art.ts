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

  // Order does not matter here: every replacement is delimiter-bounded — the
  // pattern for `id="a"`, `url(#a)`, or `href="#a"` always includes its own
  // closing quote or bracket, so a shorter id can never match inside a longer
  // id's occurrence (`id="a"` cannot be found inside `id="ab"`). Any future
  // form added to this loop has to keep that same bounded shape, or this
  // guarantee breaks.
  for (const id of ids) {
    const next = renamed.get(id) ?? id;
    body = body
      .replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`url(#${id})`, `url(#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`);
  }

  // A reference spelled in a form this loop does not rewrite — `url( #a )`
  // with whitespace, `url("#a")` quoted, a single-quoted `href='#a'`, or a
  // reference sitting inside a <style> rule — would otherwise leave the
  // declaration renumbered and the reference pointing at an id that no
  // longer exists: a broken gradient that ships silently until a human looks
  // at the mark. Comparing every reference against what actually got
  // declared turns that into a loud failure here, while it is still cheap to
  // fix, instead of chasing each new spelling one at a time.
  const declared = new Set(
    [...body.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1] ?? ""),
  );
  const referenced = [
    ...[...body.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)].map((match) => match[1] ?? ""),
    ...[...body.matchAll(/(?:xlink:)?href=["']#([^"']+)["']/g)].map((match) => match[1] ?? ""),
  ];
  for (const id of referenced) {
    if (!declared.has(id)) {
      throw new Error(
        `reference to "#${id}" has no matching id — this source spells that reference in a ` +
          `form icon-add does not rewrite, so renumbering left a broken pointer`,
      );
    }
  }

  body = body.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  return { viewBox, body };
};
