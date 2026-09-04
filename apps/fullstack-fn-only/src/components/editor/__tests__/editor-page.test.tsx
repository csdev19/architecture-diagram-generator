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

  it("keeps the document out of the header, so the pill cannot grow into the toolbar", () => {
    render(<EditorPage />);

    // The header used to carry the diagram's name and its counts, and a pill
    // that grows with its document reaches the centred toolbar and covers the
    // tools. The name lives in the inspector, where it can also be edited.
    expect(screen.queryByText(/payments · 4 nodes · 3 edges/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diagram editor" })).toBeInTheDocument();
  });

  it("signs the canvas at the bottom, clear of the tools", () => {
    render(<EditorPage />);

    const byline = screen.getByRole("link", { name: /built by csdev/i });

    expect(byline).toHaveAttribute("href", "https://cs19.dev");
    // Attribution sits with the zoom readout, not in the working row.
    expect(screen.getByRole("banner")).not.toContainElement(byline);
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
