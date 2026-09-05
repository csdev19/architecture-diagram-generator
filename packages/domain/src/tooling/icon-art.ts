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

/**
 * Throws when `body` contains a `url(#…)` or `href="#…"` naming an id that is
 * not declared anywhere in it.
 *
 * Exported so both `normaliseIconArt` and the registry test can run the same
 * check: the tooling runs it on a freshly renumbered body, and the registry
 * test runs it on whatever is actually pasted into `diagram-icons.ts` — which
 * may have been hand-edited after the tool ran, and is the only thing that
 * would otherwise notice a reference left pointing at nothing.
 */
export const assertArtReferencesResolve = (body: string): void => {
  const declared = new Set(
    [...body.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1] ?? ""),
  );
  const referenced = [
    ...[...body.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)].map((match) => match[1] ?? ""),
    ...[...body.matchAll(/href\s*=\s*["']#([^"']+)["']/g)].map((match) => match[1] ?? ""),
  ];
  for (const id of referenced) {
    if (!declared.has(id)) {
      throw new Error(
        `reference to "#${id}" has no matching id — either the source spells that reference in a ` +
          `form icon-add does not rewrite, or a hand-edit removed the declaration it pointed at`,
      );
    }
  }
};

export const normaliseIconArt = (key: string, svg: string): { viewBox: string; body: string } => {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open || open.index === undefined) throw new Error("not an SVG document: no <svg> element");

  const viewBox = open[0].match(/\bviewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error("the <svg> element has no viewBox to scale from");

  const close = svg.lastIndexOf("</svg>");
  let body = svg.slice(open.index + open[0].length, close === -1 ? undefined : close);

  // A `<style>` block or a `class` attribute is CSS, and CSS selectors are not
  // ids: this function only renumbers `id`/`url(#…)`/`href="#…"`, so a class
  // name survives untouched, and two icons that both used `.cls-1` in one
  // diagram restyle each other document-wide — the exact cross-brand
  // collision the id rule exists to prevent, just spelled differently. Worse,
  // the palette inlines this body into the app's own document, so a stray
  // rule can reach the editor's own chrome. Namespacing CSS is a much larger
  // job than this function does; refusing it here, at curation time, is
  // cheap and turns a silent runtime hazard into a loud one a person fixes
  // once, by hand, before it ever ships.
  if (/<style\b/i.test(body)) {
    throw new Error(
      "source contains a <style> element — icon:add does not namespace CSS, so two such icons " +
        "in one diagram would restyle each other, and this body is inlined straight into the " +
        "app's own document. Inline the rules as presentation attributes (fill, stroke, ...) on " +
        "the elements they target, remove the <style> block, and re-run icon:add.",
    );
  }
  if (/\bclass\s*=\s*["'][^"']*["']/.test(body)) {
    throw new Error(
      "source carries a class attribute — classes are only meaningful alongside the <style> " +
        "rules they select, which icon:add refuses for the same reason: nothing namespaces them. " +
        "Inline the styling as presentation attributes (fill, stroke, ...), remove the class " +
        "attributes, and re-run icon:add.",
    );
  }

  // `href` is what SVG2 and every renderer downstream of this pipeline reads.
  // `xlink:href` needs its namespace declared on the root element, which
  // `renderSVG` never emits, so a standalone export with `xlink:href` in it is
  // a hard XML parse error rather than a rendering quirk — and PNG export
  // loads that document into an `<img>`, which parses strictly. That failure
  // is not scoped to this one mark: it takes down the whole diagram's PNG
  // export and SVG download. Rewriting the attribute name here, before the
  // rename loop below runs, lets that loop's existing `href="#…"` handling
  // renumber the reference exactly as it would for a plain `href`.
  body = body.replaceAll("xlink:href", "href");

  // Either quote style declares an id — a hand-copied brand file is as likely
  // to write `id='a'` as `id="a"` — so both have to enter the rename map, or
  // a single-quoted id ships un-renumbered and unprefixed straight into the
  // registry, which is the exact cross-brand collision this function exists
  // to prevent.
  const ids = [
    ...new Set([...body.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1] ?? "")),
  ].filter((id) => id.length > 0);
  const renamed = new Map(ids.map((id, index) => [id, `${key}-${index}`]));

  // Order does not matter here: every replacement is delimiter-bounded — the
  // pattern for `id="a"`, `id='a'`, `url(#a)`, or `href="#a"`/`href='#a'`
  // always includes its own closing quote or bracket, so a shorter id can
  // never match inside a longer id's occurrence (`id="a"` cannot be found
  // inside `id="ab"`). Any future form added to this loop has to keep that
  // same bounded shape, or this guarantee breaks.
  for (const id of ids) {
    const next = renamed.get(id) ?? id;
    body = body
      .replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`id='${id}'`, `id="${next}"`)
      .replaceAll(`url(#${id})`, `url(#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`)
      .replaceAll(`href='#${id}'`, `href="#${next}"`);
  }

  // A rename can alias onto an id an earlier rename just created: a source
  // that declares both "x" and "acme-0" renames "x" to "acme-0" first, and
  // that pass's `replaceAll` leaves the body carrying a second, brand-new
  // "acme-0" — which the very next iteration, renaming the original
  // "acme-0" to "acme-1", then rewrites too, because `replaceAll` cannot
  // distinguish text it just wrote from text that was already there. Both
  // elements end up sharing `id="acme-1"`, one painted from the other's
  // definition, and it ships silently: the declared and referenced sets
  // still agree, and every surviving id is still prefixed. The only way to
  // catch it is to compare cardinality — a rename that preserved every id's
  // identity leaves as many distinct ids as it started with; a collision
  // leaves fewer.
  const distinctAfterRename = new Set(
    [...body.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? ""),
  ).size;
  if (distinctAfterRename !== ids.length) {
    throw new Error(
      `renaming ${ids.length} id(s) under "${key}-" produced only ${distinctAfterRename} ` +
        `distinct id(s) — a rename aliased onto an id an earlier rename just created (for ` +
        `example, a source that declares both "x" and "${key}-0" both land on "${key}-1"). ` +
        `Rename the colliding source id before regenerating.`,
    );
  }

  // A reference spelled in a form this loop does not rewrite — `url( #a )`
  // with whitespace, `url("#a")` quoted, or a reference sitting inside a
  // <style> rule — would otherwise leave the declaration renumbered and the
  // reference pointing at an id that no longer exists: a broken gradient
  // that ships silently until a human looks at the mark. Comparing every
  // reference against what actually got declared turns that into a loud
  // failure here, while it is still cheap to fix, instead of chasing each
  // new spelling one at a time.
  assertArtReferencesResolve(body);

  // The check above only catches a *mismatch* between what is declared and
  // what is referenced — a declaration and its references that agree with
  // each other, but were both missed by the rename loop above (as a
  // single-quoted id once was), sail straight through it. This asserts the
  // function's actual contract directly: every id left in the body must
  // carry the key's prefix, full stop.
  const declared = new Set(
    [...body.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1] ?? ""),
  );
  for (const id of declared) {
    if (!id.startsWith(`${key}-`)) {
      throw new Error(
        `id "${id}" was not renumbered under "${key}-" — this source declares it in a form ` +
          `icon-add does not recognise, so it would ship unprefixed and could collide with ` +
          `another brand's id of the same name`,
      );
    }
  }

  body = body.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  return { viewBox, body };
};
