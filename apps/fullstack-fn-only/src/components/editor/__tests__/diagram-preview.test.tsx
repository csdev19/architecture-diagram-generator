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
const nodeIn = (text: string, id: string) =>
  (JSON.parse(text) as typeof EXAMPLE_DIAGRAM_CONFIG).nodes.find((node) => node.id === id);

/** A full press-move-release over the canvas, in viewBox coordinates. */
const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
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

  it("does nothing while the config does not validate", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i);
    fireEvent.change(textarea, { target: { value: "{ not json" } });

    // There is no canvas to drag on at all, which is the affordance working.
    expect(screen.queryByTestId("diagram-canvas")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
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
    fireEvent.pointerDown(canvas(), { clientX: 350, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: 350, clientY: 180, pointerId: 1 });
    fireEvent.pointerDown(canvas(), { clientX: 60, clientY: 320, pointerId: 1 });

    expect(canvas()).not.toHaveAttribute("data-selected-node");
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
