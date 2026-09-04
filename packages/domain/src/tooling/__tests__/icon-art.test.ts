import { describe, expect, it } from "vitest";
import { normaliseIconArt } from "../icon-art";

/** Roughly what a brand's own SVG, or an iconify body, looks like on arrival. */
const SOURCE = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1.12em" height="1em" viewBox="0 0 256 230">
  <defs>
    <linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#f00"/></linearGradient>
    <clipPath id="ab"><rect width="10" height="10"/></clipPath>
  </defs>
  <path fill="url(#a)" clip-path="url(#ab)" d="M0 0h10v10H0z"/>
  <use href="#a"/>
</svg>
`;

describe("normaliseIconArt", () => {
  it("keeps the viewBox and drops the root element with its sizing", () => {
    const { viewBox, body } = normaliseIconArt("acme", SOURCE);

    expect(viewBox).toBe("0 0 256 230");
    expect(body).not.toContain("<svg");
    expect(body).not.toContain("</svg>");
    expect(body).not.toContain("<?xml");
    expect(body).not.toContain('width="1.12em"');
  });

  it("renumbers every id under the key, in order of appearance, with every reference", () => {
    // Numbered rather than kept: sources do not agree on names — iconify hands
    // out a fresh random id per request — and a regenerated entry has to come
    // out identical, or every re-run of the script is a spurious diff.
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).toContain('id="acme-0"');
    expect(body).toContain('id="acme-1"');
    expect(body).toContain('fill="url(#acme-0)"');
    expect(body).toContain('clip-path="url(#acme-1)"');
    expect(body).toContain('href="#acme-0"');
    expect(body).not.toMatch(/\bid="a"/);
    expect(body).not.toMatch(/\bid="ab"/);
  });

  it("renumbers two ids where one is a prefix of the other, independently and correctly", () => {
    // `a` is a prefix of `ab`. Each replacement is delimiter-bounded — its own
    // closing quote or bracket — so `a`'s pattern can never be found inside
    // `ab`'s occurrence, regardless of which one is rewritten first.
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).not.toContain("acme-0b");
    expect(body.match(/acme-1/g)).toHaveLength(2);
  });

  it("collapses whitespace so the body is one line to paste", () => {
    const { body } = normaliseIconArt("acme", SOURCE);

    expect(body).not.toContain("\n");
    expect(body).not.toMatch(/>\s+</);
  });

  it("refuses a document without a viewBox, which cannot be scaled into a tile", () => {
    expect(() => normaliseIconArt("acme", '<svg><path d="M0 0"/></svg>')).toThrow(/viewBox/);
  });

  it("refuses text that is not an svg at all", () => {
    expect(() => normaliseIconArt("acme", "<html></html>")).toThrow(/<svg>/);
  });

  it("refuses a reference spelled in a form it does not rewrite, which would ship as a broken pointer", () => {
    // `url( #a )` with whitespace is not matched by the exact `url(#a)`
    // replacement, so the declaration gets renumbered and this reference
    // does not — exactly the silent breakage the guard exists to catch.
    const source = `<svg viewBox="0 0 2 2"><defs><linearGradient id="a"/></defs><rect fill="url( #a )" width="2" height="2"/></svg>`;

    expect(() => normaliseIconArt("acme", source)).toThrow(/#a/);
  });

  it("does not throw when every reference matches a declared id", () => {
    // Guards against the guard: a normal, fully-renumbered document must
    // still pass, or the check would start rejecting everything.
    expect(() => normaliseIconArt("acme", SOURCE)).not.toThrow();
  });

  it("renumbers a single-quoted id declaration and its unquoted url() reference", () => {
    // `id='a'` never entered the double-quote-only rename map, so it shipped
    // as a literal, unprefixed "a" — the exact cross-brand collision this
    // function exists to prevent — while the declared/referenced sets still
    // agreed with each other and nothing threw.
    const source = `<svg viewBox="0 0 2 2"><defs><linearGradient id='a'/></defs><rect fill="url(#a)" width="2" height="2"/></svg>`;

    const { body } = normaliseIconArt("acme", source);

    expect(body).toContain('id="acme-0"');
    expect(body).toContain("url(#acme-0)");
    expect(body).not.toMatch(/\bid=['"]a['"]/);
  });

  it("still refuses the spaced url() reference from the earlier guard", () => {
    // Regression check: widening quote handling for id/href must not loosen
    // the round-1 guard that catches an unrewritten `url( #a )`.
    const source = `<svg viewBox="0 0 2 2"><defs><linearGradient id="a"/></defs><rect fill="url( #a )" width="2" height="2"/></svg>`;

    expect(() => normaliseIconArt("acme", source)).toThrow(/#a/);
  });

  it("renumbers ids independently when different ids use different quote styles", () => {
    const source = `<svg viewBox="0 0 2 2"><defs><linearGradient id='a'/><clipPath id="b"/></defs><rect fill="url(#a)" clip-path="url(#b)" width="2" height="2"/></svg>`;

    const { body } = normaliseIconArt("acme", source);

    expect(body).toContain('id="acme-0"');
    expect(body).toContain('id="acme-1"');
    expect(body).toContain("url(#acme-0)");
    expect(body).toContain("url(#acme-1)");
  });

  describe("mixed already-prefixed and fresh ids", () => {
    // Renaming runs one id at a time with `replaceAll`. A source that
    // declares both "x" and "acme-0" renames "x" to "acme-0" first, which
    // writes a second, brand-new "acme-0" into the body — and the very next
    // iteration, renaming the original "acme-0" to "acme-1", cannot tell that
    // text apart from the one it is meant to rename, so it rewrites both.
    // Both elements end up carrying `id="acme-1"`, one painted from the
    // other's gradient, and neither existing guard notices: the declared and
    // referenced sets still agree with each other, and every surviving id is
    // still prefixed.
    const mixedSource = `<svg viewBox="0 0 2 2"><defs><linearGradient id="x"/><linearGradient id="acme-0"/></defs><rect fill="url(#x)" width="1" height="2"/><rect fill="url(#acme-0)" width="1" height="2"/></svg>`;

    it("refuses a mixed source where a rename would alias two ids onto one", () => {
      expect(() => normaliseIconArt("acme", mixedSource)).toThrow(/produced only 1 distinct id/);
    });

    it("stays idempotent: an already-normalised body renames to itself unchanged", () => {
      // Only a *mixed* source triggers the collision above. A body where
      // every id is already `{key}-{n}`, in order, renames each id to
      // itself — a no-op `replaceAll` — so re-running the tool on its own
      // output must keep passing, or every regeneration would be a spurious
      // diff at best and a rejection at worst.
      const alreadyNormalised = `<svg viewBox="0 0 2 2"><defs><linearGradient id="acme-0"/><clipPath id="acme-1"/></defs><rect fill="url(#acme-0)" clip-path="url(#acme-1)" width="2" height="2"/></svg>`;

      const { body } = normaliseIconArt("acme", alreadyNormalised);

      expect(body).toContain('id="acme-0"');
      expect(body).toContain('id="acme-1"');
      expect(body).toContain("url(#acme-0)");
      expect(body).toContain("url(#acme-1)");
    });
  });

  describe("style and class rejection", () => {
    it("refuses a source containing a <style> element", () => {
      const source = `<svg viewBox="0 0 2 2"><style>.cls-1{fill:#f00}</style><rect class="cls-1" width="2" height="2"/></svg>`;

      expect(() => normaliseIconArt("acme", source)).toThrow(/<style>/);
    });

    it("refuses a source carrying a class attribute even without a <style> block", () => {
      const source = `<svg viewBox="0 0 2 2"><rect class="cls-1" width="2" height="2"/></svg>`;

      expect(() => normaliseIconArt("acme", source)).toThrow(/class attribute/);
    });
  });

  it("rewrites xlink:href to plain href and still renumbers it", () => {
    // The standalone SVG document `renderSVG` produces declares no xlink
    // namespace, so a surviving `xlink:href` is a hard XML parse error for
    // PNG export's `<img>` load — which fails the whole diagram's export,
    // not just this mark.
    const source = `<svg viewBox="0 0 2 2"><defs><linearGradient id="a"/></defs><use xlink:href="#a"/></svg>`;

    const { body } = normaliseIconArt("acme", source);

    expect(body).not.toContain("xlink:href");
    expect(body).toContain('href="#acme-0"');
  });
});
