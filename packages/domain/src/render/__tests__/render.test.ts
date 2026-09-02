import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, DIAGRAM_GEOMETRY, DIAGRAM_TYPOGRAPHY } from "../../constants/diagram";
import { DIAGRAM_ICONS } from "../../constants/diagram-icons";
import {
  EXAMPLE_RESOLVED_DIAGRAM,
  type ResolvedDiagramInput,
  resolvedDiagramSchema,
} from "../../schemas/diagram";
import { renderSVG } from "../index";
import { num } from "../svg";

/** Runs an authoring-shape config through the schema, the way a consumer must. */
const render = (input: ResolvedDiagramInput) => renderSVG(resolvedDiagramSchema.parse(input));

/** A one-node canvas, so a test can isolate a single rendered element. */
const singleNode = (
  node: Partial<ResolvedDiagramInput["nodes"][number]> = {},
): ResolvedDiagramInput => ({
  canvas: { w: 700, h: 360 },
  boundaries: [],
  nodes: [{ id: "n1", x: 350, y: 180, emoji: "🔥", name: "Hono", ...node }],
  edges: [],
});

describe("renderSVG", () => {
  it("matches the reference rendering of the canonical example", () => {
    expect(render(EXAMPLE_RESOLVED_DIAGRAM)).toMatchSnapshot();
  });

  it("sizes the root element from the canvas", () => {
    const svg = render(singleNode());

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="700"');
    expect(svg).toContain('height="360"');
    expect(svg).toContain('viewBox="0 0 700 360"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("is deterministic", () => {
    expect(render(EXAMPLE_RESOLVED_DIAGRAM)).toBe(render(EXAMPLE_RESOLVED_DIAGRAM));
  });

  describe("escaping", () => {
    it("escapes XML metacharacters in a node name", () => {
      const svg = render(singleNode({ name: "A & B <C>" }));

      expect(svg).toContain("A &amp; B &lt;C&gt;");
      expect(svg).not.toContain("A & B <C>");
    });

    it("escapes XML metacharacters in an edge label", () => {
      const svg = render({
        canvas: { w: 700, h: 360 },
        boundaries: [],
        nodes: [
          { id: "a", x: 200, y: 180, emoji: "🖥️", name: "A" },
          { id: "b", x: 500, y: 180, emoji: "🔥", name: "B" },
        ],
        edges: [{ from: "a", to: "b", out: "r", inn: "l", label: "a & b" }],
      });

      expect(svg).toContain("a &amp; b");
    });

    it("escapes XML metacharacters in a boundary label", () => {
      const svg = render({
        canvas: { w: 700, h: 360 },
        boundaries: [{ id: "g", label: "R&D", x: 100, y: 60, w: 400, h: 240, tone: "blue" }],
        nodes: [{ id: "n1", x: 350, y: 180, emoji: "🔥", name: "Hono" }],
        edges: [],
      });

      expect(svg).toContain("R&amp;D");
    });
  });

  describe("tile variants", () => {
    const tileRect = (fill: string) =>
      `width="${DIAGRAM_GEOMETRY.TILE_SIZE}" height="${DIAGRAM_GEOMETRY.TILE_SIZE}" rx="${DIAGRAM_GEOMETRY.TILE_RADIUS}" fill="${fill}"`;

    it("fills a dark tile with the dark colour", () => {
      const svg = render(singleNode({ tile: "dark" }));

      expect(svg).toContain(tileRect(DIAGRAM_COLORS.TILE_DARK_FILL));
      expect(svg).not.toContain(tileRect(DIAGRAM_COLORS.TILE_LIGHT_FILL));
    });

    it("fills a light tile with the light colour", () => {
      const svg = render(singleNode({ tile: "light" }));

      expect(svg).toContain(tileRect(DIAGRAM_COLORS.TILE_LIGHT_FILL));
      expect(svg).not.toContain(tileRect(DIAGRAM_COLORS.TILE_DARK_FILL));
    });
  });

  describe("brand icons", () => {
    it("draws the registry's path when a node names an iconKey", () => {
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono" }));

      expect(svg).toContain(DIAGRAM_ICONS.hono.path);
    });

    it("lets an iconKey win over an emoji on the same node", () => {
      const svg = render(singleNode({ emoji: "🔥", iconKey: "hono" }));

      expect(svg).toContain(DIAGRAM_ICONS.hono.path);
      expect(svg, "the emoji glyph is still drawn behind the mark").not.toContain("🔥");
    });

    it("draws a readable brand mark in its brand colour on a light tile", () => {
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono", tile: "light" }));

      expect(svg).toContain(`fill="#${DIAGRAM_ICONS.hono.hex}"`);
    });

    it("drops a brand colour that would vanish on a light tile", () => {
      // React's cyan scores 1.62 against white — legible only as a shape.
      const svg = render(singleNode({ emoji: undefined, iconKey: "react", tile: "light" }));

      expect(svg).toContain(DIAGRAM_ICONS.react.path);
      expect(svg).not.toContain(`fill="#${DIAGRAM_ICONS.react.hex}"`);
    });

    it("draws a mark in the light tile colour on a dark tile", () => {
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono", tile: "dark" }));

      expect(svg).toContain(DIAGRAM_ICONS.hono.path);
      expect(svg).not.toContain(`fill="#${DIAGRAM_ICONS.hono.hex}"`);
    });

    it("scales the 24px mark to the geometry's icon size and centres it on the tile", () => {
      const { ICON_SIZE, ICON_VIEWBOX } = DIAGRAM_GEOMETRY;
      const svg = render(singleNode({ emoji: undefined, iconKey: "hono" }));

      // The node sits at (350, 180), so the mark's top-left is half its size up and left.
      expect(svg).toContain(`translate(${num(350 - ICON_SIZE / 2)} ${num(180 - ICON_SIZE / 2)})`);
      expect(svg).toContain(`scale(${num(ICON_SIZE / ICON_VIEWBOX)})`);
    });

    it("leaves an emoji-only node exactly as it was", () => {
      const svg = render(singleNode({ emoji: "🔥" }));

      expect(svg).toContain("🔥");
      expect(svg, "an emoji node must not carry an icon boundary").not.toContain("scale(");
      expect(svg).toContain(`font-size="${DIAGRAM_TYPOGRAPHY.EMOJI_SIZE}"`);
    });
  });

  describe("edge styles", () => {
    const twoNodes = (style: "solid" | "dashed"): ResolvedDiagramInput => ({
      canvas: { w: 700, h: 360 },
      boundaries: [],
      nodes: [
        { id: "a", x: 200, y: 180, emoji: "🖥️", name: "A" },
        { id: "b", x: 500, y: 180, emoji: "🔥", name: "B" },
      ],
      edges: [{ from: "a", to: "b", out: "r", inn: "l", style }],
    });

    it("points a solid edge at the solid marker and draws an unbroken line", () => {
      const svg = render(twoNodes("solid"));

      expect(svg).toContain("url(#arrow-solid)");
      expect(svg).not.toContain("url(#arrow-dashed)");
      expect(svg).toContain(`stroke="${DIAGRAM_COLORS.EDGE_SOLID}"`);
    });

    it("points a dashed edge at the grey marker and dashes the line", () => {
      const svg = render(twoNodes("dashed"));

      expect(svg).toContain("url(#arrow-dashed)");
      expect(svg).not.toContain("url(#arrow-solid)");
      expect(svg).toContain("stroke-dasharray");
      expect(svg).toContain(`stroke="${DIAGRAM_COLORS.EDGE_DASHED}"`);
    });
  });

  describe("layer order", () => {
    it("draws boundaries behind edges, and edges behind nodes", () => {
      const svg = render(EXAMPLE_RESOLVED_DIAGRAM);

      const boundary = svg.indexOf("CLOUDFLARE");
      const edge = svg.indexOf("HTTPS");
      const node = svg.indexOf("sqlite");

      expect(boundary).toBeGreaterThan(-1);
      expect(boundary).toBeLessThan(edge);
      expect(edge).toBeLessThan(node);
    });
  });
});
