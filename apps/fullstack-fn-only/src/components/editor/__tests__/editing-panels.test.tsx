import { fireEvent, render, screen, within } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_DOCUMENT, diagramDocumentSchema } from "@diagram-tool/domain/schemas";
import { DIAGRAM_SKETCH_PROMPT, resolveDiagram } from "@diagram-tool/domain/render";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * Picks one element rather than the group it belongs to.
 *
 * Everything in the seed is grouped, and a single click selects the outermost
 * group — so reaching an element means entering its group first, which is what
 * a double-click does.
 */
const selectInside = ({ x, y }: { x: number; y: number }) => {
  clickAt({ x, y });
  fireEvent.doubleClick(canvas(), { clientX: x, clientY: y });
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
    selectInside(at("api"));

    // Selecting a tile is what brings the inspector forward; no tab press.
    expect(screen.getByRole("region", { name: /node api/i })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("API");
    expect(screen.getByLabelText<HTMLInputElement>("Sub").value).toBe("http server");
  });

  it("writes a renamed node into content, and nowhere else", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    const before = parsed().layout;

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gateway" } });

    expect(nodeById("api")?.name).toBe("Gateway");
    expect(parsed().layout).toEqual(before);
  });

  it("stops the name at the schema's own limit", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(40) } });

    // A labelled field enforces the limit it knows. The textarea stays the
    // place where anything at all can be written — and reported.
    expect(nodeById("api")?.name).toHaveLength(26);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("swaps an icon node to an emoji and back", () => {
    render(<EditorPage />);
    selectInside(at("api"));

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
    selectInside(at("ci"));
    expect(screen.getByLabelText("Emoji")).toBeInTheDocument();

    selectInside(at("api"));
    expect(screen.queryByLabelText("Emoji")).not.toBeInTheDocument();
  });

  it("swaps a node to a monogram seeded from its own name", () => {
    render(<EditorPage />);
    selectInside(at("api"));

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "initials" } });

    // Seeded rather than left blank: an empty mark is a document the schema
    // rejects, and the author asked to change the mark, not to break the file.
    expect(nodeById("api")?.initials).toBe("AP");
    expect(nodeById("api")).not.toHaveProperty("iconKey");
    expect(nodeById("api")).not.toHaveProperty("emoji");
  });

  it("offers the initials field only while the node is a monogram", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    expect(screen.queryByLabelText("Initials")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "initials" } });
    expect(screen.getByLabelText("Initials")).toBeInTheDocument();
    expect(screen.queryByLabelText("Emoji")).not.toBeInTheDocument();
  });

  it("stops a monogram at the two characters the tile can hold", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    fireEvent.change(screen.getByLabelText("Mark"), { target: { value: "initials" } });

    fireEvent.change(screen.getByLabelText("Initials"), { target: { value: "STR" } });

    expect(nodeById("api")?.initials).toBe("ST");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("darkens a tile and counts the emphasis already spent", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    fireEvent.click(screen.getByRole("button", { name: /dark — emphasis/ }));

    expect(nodeById("api")?.tile).toBe("dark");
    // `db` is dark in the seed, and now so is `api`.
    expect(screen.getByText(/2 dark tiles in this diagram/i)).toBeInTheDocument();
  });

  it("clears the selection when a press misses every tile", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    clickAt(NOWHERE);

    expect(screen.queryByRole("region", { name: /node api/i })).not.toBeInTheDocument();
  });
});

describe("tile palette", () => {
  /** The palette card by its label, so no other button can answer to it. */
  const paletteCard = (name: RegExp) =>
    within(screen.getByRole("complementary", { name: /tiles/i })).getByRole("button", { name });

  it("places a monogram tile for a technology the registry has no logo for", () => {
    render(<EditorPage />);

    fireEvent.click(paletteCard(/custom/i));
    clickAt(NOWHERE);

    expect(nodeById("custom")?.initials).toBeTruthy();
    expect(nodeById("custom")).not.toHaveProperty("emoji");
    expect(nodeById("custom")).not.toHaveProperty("iconKey");
  });

  it("opens the placed monogram in the inspector, ready to be typed over", () => {
    render(<EditorPage />);

    fireEvent.click(paletteCard(/custom/i));
    clickAt(NOWHERE);

    expect(screen.getByLabelText("Initials")).toBeInTheDocument();
  });

  it("draws each brand mark through the renderer's own helper", () => {
    render(<EditorPage />);

    // The card is what the author is about to place, so it has to be the
    // renderer's mark and not a second drawing of it. The nested svg with the
    // mono viewBox is the helper's signature; a hand-rolled `<path>` has none.
    // `width`/`height` are the tell: the helper sets them from its placement,
    // and the React thumbnail this replaces never did.
    // Anchored on the label alone: the card's accessible name also carries its
    // trailing `iconKey: "hono"` debug line, so a full-string match would miss it.
    const card = paletteCard(/^hono /i);
    expect(card.querySelector('svg[width="22"][height="22"] > path')).not.toBeNull();
  });
});

