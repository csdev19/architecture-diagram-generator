import { fireEvent, render, screen, within } from "@testing-library/react";
import { EXAMPLE_RESOLVED_DIAGRAM } from "@diagram-tool/domain/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";
import { facingSides } from "../pointer-geometry";

const stubScreenCTM = () => {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    writable: true,
    value: () => ({ a: 1, d: 1, e: 0, f: 0 }) as DOMMatrix,
  });
};

const canvas = () => screen.getByTestId("diagram-canvas");
const configText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i).value;
const parsed = () => JSON.parse(configText()) as typeof EXAMPLE_RESOLVED_DIAGRAM;
const nodeById = (id: string) => parsed().nodes.find((node) => node.id === id);

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));
const panel = () => within(screen.getByRole("tabpanel"));

/** Presses and releases on a tile, which is how a node gets selected. */
const clickTile = (x: number, y: number) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });
};

const pickTool = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

// Positions from the canonical example.
const HONO = { x: 350, y: 180 };
const USER = { x: 110, y: 180 };
const D1 = { x: 550, y: 180 };

beforeEach(stubScreenCTM);

describe("node inspector", () => {
  it("says what to do until a tile is selected", () => {
    render(<EditorPage />);
    openTab(/inspector/i);

    expect(screen.queryByRole("region", { name: /node hono/i })).not.toBeInTheDocument();
    expect(screen.getByText(/click a tile on the canvas to edit it/i)).toBeInTheDocument();
  });

  it("offers the paper tone while nothing is selected", () => {
    render(<EditorPage />);
    openTab(/inspector/i);

    // The tone is part of the drawing, so choosing one rewrites the config —
    // it is not a chrome preference kept beside it.
    fireEvent.click(screen.getByRole("button", { name: "Legal pad" }));

    expect(parsed().background).toBe("cream");
    expect(screen.getByRole("button", { name: "Legal pad" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens on the node that was clicked", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);

    // Selecting a tile is what brings the inspector forward; no tab press.
    expect(screen.getByRole("region", { name: /node hono/i })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Hono");
    expect(screen.getByLabelText<HTMLInputElement>("Sub").value).toBe("http server");
  });

  it("writes a renamed node straight into the JSON", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hono v4" } });

    expect(nodeById("hono")?.name).toBe("Hono v4");
  });

  it("stops the name at the schema's own limit", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(40) } });

    // A labelled field enforces the limit it knows. The textarea stays the
    // place where anything at all can be written — and reported.
    expect(nodeById("hono")?.name).toHaveLength(26);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("moves a node from the coordinate fields", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("x"), { target: { value: "420" } });

    expect(nodeById("hono")).toMatchObject({ x: 420, y: 180 });
  });

  it("swaps an icon node to an emoji and back", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "" } });
    expect(nodeById("hono")).not.toHaveProperty("iconKey");
    // Seeded rather than left blank, so the config stays valid.
    expect(nodeById("hono")?.emoji).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "react" } });
    expect(nodeById("hono")?.iconKey).toBe("react");
    expect(nodeById("hono")).not.toHaveProperty("emoji");
  });

  it("offers the emoji field only while the node has no icon", () => {
    render(<EditorPage />);
    clickTile(USER.x, USER.y);
    expect(screen.getByLabelText("Emoji")).toBeInTheDocument();

    clickTile(HONO.x, HONO.y);
    expect(screen.queryByLabelText("Emoji")).not.toBeInTheDocument();
  });

  it("darkens a tile and counts the emphasis already spent", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.click(screen.getByRole("button", { name: /dark — emphasis/ }));

    expect(nodeById("hono")?.tile).toBe("dark");
    // `d1` is dark in the seed, and now so is `hono`.
    expect(screen.getByText(/2 dark tiles in this diagram/i)).toBeInTheDocument();
  });

  it("clears the selection when a press misses every tile", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    clickTile(60, 320);

    expect(screen.queryByRole("region", { name: /node hono/i })).not.toBeInTheDocument();
  });
});

describe("boundaries", () => {
  /** Drags a box out on the canvas, which is how a boundary is made. */
  const drawBox = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    pickTool(/drag a box around/i);
    fireEvent.pointerDown(canvas(), { clientX: from.x, clientY: from.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
  };

  it("draws a box and opens it in the inspector", () => {
    render(<EditorPage />);
    drawBox({ x: 200, y: 100 }, { x: 600, y: 400 });

    expect(parsed().boundaries).toHaveLength(2);
    expect(parsed().boundaries.at(-1)).toMatchObject({
      id: "boundary",
      label: "BOUNDARY",
      // Neutral until the author says what the boundary is.
      tone: "neutral",
      x: 195,
      y: 104,
      w: 403,
      h: 299,
    });
    expect(screen.getByRole("region", { name: /boundary boundary/i })).toBeInTheDocument();
  });

  it("takes the box either way the drag went", () => {
    render(<EditorPage />);
    drawBox({ x: 600, y: 400 }, { x: 200, y: 100 });

    expect(parsed().boundaries.at(-1)).toMatchObject({ x: 195, y: 104, w: 403, h: 299 });
  });

  it("ignores a drag too small to hold anything", () => {
    render(<EditorPage />);
    drawBox({ x: 200, y: 100 }, { x: 210, y: 110 });

    // A click that slipped is not a boundary.
    expect(parsed().boundaries).toHaveLength(1);
  });

  it("renames and re-tones from the inspector", () => {
    render(<EditorPage />);
    drawBox({ x: 200, y: 100 }, { x: 600, y: 400 });

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "DATA" } });
    fireEvent.click(screen.getByRole("button", { name: /external services and data/i }));

    expect(parsed().boundaries.at(-1)).toMatchObject({ label: "DATA", tone: "green" });
  });

  it("selects the boundary a press lands in, and the tile if there is one", () => {
    render(<EditorPage />);
    // The seed's CLOUDFLARE boundary spans 240,60 to 660,300 and holds Hono.
    clickTile(300, 100);
    expect(screen.getByRole("region", { name: /boundary cf/i })).toBeInTheDocument();

    // A tile inside it still wins: it is the smaller, more specific target.
    clickTile(HONO.x, HONO.y);
    expect(screen.getByRole("region", { name: /node hono/i })).toBeInTheDocument();
  });

  it("moves a boundary by dragging it, leaving the tiles inside where they were", () => {
    render(<EditorPage />);
    const honoBefore = nodeById("hono");

    fireEvent.pointerDown(canvas(), { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 340, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: 340, clientY: 160, pointerId: 1 });

    // Grabbed 60px into the box, so the corner keeps that offset, snapped.
    expect(parsed().boundaries[0]).toMatchObject({ x: 286, y: 117 });
    // A boundary is a box drawn around nodes, not a parent of them.
    expect(nodeById("hono")).toEqual(honoBefore);
  });

  it("deletes a boundary without taking the tiles inside it", () => {
    render(<EditorPage />);
    clickTile(300, 100);
    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().boundaries).toHaveLength(0);
    expect(parsed().nodes).toHaveLength(3);
  });
});

