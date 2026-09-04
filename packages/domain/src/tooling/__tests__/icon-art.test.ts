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

  it("does not let a short id rewrite the inside of a longer one", () => {
    // `a` is a prefix of `ab`; replacing `a` first would leave `ab` as `acme-0b`.
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
});
