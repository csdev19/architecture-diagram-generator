import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";

/**
 * The smoke test that proves the app's test rig works at all: React, jsdom, the
 * `@/` alias and `@diagram-tool/web-ui` resolving to one React instance.
 *
 * The textarea is found by its label rather than by a test id — wiring that
 * label is what makes this possible, and a label that comes loose is an
 * accessibility regression this test should fail on.
 */
describe("EditorPage", () => {
  it("seeds the textarea with the canonical example", () => {
    render(<EditorPage />);

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i);

    expect(textarea.value).toContain('"version": 2');
    expect(textarea.value).toContain('"title": "payments"');
    expect(textarea.value, "the seed lost its brand icons").toContain('"iconKey": "hono"');
    expect(textarea.value, "the seed should demonstrate a content-only document").not.toContain(
      '"layout"',
    );
  });

  it("renders the seeded diagram without reporting a problem", () => {
    render(<EditorPage />);

    expect(screen.getByText(/valid — the canvas is up to date/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the diagram and its size in the header", () => {
    render(<EditorPage />);

    expect(screen.getByText(/payments · 4 nodes · 3 edges/)).toBeInTheDocument();
  });

  it("offers both exports from the File menu once the document is valid", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));

    expect(screen.getByRole("menuitem", { name: /download svg/i })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /export png/i })).toBeEnabled();
  });

  it("collapses the JSON panel and offers to bring it back", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /hide json/i }));

    expect(screen.getByRole("button", { name: /show json/i })).toBeInTheDocument();
  });
});
