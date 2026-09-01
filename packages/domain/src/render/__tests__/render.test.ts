import { describe, expect, it } from "vitest";
import { DIAGRAM_COLORS, DIAGRAM_GEOMETRY } from "../../constants/diagram";
import {
  EXAMPLE_DIAGRAM_CONFIG,
  type DiagramConfigInput,
  diagramConfigSchema,
} from "../../schemas/diagram";
import { renderSVG } from "../index";

/** Runs an authoring-shape config through the schema, the way a consumer must. */
const render = (input: DiagramConfigInput) => renderSVG(diagramConfigSchema.parse(input));

/** A one-node canvas, so a test can isolate a single rendered element. */
const singleNode = (
  node: Partial<DiagramConfigInput["nodes"][number]> = {},
): DiagramConfigInput => ({
  version: 1,
  canvas: { w: 700, h: 360 },
  groups: [],
  nodes: [{ id: "n1", x: 350, y: 180, emoji: "🔥", name: "Hono", ...node }],
  edges: [],
});

describe("renderSVG", () => {
  it("matches the reference rendering of the canonical example", () => {
    expect(render(EXAMPLE_DIAGRAM_CONFIG)).toMatchSnapshot();
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
    expect(render(EXAMPLE_DIAGRAM_CONFIG)).toBe(render(EXAMPLE_DIAGRAM_CONFIG));
  });

  describe("escaping", () => {
    it("escapes XML metacharacters in a node name", () => {
      const svg = render(singleNode({ name: "A & B <C>" }));

      expect(svg).toContain("A &amp; B &lt;C&gt;");
      expect(svg).not.toContain("A & B <C>");
    });

    it("escapes XML metacharacters in an edge label", () => {
      const svg = render({
        version: 1,
        canvas: { w: 700, h: 360 },
        groups: [],
        nodes: [
          { id: "a", x: 200, y: 180, emoji: "🖥️", name: "A" },
          { id: "b", x: 500, y: 180, emoji: "🔥", name: "B" },
        ],
        edges: [{ from: "a", to: "b", out: "r", inn: "l", label: "a & b" }],
      });

      expect(svg).toContain("a &amp; b");
    });

    it("escapes XML metacharacters in a group label", () => {
      const svg = render({
        version: 1,
        canvas: { w: 700, h: 360 },
        groups: [{ id: "g", label: "R&D", x: 100, y: 60, w: 400, h: 240, tone: "blue" }],
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

  describe("edge styles", () => {
    const twoNodes = (style: "solid" | "dashed"): DiagramConfigInput => ({
      version: 1,
      canvas: { w: 700, h: 360 },
      groups: [],
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
    it("draws groups behind edges, and edges behind nodes", () => {
      const svg = render(EXAMPLE_DIAGRAM_CONFIG);

      const group = svg.indexOf("CLOUDFLARE");
      const edge = svg.indexOf("HTTPS");
      const node = svg.indexOf("sqlite");

      expect(group).toBeGreaterThan(-1);
      expect(group).toBeLessThan(edge);
      expect(edge).toBeLessThan(node);
    });
  });
});
