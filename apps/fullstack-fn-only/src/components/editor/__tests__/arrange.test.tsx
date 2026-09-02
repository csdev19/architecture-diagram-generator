import { fireEvent, render, screen } from "@testing-library/react";
import { EXAMPLE_DIAGRAM_CONFIG } from "@diagram-tool/domain/schemas";
import { describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";
import { arrangeNodes } from "../use-diagram-editing";

const seed = () => JSON.stringify(EXAMPLE_DIAGRAM_CONFIG, null, 2);
const parse = (text: string) => JSON.parse(text) as typeof EXAMPLE_DIAGRAM_CONFIG;
const configText = () => screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i).value;

describe("arrangeNodes", () => {
  it("re-places every node", () => {
    const before = parse(seed());
    const after = parse(arrangeNodes(seed()));

    expect(after.nodes.map((node) => node.x)).not.toEqual(before.nodes.map((node) => node.x));
    // No frame to resize: the diagram is as big as what is on it, so moving
    // the nodes is the whole of what arranging does.
    expect(after.canvas).toBeUndefined();
  });

  it("writes coordinates without stamping schema defaults over the author's file", () => {
    const after = parse(arrangeNodes(seed()));
    const user = after.nodes.find((node) => node.id === "user");
    const group = after.groups[0];

    // `sub` was written by the author and survives; `tile`, `dashed` and
    // `filled` were never written and must not appear.
    expect(user).toHaveProperty("sub");
    expect(user).not.toHaveProperty("tile");
    expect(group).not.toHaveProperty("dashed");
    expect(group).not.toHaveProperty("filled");
    expect(after.edges[0]).not.toHaveProperty("style");
  });

  it("keeps the marks and names it found", () => {
    const after = parse(arrangeNodes(seed()));

    expect(after.nodes.find((node) => node.id === "hono")).toMatchObject({
      name: "Hono",
      iconKey: "hono",
    });
  });

  it("is a no-op on text that does not validate", () => {
    const broken = '{ "version": 1, oops';
    expect(arrangeNodes(broken)).toBe(broken);

    const invalid = JSON.stringify({ version: 1, canvas: { w: 700, h: 360 } }, null, 2);
    expect(arrangeNodes(invalid)).toBe(invalid);
  });
});

describe("the Arrange button", () => {
  it("rewrites the JSON in place", () => {
    render(<EditorPage />);
    const before = configText();

    fireEvent.click(screen.getByRole("button", { name: /arrange/i }));

    expect(configText()).not.toBe(before);
    expect(parse(configText()).nodes).toHaveLength(3);
  });

  it("is unavailable while the config does not validate", () => {
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText(/diagram config/i), { target: { value: "{ nope" } });

    expect(screen.getByRole("button", { name: /arrange/i })).toBeDisabled();
  });
});
