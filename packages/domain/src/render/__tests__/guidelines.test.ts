import { describe, expect, it } from "vitest";
import { BOUNDARY_PADDINGS, BOUNDARY_TONES, DIAGRAM_LIMITS } from "../../constants/diagram";
import { DIAGRAM_ICON_KEYS } from "../../constants/diagram-icons";
import { DIAGRAM_GUIDELINES, DIAGRAM_SKETCH_PROMPT } from "../guidelines";

/**
 * The guidelines are what a model reads before writing a document, so they must
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
    expect(DIAGRAM_GUIDELINES).toContain(String(DIAGRAM_LIMITS.MAX_GROUPS));
  });

  it("tells the author to describe architecture and not geometry", () => {
    // The whole point of the split: a model that keeps emitting coordinates is
    // solving the one problem resolution exists to take off its hands.
    expect(DIAGRAM_GUIDELINES).toContain("Do NOT emit a `layout`");
    expect(DIAGRAM_GUIDELINES).toContain("There is no canvas to fit inside");
  });

  it("names every boundary padding the schema accepts", () => {
    for (const padding of Object.values(BOUNDARY_PADDINGS)) {
      expect(DIAGRAM_GUIDELINES, `guidelines never mention "${padding}" padding`).toContain(
        padding,
      );
    }
  });

  it("states the two rules that make a group resolvable", () => {
    expect(DIAGRAM_GUIDELINES).toContain("at most one boundary");
    expect(DIAGRAM_GUIDELINES).toContain("at least one node");
  });

  it("names every boundary tone the schema accepts", () => {
    for (const tone of Object.values(BOUNDARY_TONES)) {
      expect(DIAGRAM_GUIDELINES, `guidelines never mention the "${tone}" tone`).toContain(tone);
    }
  });

  it("names every icon key the schema accepts", () => {
    for (const key of DIAGRAM_ICON_KEYS) {
      expect(DIAGRAM_GUIDELINES, `guidelines never mention the "${key}" icon key`).toContain(key);
    }
  });

  it("explains that a node needs one of the three marks", () => {
    expect(DIAGRAM_GUIDELINES).toContain("iconKey");
    expect(DIAGRAM_GUIDELINES).toContain("initials");
    expect(DIAGRAM_GUIDELINES).toContain("emoji");
  });

  it("says when to reach for initials rather than an emoji", () => {
    // A model that is only told the field exists will never choose it: the
    // guidance has to name the case it beats an emoji at.
    expect(DIAGRAM_GUIDELINES).toContain("no logo");
    expect(DIAGRAM_GUIDELINES).toContain(`at most ${DIAGRAM_LIMITS.INITIALS_MAX} characters`);
  });

  it("tells the model to return JSON and nothing else", () => {
    expect(DIAGRAM_GUIDELINES).toContain("ONLY the JSON");
  });

  it("carries the self-check that keeps configs valid on the first try", () => {
    expect(DIAGRAM_GUIDELINES).toContain("Check before answering");
  });

  it("frames the dark tile as rare emphasis, not a quota to fill", () => {
    // "for only 2-3 key nodes" reads as a target count. Handed a three-node
    // sketch, a model made two of them dark — which emphasises nothing, and is
    // the rule being followed rather than broken.
    expect(DIAGRAM_GUIDELINES).toMatch(/usually none/i);
    expect(DIAGRAM_GUIDELINES).not.toMatch(/for only 2-3 key nodes/i);
  });

  it("gives the model a written word for every key it could not guess", () => {
    // A sketch says "Postgres"; the schema accepts "postgresql". If that
    // mapping is not in the text the model has to invent the key.
    expect(DIAGRAM_GUIDELINES).toContain("Postgres");
    expect(DIAGRAM_GUIDELINES).toContain("Node.js");
    expect(DIAGRAM_GUIDELINES).toContain("GH Actions");
  });

  it("leaves no unresolved interpolation", () => {
    expect(DIAGRAM_GUIDELINES).not.toContain("${");
    expect(DIAGRAM_GUIDELINES).not.toContain("undefined");
    expect(DIAGRAM_GUIDELINES).not.toContain("NaN");
  });
});

/**
 * The prompt a person copies out of the editor and pastes into a chat with a
 * photograph of a whiteboard. It is the format contract plus the part that
 * tells a model how to read a picture — never a second, drifting copy of the
 * contract.
 */
