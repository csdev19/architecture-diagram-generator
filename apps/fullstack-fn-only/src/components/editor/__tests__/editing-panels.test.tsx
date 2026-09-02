import { fireEvent, render, screen, within } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_DOCUMENT, diagramDocumentSchema } from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { beforeEach, describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";

const stubScreenCTM = () => {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    writable: true,
    value: () => ({ a: 1, d: 1, e: 0, f: 0 }) as DOMMatrix,
  });
};

/**
 * The seed as the editor draws it.
 *
 * It is a content-only document, so every coordinate below is auto-layout's
 * answer rather than a number someone wrote. Addressing tiles through the
 * resolved diagram keeps these tests about the panels rather than about the
 * layout algorithm.
 */
const seed = resolveDiagram(diagramDocumentSchema.parse(EXAMPLE_DIAGRAM_DOCUMENT));

const at = (id: string) => {
  const node = seed.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`the seed has no "${id}" to aim at`);
  return { x: node.x, y: node.y };
};

/** A point inside the seed's CLOUDFLARE box but on none of its tiles. */
const insideBoundary = () => {
  const cf = seed.boundaries[0];
  if (!cf) throw new Error("the seed lost its boundary");
  return { x: cf.x + 8, y: cf.y + 8 };
};

/** A point on empty canvas, well clear of everything the seed draws. */
const NOWHERE = { x: -600, y: 600 };

const canvas = () => screen.getByTestId("diagram-canvas");
const documentText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i).value;
const parsed = () => JSON.parse(documentText()) as Record<string, any>;
const nodeById = (id: string) =>
  parsed().content.nodes.find((node: { id: string }) => node.id === id);
const boundaryById = (id: string) =>
  parsed().content.boundaries.find((boundary: { id: string }) => boundary.id === id);

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));
const panel = () => within(screen.getByRole("tabpanel"));

/** Presses and releases on a point, which is how something gets selected. */
const clickAt = ({ x, y }: { x: number; y: number }) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1 });
};

const pickTool = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(stubScreenCTM);

