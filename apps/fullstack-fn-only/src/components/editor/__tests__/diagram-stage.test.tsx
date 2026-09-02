import { fireEvent, render, screen } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_CONFIG, diagramConfigSchema } from "@diagram-tool/domain/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";
import { hitTestNode } from "../pointer-geometry";

const config = diagramConfigSchema.parse(EXAMPLE_DIAGRAM_CONFIG);

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
const configText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i).value;
const parsed = () => JSON.parse(configText()) as typeof EXAMPLE_DIAGRAM_CONFIG;
const nodeIn = (text: string, id: string) =>
  (JSON.parse(text) as typeof EXAMPLE_DIAGRAM_CONFIG).nodes.find((node) => node.id === id);

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
    // Hono starts at (350, 180) in the canonical example.
    drag({ x: 350, y: 180 }, { x: 300, y: 260 });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: 299, y: 260 });
  });

  it("snaps to the half-grid on the way", () => {
    render(<EditorPage />);
    drag({ x: 350, y: 180 }, { x: 301, y: 197 });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: 299, y: 195 });
  });

  it("leaves every other node where it was", () => {
    render(<EditorPage />);
    const before = configText();
    drag({ x: 350, y: 180 }, { x: 300, y: 260 });

    expect(nodeIn(configText(), "user")).toEqual(nodeIn(before, "user"));
    expect(nodeIn(configText(), "d1")).toEqual(nodeIn(before, "d1"));
  });

  it("takes a node anywhere, negative coordinates included", () => {
    render(<EditorPage />);
    // Nothing clamps: there is no frame to stay inside, so the drag lands
    // exactly where it was released, snapped to the grid and no further.
    drag({ x: 350, y: 180 }, { x: -400, y: -400 });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: -403, y: -403 });
  });

  it("takes a node far past where the diagram used to end", () => {
    render(<EditorPage />);
    drag({ x: 350, y: 180 }, { x: 2000, y: 2000 });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: 2002, y: 2002 });
  });

  it("ignores a press that lands on empty canvas", () => {
    render(<EditorPage />);
    const before = configText();
    // (60, 320) is inside the canvas but on no tile.
    drag({ x: 60, y: 320 }, { x: 200, y: 320 });

    expect(configText()).toBe(before);
  });

  it("puts the node back when Escape cancels the drag", () => {
    render(<EditorPage />);
    const before = configText();

    fireEvent.pointerDown(canvas(), { clientX: 350, clientY: 180, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });
    expect(nodeIn(configText(), "hono")).not.toMatchObject({ x: 350, y: 180 });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: 350, y: 180 });
    expect(configText()).toBe(before);
  });

  it("stops moving the node after Escape", () => {
    render(<EditorPage />);

    fireEvent.pointerDown(canvas(), { clientX: 350, clientY: 180, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerMove(canvas(), { clientX: 600, clientY: 320, pointerId: 1 });

    expect(nodeIn(configText(), "hono")).toMatchObject({ x: 350, y: 180 });
  });
});

describe("text that does not validate", () => {
  it("keeps drawing the last config that did, and lists the problems", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText(/diagram config/i);
    fireEvent.change(textarea, { target: { value: "{ not json" } });

    // Losing the picture at every half-typed keystroke is what makes a JSON
    // panel unusable, so the canvas holds the last good render.
    expect(screen.getByTestId("diagram-canvas")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/the canvas shows the last valid config/i)).toBeInTheDocument();
  });

  it("puts the last valid text back on Revert", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i);
    const before = textarea.value;

    fireEvent.change(textarea, { target: { value: "{ not json" } });
    fireEvent.click(screen.getByRole("button", { name: /revert/i }));

    expect(configText()).toBe(before);
  });
});

describe("selection", () => {
  it("selects the tile that was pressed", () => {
    render(<EditorPage />);
    fireEvent.pointerDown(canvas(), { clientX: 350, clientY: 180, pointerId: 1 });

    expect(canvas()).toHaveAttribute("data-selected-node", "hono");
  });

  it("clears the selection when the press misses every tile", () => {
    render(<EditorPage />);
    clickTile(350, 180);
    fireEvent.pointerDown(canvas(), { clientX: 60, clientY: 320, pointerId: 1 });

    expect(canvas()).not.toHaveAttribute("data-selected-node");
  });
});

describe("placing a tile", () => {
  it("places the palette's chosen tile where the sheet was clicked", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));
    fireEvent.pointerDown(canvas(), { clientX: 400, clientY: 260, pointerId: 1 });

    // Snapped to the half-grid, like every other write of a coordinate.
    expect(parsed().nodes.at(-1)).toMatchObject({
      id: "astro",
      iconKey: "astro",
      name: "Astro",
      x: 403,
      y: 260,
    });
  });

  it("gives the second tile of a kind an id of its own", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));
    fireEvent.pointerDown(canvas(), { clientX: 400, clientY: 260, pointerId: 1 });
    fireEvent.pointerDown(canvas(), { clientX: 200, clientY: 100, pointerId: 1 });

    expect(parsed().nodes.map((node) => node.id)).toContain("astro2");
  });

  it("places a tile left of and above everything else", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Astro/ }));

    // The old editor clamped this into the sheet's corner, stacking every such
    // click on the same spot. There is no corner now.
    fireEvent.pointerDown(canvas(), { clientX: -200, clientY: -90, pointerId: 1 });

    expect(parsed().nodes.at(-1)).toMatchObject({ id: "astro", x: -195, y: -91 });
    expect(parsed().canvas, "placing a tile re-introduced a fixed frame").toBeUndefined();
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

    expect(parsed().nodes.at(-1)).toMatchObject({ id: "docker", iconKey: "docker", x: 637 });
  });
});

describe("deleting a tile", () => {
  it("takes its edges with it", () => {
    render(<EditorPage />);
    clickTile(350, 180);

    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().nodes.map((node) => node.id)).toEqual(["user", "d1"]);
    // Both seeded edges touched hono, so both go.
    expect(parsed().edges).toHaveLength(0);
  });

  it("is unavailable in the toolbar until something is selected", () => {
    render(<EditorPage />);
    const bin = screen.getByRole("button", { name: /delete what is selected/i });
    expect(bin).toBeDisabled();

    clickTile(350, 180);
    expect(screen.getByRole("button", { name: /delete what is selected/i })).toBeEnabled();
  });
});

describe("hitTestNode", () => {
  it("finds a node at its centre and within half a tile", () => {
    expect(hitTestNode(config, { x: 350, y: 180 })?.id).toBe("hono");
    expect(hitTestNode(config, { x: 350 + 30, y: 180 - 30 })?.id).toBe("hono");
  });

  it("misses just outside the tile", () => {
    expect(hitTestNode(config, { x: 350 + 32, y: 180 })).toBeUndefined();
  });

  it("returns nothing on empty canvas", () => {
    expect(hitTestNode(config, { x: 60, y: 320 })).toBeUndefined();
  });
});
