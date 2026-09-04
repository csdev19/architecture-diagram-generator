import { fireEvent, render, screen } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_DOCUMENT, diagramDocumentSchema } from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { beforeEach, describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";
import { hitTestNode } from "../pointer-geometry";
import { snapToGrid } from "../edits/edit-document";

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

/**
 * Picks the tile itself rather than the group it belongs to.
 *
 * Everything in the seed is grouped, and a single click selects the outermost
 * group — so reaching a tile means entering its group first, which is what a
 * double-click does.
 */
const selectTile = (id: string) => {
  const { x, y } = at(id);
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.doubleClick(canvas(), { clientX: x, clientY: y });
};

/** A press-move-release starting on a tile that has already been selected. */
const dragSelected = (id: string, to: { x: number; y: number }) => {
  const from = at(id);
  fireEvent.pointerDown(canvas(), { clientX: from.x, clientY: from.y, pointerId: 1 });
  fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
};

beforeEach(() => {
  stubScreenCTM();
});

describe("dragging a node", () => {
  it("writes the new coordinates into the editor's JSON", () => {
    render(<EditorPage />);
    selectTile("api");
    dragSelected("api", { x: 300, y: 260 });

    expect(positionIn(documentText(), "api")).toEqual({ x: 299, y: 260 });
  });

  it("snaps to the half-grid on the way", () => {
    render(<EditorPage />);
    selectTile("api");
    dragSelected("api", { x: 301, y: 197 });

    expect(positionIn(documentText(), "api")).toEqual({ x: 299, y: 195 });
  });

  it("keeps the grab offset instead of jumping the tile's centre to the pointer", () => {
    render(<EditorPage />);
    selectTile("api");

    const start = at("api");
    // Half a tile is 31, so 26 to the right is a press well off centre but
    // still inside the tile — and it is two whole grid cells, so the snap
    // cannot quietly absorb the difference the bug used to introduce.
    const grab = { x: start.x + 26, y: start.y };
    const to = { x: grab.x + 130, y: grab.y + 130 };

    fireEvent.pointerDown(canvas(), { clientX: grab.x, clientY: grab.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });

    // The tile travels exactly as far as the pointer did, and no further.
    expect(positionIn(documentText(), "api")).toEqual({
      x: snapToGrid(start.x + 130),
      y: snapToGrid(start.y + 130),
    });
  });

  it("leaves the architecture completely alone", () => {
    render(<EditorPage />);
    const before = documentText();
    selectTile("api");
    dragSelected("api", { x: 300, y: 260 });

    expect(JSON.parse(documentText()).content).toEqual(JSON.parse(before).content);
    expect(nodeIn(documentText(), "api")).not.toHaveProperty("x");
  });

  it("leaves every other tile exactly where it was drawn", () => {
    render(<EditorPage />);
    selectTile("api");
    dragSelected("api", { x: 300, y: 260 });

    // Dragging one tile settles the rest rather than re-flowing them: pinning
    // one node is enough to change what auto-layout would do with the others.
    for (const id of ["web", "db", "ci"]) {
      expect(positionIn(documentText(), id), `"${id}" moved`).toEqual(at(id));
    }
  });

  it("moves a whole group when the press picks one", () => {
    render(<EditorPage />);
    // `api` and `db` share the `runtime` group, so a plain press picks the
    // group and both travel by the same delta.
    // 130 snaps to 130 exactly, so the delta is the one the drag asked for.
    drag(at("api"), { x: at("api").x + 130, y: at("api").y + 130 });

    const moved = positionIn(documentText(), "db");
    expect(moved).toEqual({ x: at("db").x + 130, y: at("db").y + 130 });
    // Nothing outside the group went with it.
    expect(positionIn(documentText(), "web")).toEqual(at("web"));
  });

  it("takes a node anywhere, negative coordinates included", () => {
    render(<EditorPage />);
    // Nothing clamps: there is no frame to stay inside, so the drag lands
    // exactly where it was released, snapped to the grid and no further.
    selectTile("api");
    dragSelected("api", { x: -400, y: -400 });

    expect(positionIn(documentText(), "api")).toEqual({ x: -403, y: -403 });
  });

  it("takes a node far past where the diagram used to end", () => {
    render(<EditorPage />);
    selectTile("api");
    dragSelected("api", { x: 2000, y: 2000 });

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
    expect(documentText()).not.toBe(before);

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
  it("selects the group a pressed tile belongs to", () => {
    render(<EditorPage />);
    fireEvent.pointerDown(canvas(), { clientX: at("api").x, clientY: at("api").y, pointerId: 1 });

    // A group reads as one object: pressing any part of it picks the whole.
    expect(canvas()).toHaveAttribute("data-selected-group", "runtime");
    expect(canvas()).not.toHaveAttribute("data-selected-node");
  });

  it("selects the tile itself once its group has been entered", () => {
    render(<EditorPage />);
    selectTile("api");

    expect(canvas()).toHaveAttribute("data-selected-node", "api");
  });

  it("adds to the selection on shift-click", () => {
    render(<EditorPage />);
    selectTile("api");
    fireEvent.pointerDown(canvas(), {
      clientX: at("db").x,
      clientY: at("db").y,
      pointerId: 1,
      shiftKey: true,
    });

    expect(canvas()).toHaveAttribute("data-selected-node", "api db");
  });

  it("clears the selection when the press misses every tile", () => {
    render(<EditorPage />);
    selectTile("api");
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
    selectTile("api");

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
    selectTile("api");

    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().layout?.nodes ?? {}).not.toHaveProperty("api");
    expect(Object.keys(parsed().layout?.edges ?? {})).toHaveLength(0);
  });

  it("is unavailable in the toolbar until something is selected", () => {
    render(<EditorPage />);
    const bin = screen.getByRole("button", { name: /delete what is selected/i });
    expect(bin).toBeDisabled();

    selectTile("api");
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

/**
 * The injected scene must be the *same DOM node* from one render to the next.
 *
 * Nothing on screen depends on this, which is why it went unnoticed: the markup
 * is identical either way. What depends on it is the browser's own synthesis of
 * `click` and `dblclick`, which it derives from the press and the release
 * sharing a live target. Replacing the `<svg>` between them detaches the
 * element the press landed on, and Chrome then fires neither — so double-click
 * to enter a group silently did nothing, while every jsdom test passed because
 * `fireEvent.doubleClick` dispatches the event itself instead of earning it.
 *
 * React 19 compares the `dangerouslySetInnerHTML` *object* by identity and
 * writes `innerHTML` whenever it differs, without looking at the string inside.
 * A fresh `{ __html }` literal per render therefore rebuilds the whole scene on
 * every keystroke, hover and selection.
 */
describe("the injected scene", () => {
  it("survives a re-render, so the browser can still synthesise a click", () => {
    render(<EditorPage />);
    const before = canvas().querySelector("svg");

    const { x, y } = at("api");
    fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });

    expect(canvas().querySelector("svg")).toBe(before);
  });
});
