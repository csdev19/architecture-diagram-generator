import { fireEvent, render, screen, within } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_CONFIG } from "@diagram-tool/domain/schemas";
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
const parsed = () => JSON.parse(configText()) as typeof EXAMPLE_DIAGRAM_CONFIG;
const nodeById = (id: string) => parsed().nodes.find((node) => node.id === id);

/** Presses and releases on a tile, which is how a node gets selected. */
const clickTile = (x: number, y: number) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });
};

// Positions from the canonical example.
const HONO = { x: 350, y: 180 };
const USER = { x: 110, y: 180 };
const D1 = { x: 550, y: 180 };

beforeEach(stubScreenCTM);

describe("node inspector", () => {
  it("stays hidden until a tile is selected", () => {
    render(<EditorPage />);

    expect(screen.queryByRole("region", { name: /node hono/i })).not.toBeInTheDocument();
    expect(screen.getByText(/click a tile on the preview/i)).toBeInTheDocument();
  });

  it("opens on the node that was clicked", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);

    expect(screen.getByRole("region", { name: /node hono/i })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Hono");
    expect(screen.getByLabelText<HTMLInputElement>("Sublabel").value).toBe("http server");
  });

  it("writes a renamed node straight into the JSON", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hono v4" } });

    expect(nodeById("hono")?.name).toBe("Hono v4");
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

  it("darkens a tile", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("Tile"), { target: { value: "dark" } });

    expect(nodeById("hono")?.tile).toBe("dark");
  });

  it("reports an edit that breaks validation instead of blocking it", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(40) } });

    // The write landed, and the existing error channel explains the problem.
    expect(screen.getByRole("alert")).toHaveTextContent(/abbreviate/i);
  });

  it("closes on Deselect", () => {
    render(<EditorPage />);
    clickTile(HONO.x, HONO.y);
    fireEvent.click(screen.getByRole("button", { name: /deselect/i }));

    expect(screen.queryByRole("region", { name: /node hono/i })).not.toBeInTheDocument();
  });
});

describe("edge tools", () => {
  it("lists the edges the config already has", () => {
    render(<EditorPage />);
    const edges = within(screen.getByRole("region", { name: "Edges" }));

    expect(edges.getByText("user → hono")).toBeInTheDocument();
    expect(edges.getByText("hono → d1")).toBeInTheDocument();
  });

  it("edits an edge label", () => {
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText("Label 1"), { target: { value: "HTTP/2" } });

    expect(parsed().edges[0]?.label).toBe("HTTP/2");
  });

  it("switches an edge to dashed", () => {
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText("Style 2"), { target: { value: "dashed" } });

    expect(parsed().edges[1]?.style).toBe("dashed");
  });

  it("removes an edge", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /remove edge user to hono/i }));

    expect(parsed().edges).toHaveLength(1);
    expect(parsed().edges[0]).toMatchObject({ from: "hono", to: "d1" });
  });

  it("adds an edge from two tile clicks, facing sides inferred", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /add edge/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
    clickTile(USER.x, USER.y);
    expect(screen.getByRole("status")).toHaveTextContent(/from user/i);
    clickTile(D1.x, D1.y);

    expect(parsed().edges).toHaveLength(3);
    // User is left of D1, so the edge leaves the right and arrives on the left.
    expect(parsed().edges.at(-1)).toMatchObject({
      from: "user",
      to: "d1",
      out: "r",
      inn: "l",
    });
  });

  it("does not commit an edge from a node to itself", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /add edge/i }));
    clickTile(HONO.x, HONO.y);
    clickTile(HONO.x, HONO.y);

    expect(parsed().edges).toHaveLength(2);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("abandons the gesture on Cancel", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /add edge/i }));
    clickTile(USER.x, USER.y);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(parsed().edges).toHaveLength(2);
  });

  it("does not move a node while the add gesture is armed", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /add edge/i }));

    fireEvent.pointerDown(canvas(), { clientX: HONO.x, clientY: HONO.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });

    expect(nodeById("hono")).toMatchObject({ x: 350, y: 180 });
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