describe("node inspector", () => {
  it("says what to do until a tile is selected", () => {
    render(<EditorPage />);
    openTab(/inspector/i);

    expect(screen.queryByRole("region", { name: /node api/i })).not.toBeInTheDocument();
    expect(screen.getByText(/click a tile on the canvas to edit it/i)).toBeInTheDocument();
  });

  it("offers the paper tone while nothing is selected", () => {
    render(<EditorPage />);
    openTab(/inspector/i);

    // The tone is part of the drawing, so choosing one rewrites the document —
    // and it lands in `content`, because arranging must never lose it.
    fireEvent.click(screen.getByRole("button", { name: "Legal pad" }));

    expect(parsed().content.background).toBe("cream");
    expect(screen.getByRole("button", { name: "Legal pad" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens on the node that was clicked", () => {
    render(<EditorPage />);
    clickAt(at("api"));

    // Selecting a tile is what brings the inspector forward; no tab press.
    expect(screen.getByRole("region", { name: /node api/i })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("API");
    expect(screen.getByLabelText<HTMLInputElement>("Sub").value).toBe("http server");
  });

  it("writes a renamed node into content, and nowhere else", () => {
    render(<EditorPage />);
    clickAt(at("api"));
    const before = parsed().layout;

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gateway" } });

    expect(nodeById("api")?.name).toBe("Gateway");
    expect(parsed().layout).toEqual(before);
  });

  it("stops the name at the schema's own limit", () => {
    render(<EditorPage />);
    clickAt(at("api"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(40) } });

    // A labelled field enforces the limit it knows. The textarea stays the
    // place where anything at all can be written — and reported.
    expect(nodeById("api")?.name).toHaveLength(26);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("swaps an icon node to an emoji and back", () => {
    render(<EditorPage />);
    clickAt(at("api"));

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "" } });
    expect(nodeById("api")).not.toHaveProperty("iconKey");
    // Seeded rather than left blank, so the document stays valid.
    expect(nodeById("api")?.emoji).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "react" } });
    expect(nodeById("api")?.iconKey).toBe("react");
    expect(nodeById("api")).not.toHaveProperty("emoji");
  });

  it("offers the emoji field only while the node has no icon", () => {
    render(<EditorPage />);
    clickAt(at("ci"));
    expect(screen.getByLabelText("Emoji")).toBeInTheDocument();

    clickAt(at("api"));
    expect(screen.queryByLabelText("Emoji")).not.toBeInTheDocument();
  });

  it("darkens a tile and counts the emphasis already spent", () => {
    render(<EditorPage />);
    clickAt(at("api"));
    fireEvent.click(screen.getByRole("button", { name: /dark — emphasis/ }));

    expect(nodeById("api")?.tile).toBe("dark");
    // `db` is dark in the seed, and now so is `api`.
    expect(screen.getByText(/2 dark tiles in this diagram/i)).toBeInTheDocument();
  });

  it("clears the selection when a press misses every tile", () => {
    render(<EditorPage />);
    clickAt(at("api"));
    clickAt(NOWHERE);

    expect(screen.queryByRole("region", { name: /node api/i })).not.toBeInTheDocument();
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

  const EMPTY_BOX = { from: { x: -900, y: 500 }, to: { x: -500, y: 800 } };

  it("draws a box and opens it in the inspector", () => {
    render(<EditorPage />);
    drawBox(EMPTY_BOX.from, EMPTY_BOX.to);

    expect(parsed().content.boundaries).toHaveLength(2);
    expect(parsed().content.boundaries.at(-1)).toMatchObject({
      id: "boundary",
      label: "BOUNDARY",
      // Neutral until the author says what the boundary is.
      tone: "neutral",
    });
    // A box drawn on its own belongs to no group, so it carries its rectangle.
    expect(parsed().layout.boundaries.boundary).toMatchObject({ w: 403, h: 299 });
    expect(screen.getByRole("region", { name: /boundary boundary/i })).toBeInTheDocument();
  });

  it("takes the box either way the drag went", () => {
    render(<EditorPage />);
    drawBox(EMPTY_BOX.to, EMPTY_BOX.from);

    expect(parsed().layout.boundaries.boundary).toMatchObject({ w: 403, h: 299 });
  });

  it("ignores a drag too small to hold anything", () => {
    render(<EditorPage />);
    drawBox({ x: -900, y: 500 }, { x: -890, y: 510 });

    // A click that slipped is not a boundary.
    expect(parsed().content.boundaries).toHaveLength(1);
  });

  it("renames and re-tones from the inspector", () => {
    render(<EditorPage />);
    drawBox(EMPTY_BOX.from, EMPTY_BOX.to);

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "DATA" } });
    fireEvent.click(screen.getByRole("button", { name: /external services and data/i }));

    expect(parsed().content.boundaries.at(-1)).toMatchObject({ label: "DATA", tone: "green" });
  });

  it("offers a rectangle for a boundary that was placed", () => {
    render(<EditorPage />);
    drawBox(EMPTY_BOX.from, EMPTY_BOX.to);

    fireEvent.change(screen.getByLabelText("Boundary width"), { target: { value: "500" } });

    expect(parsed().layout.boundaries.boundary).toMatchObject({ w: 500 });
    expect(screen.queryByRole("group", { name: /padding/i })).not.toBeInTheDocument();
  });

  it("offers padding instead of a rectangle for a boundary that frames a group", () => {
    render(<EditorPage />);
    clickAt(insideBoundary());

    expect(screen.getByRole("region", { name: /boundary cf/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Boundary width")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /loose/i }));

    // The size of a grouped boundary is a semantic choice, not a rectangle:
    // it is derived from what it frames, so there is nothing to drag.
    expect(boundaryById("cf")?.padding).toBe("loose");
    expect(parsed().layout?.boundaries?.cf).toBeUndefined();
  });

  it("selects the boundary a press lands in, and the tile if there is one", () => {
    render(<EditorPage />);
    clickAt(insideBoundary());
    expect(screen.getByRole("region", { name: /boundary cf/i })).toBeInTheDocument();

    // A tile inside it still wins: it is the smaller, more specific target.
    clickAt(at("api"));
    expect(screen.getByRole("region", { name: /node api/i })).toBeInTheDocument();
  });

  it("deletes a boundary without taking the tiles inside it", () => {
    render(<EditorPage />);
    clickAt(insideBoundary());
    fireEvent.keyDown(window, { key: "Delete" });

    expect(parsed().content.boundaries).toHaveLength(0);
    expect(parsed().content.nodes).toHaveLength(4);
    // The group survives: those tiles still belong together, they have just
    // stopped being fenced.
    expect(parsed().content.groups).toHaveLength(2);
  });
});

describe("edge tools", () => {
  it("lists the edges the document already has", () => {
    render(<EditorPage />);
    openTab(/edges/i);

    expect(panel().getByText("web → api")).toBeInTheDocument();
    expect(panel().getByText("api → db")).toBeInTheDocument();
  });

  it("edits an edge label", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.change(screen.getByLabelText("Label 1"), { target: { value: "HTTP/2" } });

    expect(parsed().content.edges[0]?.label).toBe("HTTP/2");
  });

  it("switches an edge to dashed and back", () => {
    render(<EditorPage />);
    openTab(/edges/i);

    fireEvent.click(screen.getByRole("button", { name: "Edge 2 style" }));
    expect(parsed().content.edges[1]?.style).toBe("dashed");

    fireEvent.click(screen.getByRole("button", { name: "Edge 2 style" }));
    expect(parsed().content.edges[1]?.style).toBe("solid");
  });

  it("re-anchors an edge into layout, leaving the relation alone", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.change(screen.getByLabelText("Out 1"), { target: { value: "b" } });

    // Which side a line leaves is composition, so it belongs in layout — the
    // edge in `content` still says only what connects to what.
    expect(parsed().layout.edges["web-api"]).toMatchObject({ out: "b" });
    expect(parsed().content.edges[0]).not.toHaveProperty("out");
  });

  it("removes an edge", () => {
    render(<EditorPage />);
    openTab(/edges/i);
    fireEvent.click(screen.getByRole("button", { name: /remove edge web to api/i }));

    expect(parsed().content.edges).toHaveLength(2);
    expect(parsed().content.edges[0]).toMatchObject({ from: "api", to: "db" });
  });

  it("adds an edge from two tile clicks, facing sides inferred", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);

    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
    clickAt(at("web"));
    expect(screen.getByRole("status")).toHaveTextContent(/now click the target tile/i);
    clickAt(at("db"));

    expect(parsed().content.edges).toHaveLength(4);
    expect(parsed().content.edges.at(-1)).toMatchObject({ from: "web", to: "db" });
    // Web is left of D1, so the line leaves the right and arrives on the left.
    expect(parsed().layout.edges["web-db"]).toEqual({ out: "r", inn: "l" });
    expect(panel().getByText("web → db")).toBeInTheDocument();
  });

  it("does not commit an edge from a node to itself", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);
    clickAt(at("api"));
    clickAt(at("api"));

    expect(parsed().content.edges).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent(/now click the target tile/i);
  });

  it("abandons the gesture on Escape", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);
    clickAt(at("web"));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
    expect(parsed().content.edges).toHaveLength(3);
  });

  it("does not move a node while the edge tool is chosen", () => {
    render(<EditorPage />);
    pickTool(/connect them/i);

    fireEvent.pointerDown(canvas(), { clientX: at("api").x, clientY: at("api").y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 500, clientY: 300, pointerId: 1 });

    expect(parsed().layout?.nodes?.api).toBeUndefined();
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
    const textarea = screen.getByLabelText(/diagram document/i);

    fireEvent.keyDown(textarea, { key: "2" });

    expect(screen.getByRole("status")).toHaveTextContent(/drag a tile from the palette/i);
  });
});