describe("DIAGRAM_SKETCH_PROMPT", () => {
  it("carries the authoring guidelines verbatim", () => {
    expect(DIAGRAM_SKETCH_PROMPT).toContain(DIAGRAM_GUIDELINES);
  });

  it("tells the model it is reading an attached image", () => {
    expect(DIAGRAM_SKETCH_PROMPT).toContain("attached image");
  });

  it("keeps the author's own words for anything the registry does not know", () => {
    // The rule this replaced said "copy the labels as written", which was too
    // strong: it also copied a sketch's block capitals into a shouting label.
    // What must not change is someone's name for their own service.
    expect(DIAGRAM_SKETCH_PROMPT).toMatch(/author's words are the name/i);
  });

  it("offers the monogram as the way out when a box has no logo", () => {
    expect(DIAGRAM_SKETCH_PROMPT).toContain("initials");
  });

  it("forbids inventing what the picture does not show", () => {
    expect(DIAGRAM_SKETCH_PROMPT).toContain("Do not invent");
  });

  it("says what to do with an arrow that has no head", () => {
    expect(DIAGRAM_SKETCH_PROMPT).toContain("arrow");
  });

  /**
   * One test per way the first real sketch went wrong: a photographed
   * notebook page of Angular → NestJS → Postgres, every one of the three in
   * the icon registry, of which the model recognised one.
   */
  describe("what the first evaluated sketch got wrong", () => {
    /**
     * The preamble alone. Asserting against the whole prompt would pass on
     * wording that lives in the guidelines — which already say "capitals" and
     * already mention `sub` — and prove nothing about the part that reads a
     * picture.
     */
    const preamble = DIAGRAM_SKETCH_PROMPT.replace(DIAGRAM_GUIDELINES, "");

    it("tells the model to try the key list before giving up on a garbled label", () => {
      // "ANGULAR" was read as "AN BUILDR" and became a monogram, though
      // `angular` was sitting in the list of keys further down the same prompt.
      expect(preamble).toMatch(/near[- ]match|misread|hard to read/i);
      expect(preamble).toMatch(/before you .*initials|only when .*matches nothing/i);
    });

    it("explains that a box carries a mark inside and its name beneath", () => {
      // Every box in the sketch held one letter — A, N, P — and the name was
      // written under it. Two readings of the same component, and the model
      // used neither to check the other.
      expect(preamble).toMatch(/inside|beneath|below the box/i);
    });

    it("asks for the product's own casing, not the sketch's block capitals", () => {
      // "POSTGRES", "NOTES", "AN BUILDR" — handwriting is capitals, a diagram
      // should not be.
      expect(preamble).toMatch(/capitals/i);
      expect(preamble).toContain("Postgres");
    });

    it("asks for a role in sub", () => {
      // Every node came back without one, so the diagram lost the line that
      // says what each tile is for.
      expect(preamble).toContain("`sub`");
    });

    it("tells the model to re-read the arrowheads when the spine runs backwards", () => {
      // The result was NestJS → Angular: the client at the far right, outside
      // its own boundary, because one arrowhead was read the wrong way.
      expect(preamble).toMatch(/backwards|runs the wrong way/i);
    });

    it("carries a check the model runs before answering", () => {
      expect(preamble).toContain("Before you answer");
    });

    it("names no example that a misread label could be pulled towards", () => {
      // The prompt said "Notes API" twice. The model returned a node called
      // NOTES and titled the document aws-notes-postgres, from a sketch whose
      // middle box read NESTJS. A worked example inside a prompt is not inert.
      expect(DIAGRAM_SKETCH_PROMPT).not.toMatch(/Notes/);
    });
  });

  it("leaves no unresolved interpolation", () => {
    expect(DIAGRAM_SKETCH_PROMPT).not.toContain("${");
    expect(DIAGRAM_SKETCH_PROMPT).not.toContain("undefined");
  });
});