describe("edge tools", () => {
  it("lists the edges the config already has", () => {
    render(<EditorPage />);
    openTab(/edges/i);

    expect(panel().getByText("user → hono")).toBeInTheDocument();
    expect(panel().getByText("hono → d1")).toBeInTheDocument();
  });

  it("edits an edge label", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.change(screen.getByLabelText("Label 1"), { target: { value: "HTTP/2" } });

    expect(parsed().edges[0]?.label).toBe("HTTP/2");
  });

  it("switches an edge to dashed and back", () => {
    render(<EditorPage />);
    openTab(/edges/i);

    fireEvent.click(screen.getByRole("button", { name: "Edge 2 style" }));
    expect(parsed().edges[1]?.style).toBe("dashed");

    fireEvent.click(screen.getByRole("button", { name: "Edge 2 style" }));
    expect(parsed().edges[1]?.style).toBe("solid");
  });

  it("re-anchors an edge", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.change(screen.getByLabelText("Out 1"), { target: { value: "b" } });

    expect(parsed().edges[0]?.out).toBe("b");
  });

  it("removes an edge", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.click(screen.getByRole("button", { name: /remove edge user to hono/i }));

    expect(parsed().edges).toHaveLength(1);
    expect(parsed().edges[0]).toMatchObject({ from: "hono", to: "d1" });
  });

  it("adds an edge from two tile clicks, facing sides inferred", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);

    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
    clickTile(USER.x, USER.y);
    expect(screen.getByRole("status")).toHaveTextContent(/now click the target tile/i);
    clickTile(D1.x, D1.y);

    expect(parsed().edges).toHaveLength(3);
    // User is left of D1, so the edge leaves the right and arrives on the left.
    expect(parsed().edges.at(-1)).toMatchObject({
      from: "user",
      to: "d1",
      out: "r",
      inn: "l",
    });
    // And the panel shows the list the new edge just joined.
    expect(panel().getByText("user → d1")).toBeInTheDocument();
  });

  it("does not commit an edge from a node to itself", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);
    clickTile(HONO.x, HONO.y);
    clickTile(HONO.x, HONO.y);

    expect(parsed().edges).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/now click the target tile/i);
  });

  it("abandons the gesture on Escape", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);
    clickTile(USER.x, USER.y);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
    expect(parsed().edges).toHaveLength(2);
  });

  it("does not move a node while the edge tool is chosen", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);

    fireEvent.pointerDown(canvas(), { clientX: HONO.x, clientY: HONO.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });

    expect(nodeById("hono")).toMatchObject({ x: 350, y: 180 });
  });
});

describe("tool shortcuts", () => {
  it("picks a tool by its number, and says what it does", () => {
    render(<EditorPage />);

    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByRole("status")).toHaveTextContent(/drag to move around/i);

    fireEvent.keyDown(window, { key: "4" });
    expect(screen.getByRole("status")).toHaveTextContent(/drag a box around the tiles/i);

    fireEvent.keyDown(window, { key: "5" });
    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
  });

  it("leaves a number alone while a field has the focus", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText(/diagram config/i);

    fireEvent.keyDown(textarea, { key: "2" });

    expect(screen.getByRole("status")).toHaveTextContent(/drag a tile from the palette/i);
  });
});

describe("facingSides", () => {
  it("prefers horizontal anchors", () => {
    expect(facingSides({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ out: "r", inn: "l" });
    expect(facingSides({ x: 100, y: 0 }, { x: 0, y: 0 })).toEqual({ out: "l", inn: "r" });
  });

  it("falls back to vertical when the gap is mostly vertical", () => {
    expect(facingSides({ x: 0, y: 0 }, { x: 10, y: 200 })).toEqual({ out: "b", inn: "t" });
    expect(facingSides({ x: 0, y: 200 }, { x: 10, y: 0 })).toEqual({ out: "t", inn: "b" });
  });

  it("breaks a tie horizontally, because a bottom anchor draws a longer line", () => {
    expect(facingSides({ x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ out: "r", inn: "l" });
  });
});
