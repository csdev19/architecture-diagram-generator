import { fireEvent, render, screen } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_DOCUMENT, diagramDocumentSchema } from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { beforeEach, describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";
import { hitTestNode } from "../pointer-geometry";

/**
 * The seed as the editor draws it.
 *
 * Tiles are addressed through this rather than by literal coordinates: the
 * seed is a content-only document, so where a tile sits is auto-layout's answer
 * and not a number anyone wrote down. Hard-coding those numbers here would make
 * every test in the file a test of the layout algorithm as well.
 */
const seed = resolveDiagram(diagramDocumentSchema.parse(EXAMPLE_DIAGRAM_DOCUMENT));

/** Where a tile starts out, in the canvas coordinates a drag speaks. */
const at = (id: string) => {
  const node = seed.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`the seed has no "${id}" to aim at`);
  return { x: node.x, y: node.y };
};

/** A point on empty canvas, well clear of everything the seed draws. */
const NOWHERE = { x: -600, y: 600 };

/**
 * jsdom implements no SVG geometry, so `getScreenCTM` is stubbed with an
 * identity matrix: client coordinates then equal viewBox coordinates and the
 * test can address tiles by the config's own numbers. The matrix maths itself
 * is covered separately, against a matrix that is not the identity.
 */
const stubScreenCTM = (matrix: Partial<DOMMatrix> = {}) => {
  const ctm = { a: 1, d: 1, e: 0, f: 0, ...matrix } as DOMMatrix;
  // Defined rather than spied on: jsdom has no `getScreenCTM` to spy on.
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    writable: true,
    value: () => ctm,
  });
};

const canvas = () => screen.getByTestId("diagram-canvas");
const documentText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i).value;
const parsed = () => JSON.parse(documentText()) as Record<string, any>;

/** Where the document says a tile is. A drag writes into `layout`, never content. */
const positionIn = (text: string, id: string) =>
  (JSON.parse(text) as Record<string, any>).layout?.nodes?.[id];

/** The node itself, which a drag must never touch. */
const nodeIn = (text: string, id: string) =>
  (JSON.parse(text) as Record<string, any>).content.nodes.find(
    (node: { id: string }) => node.id === id,
  );

/** A full press-move-release over the canvas, in viewBox coordinates. */
const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  fireEvent.pointerDown(canvas(), { clientX: from.x, clientY: from.y, pointerId: 1 });
  fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
};

const clickTile = (x: number, y: number) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });
};

beforeEach(() => {
  stubScreenCTM();
});

describe("dragging a node", () => {
  it("writes the new coordinates into the editor's JSON", () => {
    render(<EditorPage />);
    drag(at("api"), { x: 300, y: 260 });

    expect(positionIn(documentText(), "api")).toEqual({ x: 299, y: 260 });
  });

  it("snaps to the half-grid on the way", () => {
    render(<EditorPage />);
    drag(at("api"), { x: 301, y: 197 });

    expect(positionIn(documentText(), "api")).toEqual({ x: 299, y: 195 });
  });

  it("leaves the architecture completely alone", () => {
    render(<EditorPage />);
    const before = documentText();
    drag(at("api"), { x: 300, y: 260 });

    expect(JSON.parse(documentText()).content).toEqual(JSON.parse(before).content);
    expect(nodeIn(documentText(), "api")).not.toHaveProperty("x");
  });

  it("leaves every other tile exactly where it was drawn", () => {
    render(<EditorPage />);
    drag(at("api"), { x: 300, y: 260 });

    // Dragging one tile settles the rest rather than re-flowing them: pinning
    // one node is enough to change what auto-layout would do with the others.
    for (const id of ["web", "db", "ci"]) {
      expect(positionIn(documentText(), id), `"${id}" moved`).toEqual(at(id));
    }
  });

  it("takes a node anywhere, negative coordinates included", () => {
    render(<EditorPage />);
    // Nothing clamps: there is no frame to stay inside, so the drag lands
    // exactly where it was released, snapped to the grid and no further.
    drag(at("api"), { x: -400, y: -400 });

    expect(positionIn(documentText(), "api")).toEqual({ x: -403, y: -403 });
  });

  it("takes a node far past where the diagram used to end", () => {
    render(<EditorPage />);
    drag(at("api"), { x: 2000, y: 2000 });

    expect(positionIn(documentText(), "api")).toEqual({ x: 2002, y: 2002 });
  });

  it("ignores a press that lands on empty canvas", () => {
    render(<EditorPage />);
    const before = documentText();
    drag(NOWHERE, { x: NOWHERE.x + 140, y: NOWHERE.y });

    expect(documentText()).toBe(before);
  });

  it("puts the node back when Escape cancels the drag", () => {
    render(<EditorPage />);
    const before = documentText();
    const start = at("api");

    fireEvent.pointerDown(canvas(), { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });
    expect(positionIn(documentText(), "api")).not.toEqual(start);

    fireEvent.keyDown(window, { key: "Escape" });

    // The whole gesture is undone, including the settling it did on the way in:
    // the document goes back to the content-only text it started as.
    expect(documentText()).toBe(before);
  });

  it("stops moving the node after Escape", () => {
    render(<EditorPage />);
    const before = documentText();
    const start = at("api");

    fireEvent.pointerDown(canvas(), { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerMove(canvas(), { clientX: 600, clientY: 320, pointerId: 1 });

    expect(documentText()).toBe(before);
  });
});

describe("text that does not validate", () => {
  it("keeps drawing the last document that did, and lists the problems", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText(/diagram document/i);
    fireEvent.change(textarea, { target: { value: "{ not json" } });

    // Losing the picture at every half-typed keystroke is what makes a JSON
    // panel unusable, so the canvas holds the last good render.
    expect(screen.getByTestId("diagram-canvas")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/the canvas shows the last valid document/i)).toBeInTheDocument();
  });

  it("puts the last valid text back on Revert", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i);
    const before = textarea.value;

    fireEvent.change(textarea, { target: { value: "{ not json" } });
    fireEvent.click(screen.getByRole("button", { name: /revert/i }));

    expect(documentText()).toBe(before);
  });
});

