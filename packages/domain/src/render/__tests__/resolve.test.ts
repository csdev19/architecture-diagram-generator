import { describe, expect, it } from "vitest";
import {
  EXAMPLE_DIAGRAM_DOCUMENT,
  diagramDocumentSchema,
  type DiagramDocumentInput,
} from "../../schemas/diagram-document";
import { validateResolvedDiagram } from "../../schemas/diagram";
import { renderSVG } from "../index";
import { resolveDiagram } from "../resolve";
import { escapeXml } from "../svg";

const resolve = (input: DiagramDocumentInput) => resolveDiagram(diagramDocumentSchema.parse(input));

const example = () => structuredClone(EXAMPLE_DIAGRAM_DOCUMENT);

const withLayout = (layout: DiagramDocumentInput["layout"]): DiagramDocumentInput => ({
  ...example(),
  layout,
});

const nodeOf = (diagram: ReturnType<typeof resolve>, id: string) =>
  diagram.nodes.find((node) => node.id === id)!;

const boundaryOf = (diagram: ReturnType<typeof resolve>, id: string) =>
  diagram.boundaries.find((boundary) => boundary.id === id)!;

describe("resolveDiagram", () => {
  it("produces a diagram the renderer accepts, from content alone", () => {
    const resolved = resolve(example());

    expect(validateResolvedDiagram(resolved).ok).toBe(true);
  });

  it("renders a content-only document", () => {
    const svg = renderSVG(resolve(example()));

    expect(svg).toContain("<svg");
    for (const node of example().content.nodes) {
      expect(svg).toContain(escapeXml(node.name));
    }
  });

  it("sizes a grouped boundary around its members plus its padding", () => {
    const resolved = resolve(example());
    const cf = boundaryOf(resolved, "cf");

    for (const id of ["api", "db"]) {
      const node = nodeOf(resolved, id);
      expect(node.x, `${id} sits outside its boundary`).toBeGreaterThan(cf.x);
      expect(node.x).toBeLessThan(cf.x + cf.w);
      expect(node.y).toBeGreaterThan(cf.y);
      expect(node.y).toBeLessThan(cf.y + cf.h);
    }
  });

  it("leaves a node that is not a member outside the box", () => {
    const resolved = resolve(example());
    const cf = boundaryOf(resolved, "cf");
    const web = nodeOf(resolved, "web");

    const inside = web.x > cf.x && web.x < cf.x + cf.w && web.y > cf.y && web.y < cf.y + cf.h;
    expect(inside, "a non-member ended up inside the boundary").toBe(false);
  });

  it("grows a derived boundary to follow a member dragged out of it", () => {
    const resolved = resolve(withLayout({ nodes: { db: { x: 1200, y: 800 } } }));
    const cf = boundaryOf(resolved, "cf");

    expect(cf.x + cf.w).toBeGreaterThan(1200);
    expect(cf.y + cf.h).toBeGreaterThan(800);
  });

  it("uses a supplied position verbatim", () => {
    const resolved = resolve(withLayout({ nodes: { web: { x: -300, y: 40 } } }));

    expect(nodeOf(resolved, "web")).toMatchObject({ x: -300, y: 40 });
  });

  it("derives a missing edge anchor from the facing sides", () => {
    const resolved = resolve(withLayout({ nodes: { web: { x: 0, y: 0 }, api: { x: 400, y: 0 } } }));
    const edge = resolved.edges.find((candidate) => candidate.id === "web-api")!;

    expect(edge).toMatchObject({ out: "r", inn: "l" });
  });

  it("uses a supplied anchor pair instead", () => {
    const resolved = resolve(withLayout({ edges: { "web-api": { out: "t", inn: "b" } } }));
    const edge = resolved.edges.find((candidate) => candidate.id === "web-api")!;

    expect(edge).toMatchObject({ out: "t", inn: "b" });
  });

  it("places an ungrouped boundary exactly where its rectangle says", () => {
    const document = example();
    document.content.groups = [{ id: "pipeline", members: ["ci", "web"] }];

    const resolved = resolveDiagram(
      diagramDocumentSchema.parse({
        ...document,
        layout: { boundaries: { cf: { x: 12, y: 24, w: 300, h: 200 } } },
      }),
    );

    expect(boundaryOf(resolved, "cf")).toMatchObject({ x: 12, y: 24, w: 300, h: 200 });
  });

  it("draws an outer boundary before the one nested inside it", () => {
    const document = example();
    document.content.boundaries = [
      { id: "cf", label: "CLOUDFLARE", tone: "orange" },
      { id: "data", label: "DATA", tone: "green" },
    ];
    document.content.groups = [
      { id: "runtime", members: ["cf", "api", "storage"] },
      { id: "storage", members: ["data", "db"] },
    ];

    const resolved = resolveDiagram(diagramDocumentSchema.parse(document));
    const ids = resolved.boundaries.map((boundary) => boundary.id);

    expect(ids.indexOf("cf")).toBeLessThan(ids.indexOf("data"));
  });

  it("makes an outer boundary cover the one nested inside it", () => {
    const document = example();
    document.content.boundaries = [
      { id: "cf", label: "CLOUDFLARE", tone: "orange" },
      { id: "data", label: "DATA", tone: "green" },
    ];
    document.content.groups = [
      { id: "runtime", members: ["cf", "api", "storage"] },
      { id: "storage", members: ["data", "db"] },
    ];

    const resolved = resolveDiagram(diagramDocumentSchema.parse(document));
    const cf = boundaryOf(resolved, "cf");
    const data = boundaryOf(resolved, "data");

    expect(data.x).toBeGreaterThanOrEqual(cf.x);
    expect(data.x + data.w).toBeLessThanOrEqual(cf.x + cf.w);
    expect(data.y + data.h).toBeLessThanOrEqual(cf.y + cf.h);
  });

  it("carries the paper tone and a fixed canvas across", () => {
    const document = example();
    document.content.background = "cream";

    const resolved = resolveDiagram(
      diagramDocumentSchema.parse({ ...document, layout: { canvas: { w: 800, h: 600 } } }),
    );

    expect(resolved.background).toBe("cream");
    expect(resolved.canvas).toEqual({ w: 800, h: 600 });
  });

  it("is byte-stable", () => {
    expect(renderSVG(resolve(example()))).toBe(renderSVG(resolve(example())));
  });
});
