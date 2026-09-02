import { describe, expect, it } from "vitest";
import { DIAGRAM_GEOMETRY, DIAGRAM_LIMITS, BOUNDARY_TONES } from "../../constants/diagram";
import { DIAGRAM_ICON_KEYS } from "../../constants/diagram-icons";
import { FRAME_PADDING } from "../frame";
import { DIAGRAM_GUIDELINES } from "../guidelines";

/**
 * The guidelines are what a model reads before writing a config, so they must
 * describe the schema that will actually judge it. The limits are interpolated
 * rather than retyped; these tests guard that wiring, so a changed limit can
 * never leave the guidance stating the old one.
 */
describe("DIAGRAM_GUIDELINES", () => {
  it("states the limits the schema enforces", () => {
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_LIMITS.TEXT_MAX));
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_LIMITS.MAX_NODES));
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_LIMITS.MAX_BOUNDARIES));
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_LIMITS.MAX_EDGES));
    expect(DIAGRAM_GUIDELINES).toContain(String(FRAME_PADDING));
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_GEOMETRY.TILE_SIZE));
  });

  it("tells the author not to emit a canvas", () => {
    // The frame is derived, so a model that keeps declaring one re-imposes the
    // fixed sheet this was removed to get rid of.
    expect(DIAGRAM_GUIDELINES).toContain("Do NOT emit a `canvas`");
  });

  it("names every group tone the schema accepts", () => {
    for (const tone of Object.values(BOUNDARY_TONES)) {
      expect(DIAGRAM_GUIDELINES, `guidelines never mention the "${tone}" tone`).toContain(tone);
    }
  });

  it("names every icon key the schema accepts", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      expect(DIAGRAM_GUIDELINES, `guidelines never mention the "${key}" icon key`).toContain(key);
    }
  });

  it("explains that a node needs one of the two marks", () => {
    expect(DIAGRAM_GUIDELINES).toContain("iconKey");
    expect(DIAGRAM_GUIDELINES).toContain("emoji");
  });

  it("tells the model to return JSON and nothing else", () => {
    expect(DIAGRAM_GUIDELINES).toContain("ONLY the JSON");
  });

  it("carries the self-check that keeps configs valid on the first try", () => {
    expect(DIAGRAM_GUIDELINES).toContain("Check before answering");
  });

  it("leaves no unresolved interpolation", () => {
    expect(DIAGRAM_GUIDELINES).not.toContain("${");
    expect(DIAGRAM_GUIDELINES).not.toContain("undefined");
    expect(DIAGRAM_GUIDELINES).not.toContain("NaN");
  });
});
