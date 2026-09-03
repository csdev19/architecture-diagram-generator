import { describe, expect, it } from "vitest";
import { facingSides } from "../anchors";

describe("facingSides", () => {
  it("faces horizontally when the target is mostly left or right", () => {
    expect(facingSides({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ out: "r", inn: "l" });
    expect(facingSides({ x: 100, y: 0 }, { x: 0, y: 0 })).toEqual({ out: "l", inn: "r" });
  });

  it("faces vertically when the target is mostly above or below", () => {
    expect(facingSides({ x: 0, y: 0 }, { x: 10, y: 200 })).toEqual({ out: "b", inn: "t" });
    expect(facingSides({ x: 0, y: 200 }, { x: 10, y: 0 })).toEqual({ out: "t", inn: "b" });
  });

  it("prefers a horizontal pair on the diagonal", () => {
    // A bottom anchor has to drop past the node's text block before it can
    // turn, so an exact diagonal reads better routed sideways.
    expect(facingSides({ x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ out: "r", inn: "l" });
  });
});
