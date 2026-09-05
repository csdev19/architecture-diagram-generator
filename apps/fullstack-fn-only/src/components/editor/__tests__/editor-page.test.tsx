import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPage } from "../editor-page";

/**
 * What the export was handed, captured rather than rasterised.
 *
 * jsdom implements no canvas, so `downloadSvgAsPng` cannot run here — and it is
 * not the interesting half anyway. What each menu item asks the renderer for is,
 * and that is a string this can read.
 */
const exported: { svg: string; filename: string }[] = [];

vi.mock("@/lib/export-png", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export-png")>()),
  downloadSvgAsPng: (svg: string, filename: string) => {
    exported.push({ svg, filename });
    return Promise.resolve();
  },
}));

/** Opens the File menu and clicks one of its items. */
const chooseFileItem = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  // An exact string where the two PNG labels share a prefix: a regex that
  // matched "Export PNG 2" would find both and Testing Library would throw.
  fireEvent.click(screen.getByRole("menuitem", { name }));
};

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

  it("offers every export from the File menu once the document is valid", () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));

    expect(screen.getByRole("menuitem", { name: /download svg/i })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Export PNG 2×" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /transparent/i })).toBeEnabled();
  });

  describe("exporting a PNG", () => {
    beforeEach(() => {
      exported.length = 0;
      // A fixed clock, because a filename that carries the time is otherwise a
      // different string on every run.
      // Only `Date` is faked: freezing every timer would also freeze the ones
      // `waitFor` polls on, and the assertion would time out instead of running.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-05T14:23:45"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("paints the paper and the grid into the ordinary export", () => {
      render(<EditorPage />);

      chooseFileItem("Export PNG 2×");

      return waitFor(() => {
        expect(exported).toHaveLength(1);
        // Title, then when it was taken: two exports of the same diagram keep both.
        expect(exported[0]?.filename).toBe("payments-2026-09-05-1423@2x.png");
        // The grid is painted by a rect filled with the pattern, so its
        // reference is the tell that the background layer was drawn at all.
        expect(exported[0]?.svg).toContain("url(#diagram-grid)");
      });
    });

    it("leaves the paper and the grid out of a transparent export", () => {
      render(<EditorPage />);

      chooseFileItem(/transparent/i);

      return waitFor(() => {
        expect(exported).toHaveLength(1);
        // A different name, so exporting both does not overwrite one with the other.
        expect(exported[0]?.filename).toBe("payments-2026-09-05-1423@2x-transparent.png");
        // Paper and grid are one layer in the renderer, so dropping it drops both.
        expect(exported[0]?.svg).not.toContain("url(#diagram-grid)");
        // The drawing itself is untouched — this is a background switch, not a redraw.
        expect(exported[0]?.svg).toContain("<text");
      });
    });
  });

  it("collapses the JSON panel and offers to bring it back", () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /hide json/i }));

    expect(screen.getByRole("button", { name: /show json/i })).toBeInTheDocument();
  });

  describe("the diagram's title", () => {
    /** The field the panel offers, once nothing is selected. */
    const titleField = () => screen.getByLabelText<HTMLInputElement>(/^title$/i);

    it("writes what is typed into the document's content half", () => {
      render(<EditorPage />);
      fireEvent.click(screen.getByRole("tab", { name: /inspector/i }));

      fireEvent.change(titleField(), { target: { value: "checkout-flow" } });

      const text = screen.getByLabelText<HTMLTextAreaElement>(/diagram document/i).value;
      expect(JSON.parse(text).content.title).toBe("checkout-flow");
    });

    it("keeps the title to characters every filesystem accepts", () => {
      render(<EditorPage />);
      fireEvent.click(screen.getByRole("tab", { name: /inspector/i }));

      // A slash would make a path, a colon breaks on Windows, and a space is
      // what someone means by a hyphen when they are naming a file.
      fireEvent.change(titleField(), { target: { value: "API / DB: my flow!" } });

      expect(titleField().value).toBe("API-DB-my-flow");
    });

    it("trims a hyphen the field had to allow while it was being typed", () => {
      exported.length = 0;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-05T14:23:45"));
      render(<EditorPage />);
      fireEvent.click(screen.getByRole("tab", { name: /inspector/i }));

      // Typing " my flow " leaves hyphens on both ends. The field cannot strip
      // them — it would eat the hyphen in "my-flow" on the way through — so the
      // filename does.
      fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: " my flow " } });
      chooseFileItem("Export PNG 2\u00d7");

      return waitFor(() => {
        expect(exported[0]?.filename).toBe("my-flow-2026-09-05-1423@2x.png");
        vi.useRealTimers();
      });
    });

    it("names the export after the title the author chose", () => {
      exported.length = 0;
      // Only `Date` is faked: freezing every timer would also freeze the ones
      // `waitFor` polls on, and the assertion would time out instead of running.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-05T14:23:45"));
      render(<EditorPage />);
      fireEvent.click(screen.getByRole("tab", { name: /inspector/i }));

      fireEvent.change(titleField(), { target: { value: "checkout-flow" } });
      chooseFileItem("Export PNG 2\u00d7");

      return waitFor(() => {
        expect(exported[0]?.filename).toBe("checkout-flow-2026-09-05-1423@2x.png");
        vi.useRealTimers();
      });
    });
  });
});
