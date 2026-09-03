import { describe, expect, it } from "vitest";
import { resolvedDiagramSchema, type ResolvedDiagramInput } from "../../schemas/diagram";
import { FRAME_PADDING, contentFrame, resolveFrame } from "../frame";
import { renderSVG } from "../index";

const parse = (input: ResolvedDiagramInput) => resolvedDiagramSchema.parse(input);

const oneNode = (
  overrides: Partial<ResolvedDiagramInput["nodes"][number]> = {},
): ResolvedDiagramInput => ({
  boundaries: [],
  nodes: [{ id: "a", x: 0, y: 0, emoji: "🔥", name: "A", ...overrides }],
  edges: [],
});

describe("contentFrame", () => {
  it("wraps a single node in padding on every side", () => {
    const frame = contentFrame(parse(oneNode()));

    // The tile is 62 wide, so it reaches 31 either side of the centre.
    expect(frame.x).toBe(-31 - FRAME_PADDING);
    expect(frame.y).toBe(-31 - FRAME_PADDING);
  });

  it("leaves room under a tile for its name and sublabel", () => {
    const frame = contentFrame(parse(oneNode()));

    // 31 to the tile's bottom edge, then the 40px text block below it.
    expect(frame.y + frame.h).toBe(31 + 40 + FRAME_PADDING);
  });

  it("widens for a name that runs past the tile", () => {
    const narrow = contentFrame(parse(oneNode({ name: "A" })));
    const wide = contentFrame(parse(oneNode({ name: "A very long node name" })));

    expect(wide.w).toBeGreaterThan(narrow.w);
  });

  it("covers negative coordinates rather than clipping them", () => {
    // This is the point of deriving the frame: there is no origin to be left of.
    const frame = contentFrame(
      parse({
        boundaries: [],
        nodes: [
          { id: "a", x: -900, y: -400, emoji: "🔥", name: "A" },
          { id: "b", x: 300, y: 200, emoji: "🔥", name: "B" },
        ],
        edges: [],
      }),
    );

    expect(frame.x).toBeLessThan(-900);
    expect(frame.y).toBeLessThan(-400);
    expect(frame.x + frame.w).toBeGreaterThan(300);
    expect(frame.y + frame.h).toBeGreaterThan(200);
  });

  it("includes a boundary, label band and all", () => {
    const frame = contentFrame(
      parse({
        boundaries: [{ id: "g", label: "BOX", x: 400, y: 400, w: 300, h: 200, tone: "blue" }],
        nodes: [{ id: "a", x: 0, y: 0, emoji: "🔥", name: "A" }],
        edges: [],
      }),
    );

    expect(frame.x + frame.w).toBe(700 + FRAME_PADDING);
    expect(frame.y + frame.h).toBe(600 + FRAME_PADDING);
  });
});

describe("resolveFrame", () => {
  it("honours a declared canvas, for a diagram that must be an exact size", () => {
    expect(resolveFrame(parse({ ...oneNode(), canvas: { w: 1024, h: 768 } }))).toEqual({
      x: 0,
      y: 0,
      w: 1024,
      h: 768,
    });
  });

  it("derives the frame when no canvas is declared", () => {
    const config = parse(oneNode());

    expect(resolveFrame(config)).toEqual(contentFrame(config));
  });
});

describe("renderSVG framing", () => {
  it("puts the resolved frame in the viewBox", () => {
    const config = parse(oneNode());
    const { x, y, w, h } = contentFrame(config);

    expect(renderSVG(config)).toContain(`viewBox="${x} ${y} ${w} ${h}"`);
  });

  it("takes an explicit frame, for an editor showing part of the world", () => {
    const svg = renderSVG(parse(oneNode()), { frame: { x: -500, y: -500, w: 2000, h: 1500 } });

    expect(svg).toContain(`viewBox="-500 -500 2000 1500"`);
    expect(svg).toContain(`width="2000"`);
  });

  it("can leave the background out, for an editor that paints its own", () => {
    const config = parse(oneNode());

    expect(renderSVG(config, { background: false })).not.toContain("url(#diagram-grid)");
    // The pattern stays defined; only the two rects that use it are dropped.
    expect(renderSVG(config, { background: false })).toContain(`id="diagram-grid"`);
  });

  it("draws the same scene whatever the framing", () => {
    const config = parse(oneNode());
    /** Everything between the defs and the closing tag: the drawing itself. */
    const scene = (svg: string) =>
      svg.slice(svg.indexOf("</defs>") + "</defs>".length, svg.lastIndexOf("</svg>"));

    // One renderer. Changing the frame must not move a single shape — that is
    // what keeps the editor's picture and the exported PNG the same drawing,
    // and it is the invariant ADR 0001 turns on.
    expect(
      scene(renderSVG(config, { background: false, frame: { x: -9, y: -9, w: 900, h: 900 } })),
    ).toBe(scene(renderSVG(config, { background: false })));
  });
});