describe("selection", () => {
  it("selects the tile that was pressed", () => {
    render(<EditorPage />);
    fireEvent.pointerDown(canvas(), { clientX: at("api").x, clientY: at("api").y, pointerId: 1 });

    expect(canvas()).toHaveAttribute("data-selected-node", "api");
  });

  it("clears the selection when the press misses every tile", () => {
    render(<EditorPage />);
    clickTile(at("api").x, at("api").y);
    fireEvent.pointerDown(canvas(), { clientX: NOWHERE.x, clientY: NOWHERE.y, pointerId: 1 });

    expect(canvas()).not.toHaveAttribute("data-selected-node");
  });
});

describe("placing a tile", () => {
  it("places the palette's chosen tile where the sheet was clicked", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));
    fireEvent.pointerDown(canvas(), { clientX: 400, clientY: 260, pointerId: 1 });

    // Snapped to the half-grid, like every other write of a coordinate.
    expect(parsed().content.nodes.at(-1)).toMatchObject({
      id: "astro",
      iconKey: "astro",
      name: "Astro",
    });
    // A tile put somewhere on purpose is a supplied position, snapped to the
    // half-grid like every other write of a coordinate.
    expect(parsed().layout.nodes.astro).toEqual({ x: 403, y: 260 });
  });

  it("gives the second tile of a kind an id of its own", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));
    fireEvent.pointerDown(canvas(), { clientX: 400, clientY: 260, pointerId: 1 });
    fireEvent.pointerDown(canvas(), { clientX: 200, clientY: 100, pointerId: 1 });

    expect(parsed().content.nodes.map((node: { id: string }) => node.id)).toContain("astro2");
  });

  it("places a tile left of and above everything else", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));

    // The old editor clamped this into the sheet's corner, stacking every such
    // click on the same spot. There is no corner now.
    fireEvent.pointerDown(canvas(), { clientX: -200, clientY: -90, pointerId: 1 });

    expect(parsed().content.nodes.at(-1)).toMatchObject({ id: "astro" });
    expect(parsed().layout.nodes.astro).toEqual({ x: -195, y: -91 });
    expect(parsed().layout.canvas, "placing a tile re-introduced a fixed frame").toBeUndefined();
  });

  it("places a tile dropped from the palette, whichever one is armed", () => {
    render(<EditorPage />);
    // Astro is the armed tile; the drop names Docker and must win.
    const stage = screen.getByTestId("diagram-stage");
    fireEvent.drop(stage, {
      clientX: 640,
      clientY: 420,
      dataTransfer: {
        getData: (type: string) => (type === "application/x-diagram-tile" ? "docker" : ""),
      },
    });

    expect(parsed().content.nodes.at(-1)).toMatchObject({ id: "docker", iconKey: "docker" });
    expect(parsed().layout.nodes.docker).toMatchObject({ x: 637 });
  });
});

describe("deleting a tile", () => {
  it("takes its edges with it", () => {
    render(<EditorPage />);
    clickTile(at("api").x, at("api").y);

    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().content.nodes.map((node: { id: string }) => node.id)).toEqual([
      "web",
      "db",
      "ci",
    ]);
    // Every seeded edge touched `api`, so every one of them goes with it.
    expect(parsed().content.edges).toHaveLength(0);
  });

  it("leaves no layout entry naming something that is gone", () => {
    render(<EditorPage />);
    clickTile(at("api").x, at("api").y);

    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().layout?.nodes ?? {}).not.toHaveProperty("api");
    expect(Object.keys(parsed().layout?.edges ?? {})).toHaveLength(0);
  });

  it("is unavailable in the toolbar until something is selected", () => {
    render(<EditorPage />);
    const bin = screen.getByRole("button", { name: /delete what is selected/i });
    expect(bin).toBeDisabled();

    clickTile(at("api").x, at("api").y);
    expect(screen.getByRole("button", { name: /delete what is selected/i })).toBeEnabled();
  });
});

describe("hitTestNode", () => {
  it("finds a node at its centre and within half a tile", () => {
    expect(hitTestNode(seed, at("api"))?.id).toBe("api");
    expect(hitTestNode(seed, { x: at("api").x + 30, y: at("api").y - 30 })?.id).toBe("api");
  });

  it("misses just outside the tile", () => {
    expect(hitTestNode(seed, { x: at("api").x + 32, y: at("api").y })).toBeUndefined();
  });

  it("returns nothing on empty canvas", () => {
    expect(hitTestNode(seed, NOWHERE)).toBeUndefined();
  });
});
