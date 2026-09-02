import { fireEvent, render, screen } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_DOCUMENT, diagramDocumentSchema } from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPage } from "../editor-page";

/**
 * The toaster lives in the app shell, which these tests do not render, so the
 * messages are captured here instead. A refused gesture that says nothing is
 * indistinguishable from a broken one, which is what this asserts.
 */
const toasted = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toasted.error, success: vi.fn() } }));

const stubScreenCTM = () => {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    writable: true,
    value: () => ({ a: 1, d: 1, e: 0, f: 0 }) as DOMMatrix,
  });
};

/** The seed as the editor draws it: `runtime` frames api + db, `pipeline` holds ci + web. */
const seed = resolveDiagram(diagramDocumentSchema.parse(EXAMPLE_DIAGRAM_DOCUMENT));

const at = (id: string) => {
  const node = seed.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`the seed has no "${id}" to aim at`);
  return { x: node.x, y: node.y };
};

const canvas = () => screen.getByTestId("diagram-canvas");
const documentText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i).value;
const parsed = () => JSON.parse(documentText()) as Record<string, any>;
const groups = () => parsed().content.groups as Array<{ id: string; members: string[] }>;

const clickAt = ({ x, y }: { x: number; y: number }, options: { shiftKey?: boolean } = {}) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1, ...options });
  fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, pointerId: 1, ...options });
};

/** Enters the group an element belongs to and selects the element itself. */
const selectInside = ({ x, y }: { x: number; y: number }) => {
  clickAt({ x, y });
  fireEvent.doubleClick(canvas(), { clientX: x, clientY: y });
};

const pressGroup = (shift = false) =>
  fireEvent.keyDown(window, { key: "g", metaKey: true, shiftKey: shift });

beforeEach(stubScreenCTM);

describe("grouping", () => {
  it("groups the selection with the keyboard", () => {
    render(<EditorPage />);

    // Both tiles live in `runtime`, so they are reached from inside it.
    selectInside(at("api"));
    clickAt(at("db"), { shiftKey: true });
    pressGroup();

    // Nested inside the parent rather than pulled out of it: a `runtime` left
    // holding only its boundary would have nothing to frame.
    const created = groups().at(-1);
    expect(created?.members.slice().sort()).toEqual(["api", "db"]);
    expect(groups().find((group) => group.id === "runtime")?.members).toEqual(["cf", created?.id]);
  });

  it("opens the new group in the inspector", () => {
    render(<EditorPage />);
    selectInside(at("api"));
    clickAt(at("db"), { shiftKey: true });
    pressGroup();

    expect(screen.getByRole("region", { name: /group group/i })).toBeInTheDocument();
  });

  it("says why a gesture was refused instead of doing nothing visible", () => {
    render(<EditorPage />);
    const before = documentText();
    toasted.error.mockClear();

    // One tile is not a group.
    selectInside(at("api"));
    pressGroup();

    expect(documentText()).toBe(before);
    expect(toasted.error).toHaveBeenCalledWith(expect.stringMatching(/at least two things/i));
  });

  it("refuses to put two boundaries in one group, and says so", () => {
    render(<EditorPage />);
    toasted.error.mockClear();

    // A second boundary, drawn well clear of everything.
    fireEvent.click(screen.getByRole("button", { name: /drag a box around/i }));
    fireEvent.pointerDown(canvas(), { clientX: -900, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: -500, clientY: 800, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: -500, clientY: 800, pointerId: 1 });

    // Select it, then shift-click the seeded one from inside its group.
    clickAt({ x: -700, y: 650 });
    selectInside({ x: (seed.boundaries[0]?.x ?? 0) + 8, y: (seed.boundaries[0]?.y ?? 0) + 8 });
    clickAt({ x: -700, y: 650 }, { shiftKey: true });
    pressGroup();

    expect(toasted.error).toHaveBeenCalledWith(expect.stringMatching(/at most one boundary/i));
  });

  it("gives the tiles back on ungroup, without moving them", () => {
    render(<EditorPage />);
    clickAt(at("ci"));

    expect(screen.getByRole("region", { name: /group pipeline/i })).toBeInTheDocument();
    pressGroup(true);

    expect(groups().some((group) => group.id === "pipeline")).toBe(false);
    // Ungrouping settles the layout first, so nothing on screen moves.
    expect(parsed().layout.nodes.ci).toEqual(at("ci"));
    expect(parsed().layout.nodes.web).toEqual(at("web"));
  });

  it("shows the members of the group that is selected", () => {
    render(<EditorPage />);
    clickAt(at("api"));

    const inspector = screen.getByRole("region", { name: /group runtime/i });
    expect(inspector).toHaveTextContent("CLOUDFLARE");
    expect(inspector).toHaveTextContent("API");
    expect(inspector).toHaveTextContent("D1");
  });

  it("takes a member out from the inspector", () => {
    render(<EditorPage />);
    clickAt(at("api"));

    fireEvent.click(screen.getByRole("button", { name: /remove d1 from runtime/i }));

    expect(groups().find((group) => group.id === "runtime")?.members).toEqual(["cf", "api"]);
  });

  it("moves every member of a group by the same delta", () => {
    render(<EditorPage />);
    const before = { api: at("api"), db: at("db"), web: at("web") };

    fireEvent.pointerDown(canvas(), { clientX: before.api.x, clientY: before.api.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), {
      clientX: before.api.x + 130,
      clientY: before.api.y + 65,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas(), {
      clientX: before.api.x + 130,
      clientY: before.api.y + 65,
      pointerId: 1,
    });

    for (const id of ["api", "db"] as const) {
      expect(parsed().layout.nodes[id]).toEqual({ x: before[id].x + 130, y: before[id].y + 65 });
    }
    expect(parsed().layout.nodes.web).toEqual(before.web);
  });
});

describe("the boundary tool", () => {
  const drawBox = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.click(screen.getByRole("button", { name: /drag a box around/i }));
    fireEvent.pointerDown(canvas(), { clientX: from.x, clientY: from.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
  };

  it("groups the tiles a drawn boundary encloses", () => {
    render(<EditorPage />);

    // A box around `ci` alone, which lives in `pipeline`.
    drawBox({ x: at("ci").x - 60, y: at("ci").y - 60 }, { x: at("ci").x + 60, y: at("ci").y + 60 });

    const created = groups().at(-1);
    expect(created?.members).toContain("ci");
    expect(created?.members).toContain("boundary");
    // Grouped, so the box is derived and carries no rectangle of its own.
    expect(parsed().layout?.boundaries?.boundary).toBeUndefined();
  });

  it("leaves a boundary drawn around nothing as a placed rectangle", () => {
    render(<EditorPage />);
    drawBox({ x: -900, y: 500 }, { x: -500, y: 800 });

    expect(groups().some((group) => group.members.includes("boundary"))).toBe(false);
    expect(parsed().layout.boundaries.boundary).toMatchObject({ w: 403, h: 299 });
  });
});