describe("prompt panel", () => {
  /**
   * jsdom ships no clipboard. The stub records what a copy would have written,
   * which is the only thing worth asserting: the panel's whole job is putting
   * one specific string somewhere a person can paste it.
   */
  const stubClipboard = (writeText?: () => Promise<void>) => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeText ?? ((text: string) => (written.push(text), Promise.resolve())),
      },
    });
    return written;
  };

  /** Without this the stub outlives its test and every later one runs on it. */
  const removeClipboard = () => {
    Reflect.deleteProperty(navigator, "clipboard");
  };

  afterEach(removeClipboard);

  it("offers the prompt behind its own tab", () => {
    render(<EditorPage />);
    openTab(/prompt/i);

    expect(panel().getByRole("button", { name: /copy prompt/i })).toBeInTheDocument();
  });

  it("copies the sketch prompt rather than the document", async () => {
    const written = stubClipboard();
    render(<EditorPage />);
    openTab(/prompt/i);

    fireEvent.click(panel().getByRole("button", { name: /copy prompt/i }));
    await screen.findByRole("button", { name: /copied/i });

    expect(written[0]).toBe(DIAGRAM_SKETCH_PROMPT);
  });

  it("lets the button offer to copy again", async () => {
    stubClipboard();
    render(<EditorPage />);
    openTab(/prompt/i);

    fireEvent.click(panel().getByRole("button", { name: /copy prompt/i }));
    await screen.findByRole("button", { name: /copied/i });

    // Stuck on "Copied", a second copy gives no feedback at all and the author
    // cannot tell whether the click registered.
    await screen.findByRole("button", { name: /copy prompt/i }, { timeout: 3000 });
  });

  it("does not claim success when the browser exposes no clipboard", async () => {
    // On a plain-http origin `navigator.clipboard` is undefined. Optional
    // chaining made that resolve, so the button said "Copied" and the author
    // pasted whatever they had copied last.
    removeClipboard();
    render(<EditorPage />);
    openTab(/prompt/i);

    fireEvent.click(panel().getByRole("button", { name: /copy prompt/i }));

    await screen.findByRole("alert");
    expect(panel().queryByRole("button", { name: /copied/i })).not.toBeInTheDocument();
  });

  it("tells the reader how the generated JSON gets back into the editor", () => {
    // A prompt with no round trip is a dead end: the person has the JSON in a
    // chat window and no idea that the JSON tab is where it goes.
    render(<EditorPage />);
    openTab(/prompt/i);

    expect(panel().getByText(/JSON tab/i)).toBeInTheDocument();
  });

  it("leaves the document untouched — the panel only reads", () => {
    render(<EditorPage />);
    const before = documentText();
    openTab(/prompt/i);

    expect(documentText()).toBe(before);
  });
});

describe("side panel keyboard access", () => {
  it("reaches the Prompt tab with an arrow key", () => {
    // The tablist uses roving tabindex, so every inactive tab is skipped by
    // Tab. Without arrow handling the Prompt tab — the whole AI path — cannot
    // be opened without a mouse.
    render(<EditorPage />);
    const json = screen.getByRole("tab", { name: /json/i });
    json.focus();

    fireEvent.keyDown(json, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: /prompt/i })).toHaveAttribute("aria-selected", "true");
  });

  it("wraps from the last tab back to the first", () => {
    render(<EditorPage />);
    const edges = screen.getByRole("tab", { name: /edges/i });
    fireEvent.click(edges);
    edges.focus();

    fireEvent.keyDown(edges, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: /json/i })).toHaveAttribute("aria-selected", "true");
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
    selectInside(insideBoundary());

    expect(screen.getByRole("region", { name: /boundary cf/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Boundary width")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /loose/i }));

    // The size of a grouped boundary is a semantic choice, not a rectangle:
    // it is derived from what it frames, so there is nothing to drag.
    expect(boundaryById("cf")?.padding).toBe("loose");
    expect(parsed().layout?.boundaries?.cf).toBeUndefined();
  });

  it("selects the group a press lands in, and the element once it is entered", () => {
    render(<EditorPage />);

    // A press anywhere inside picks the whole group: it reads as one object.
    clickAt(insideBoundary());
    expect(screen.getByRole("region", { name: /group runtime/i })).toBeInTheDocument();

    // Entering it reaches the boundary itself…
    selectInside(insideBoundary());
    expect(screen.getByRole("region", { name: /boundary cf/i })).toBeInTheDocument();

    // …and a tile inside still wins over the boundary it sits in.
    clickAt(at("api"));
    expect(screen.getByRole("region", { name: /node api/i })).toBeInTheDocument();
  });

  it("deletes a boundary without taking the tiles inside it", () => {
    render(<EditorPage />);
    selectInside(insideBoundary());
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

    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByRole("status")).toHaveTextContent(/drag a box around the tiles/i);

    fireEvent.keyDown(window, { key: "4" });
    expect(screen.getByRole("status")).toHaveTextContent(/click the source tile/i);
  });

  it("has no fifth tool, because placing is the palette's job", () => {
    render(<EditorPage />);

    fireEvent.keyDown(window, { key: "5" });

    // Unchanged: `5` reaches nothing, and the hint still describes Select.
    expect(screen.getByRole("status")).toHaveTextContent(/drag a tile from the palette/i);
  });

  it("leaves a number alone while a field has the focus", () => {
    render(<EditorPage />);
    const textarea = screen.getByLabelText(/diagram document/i);

    fireEvent.keyDown(textarea, { key: "2" });

    expect(screen.getByRole("status")).toHaveTextContent(/drag a tile from the palette/i);
  });
});
