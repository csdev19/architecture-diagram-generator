import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { EXAMPLE_DIAGRAM_DOCUMENT } from "@diagram-tool/domain/schemas";
import { clearNodeLayout } from "../edits/layout-edits";
import { EditorPage } from "../editor-page";

/** jsdom implements no SVG geometry, so a click can only reach the canvas
 * through a stubbed identity matrix: client coordinates then equal the
 * canvas's own. */
beforeEach(() => {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    writable: true,
    value: () => ({ a: 1, d: 1, e: 0, f: 0 }) as DOMMatrix,
  });
});

const documentText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i).value;
const parse = (text: string) => JSON.parse(text) as Record<string, any>;

const pinned = () =>
  JSON.stringify(
    {
      ...EXAMPLE_DIAGRAM_DOCUMENT,
      layout: { nodes: { web: { x: 0, y: 0 }, api: { x: 200, y: 0 } } },
    },
    null,
    2,
  );

describe("arranging", () => {
  it("hands placement back to auto-layout", () => {
    const after = parse(clearNodeLayout(pinned()));

    expect(after.layout?.nodes).toBeUndefined();
  });

  it("changes nothing about the architecture", () => {
    const after = parse(clearNodeLayout(pinned()));

    expect(after.content).toEqual(parse(pinned()).content);
  });

  it("keeps a boundary someone placed", () => {
    const withBoundary = JSON.stringify(
      {
        ...EXAMPLE_DIAGRAM_DOCUMENT,
        layout: {
          nodes: { web: { x: 0, y: 0 } },
          boundaries: { standalone: { x: 0, y: 0, w: 100, h: 100 } },
        },
      },
      null,
      2,
    );

    const after = parse(clearNodeLayout(withBoundary));

    // Arrange places tiles. A rectangle someone drew is not a placement it owns.
    expect(after.layout.boundaries.standalone).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("is a no-op when nothing is pinned", () => {
    const contentOnly = JSON.stringify(EXAMPLE_DIAGRAM_DOCUMENT, null, 2);

    expect(clearNodeLayout(contentOnly)).toBe(contentOnly);
  });

  it("is a no-op on text that does not parse", () => {
    const broken = '{ "version": 2, oops';

    expect(clearNodeLayout(broken)).toBe(broken);
  });
});

describe("the Arrange button", () => {
  it("takes the pinned positions back out of the JSON", () => {
    render(<EditorPage />);

    // Placing a tile settles the layout, so there is something to clear.
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.pointerDown(screen.getByTestId("diagram-canvas"), {
      clientX: 400,
      clientY: 300,
      button: 0,
    });

    expect(parse(documentText()).layout?.nodes).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /arrange/i }));

    expect(parse(documentText()).layout?.nodes).toBeUndefined();
  });

  it("is unavailable while the document does not validate", () => {
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText(/diagram document/i), { target: { value: "{ nope" } });

    expect(screen.getByRole("button", { name: /arrange/i })).toBeDisabled();
  });
});
