import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorPage } from "../editor-page";

/**
 * The smoke test that proves the app's test rig works at all: React, jsdom, the
 * `@/` alias and `@diagram-tool/web-ui` resolving to one React instance.
 *
 * The textarea is found by its label rather than by a test id — wiring that
 * label in phase 0 is what makes this possible, and a label that comes loose is
 * an accessibility regression this test should fail on.
 */
describe("EditorPage", () => {
  it("seeds the textarea with the canonical example", () => {
    render(<EditorPage />);

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/diagram config/i);

    expect(textarea.value).toContain('"version": 1');
    expect(textarea.value, "the seed lost its brand icons").toContain('"iconKey": "hono"');
  });

  it("renders the seeded diagram without reporting a problem", () => {
    render(<EditorPage />);

    expect(screen.getByText(/valid — the preview is up to date/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers both exports once the config is valid", () => {
    render(<EditorPage />);

    expect(screen.getByRole("button", { name: /download svg/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export png/i })).toBeEnabled();
  });
});
