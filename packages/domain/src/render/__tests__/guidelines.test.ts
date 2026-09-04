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

  it("asks for the nodes in the order the finished diagram reads", () => {
    // Array order is not decoration: where the edges leave two tiles able to
    // sit either way round, auto-layout settles it by the order they were
    // written down. A model that does not know that orders them arbitrarily.
    expect(DIAGRAM_GUIDELINES).toMatch(/order the .*diagram reads/i);
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
  describe("the output contract", () => {
    const preamble = DIAGRAM_SKETCH_PROMPT.replace(DIAGRAM_GUIDELINES, "");

    it("never asks for a diagram to be produced", () => {
      // The prompt opened with "Turn this sketch into a diagram". ChatGPT read
      // that as an instruction to its image tool and returned a picture.
      expect(preamble).not.toMatch(/turn this sketch into a diagram/i);
      // The title is the first thing read and the strongest instruction in the
      // prompt. It must name the output, not the artefact someone wants.
      expect(preamble).not.toMatch(/^# .*\bdiagram\b/im);
    });

    it("forbids drawing, rendering or generating an image", () => {
      expect(preamble).toMatch(/do not (draw|render|generate|produce)[^.]*image/i);
    });

    it("says the whole reply is JSON, and says it first", () => {
      expect(preamble.slice(0, 400)).toMatch(/JSON/);
    });

    it("asks for no prose after the JSON, so a paste always parses", () => {
      // The preamble used to collect assumptions after the JSON while the
      // appended guidelines said "ONLY the JSON object — no commentary". The
      // model obeyed one or the other; either way the round trip broke.
      expect(preamble).not.toMatch(/assumption/i);
      expect(preamble).not.toMatch(/after the JSON/i);
    });

    it("names every field the schema requires without a default", () => {
      // `tone` has no default, so a boundary without one fails validation, and
      // the preamble is where a model reading a picture looks for its fields.
      expect(preamble).toContain("tone");
    });
  });

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

    it("never lets a convention overrule an arrowhead that can be seen", () => {
      // The first fix for the reversed edge told the model to distrust a head
      // whenever the resulting flow looked unusual. That inverts the prompt's
      // own principle: it would quietly "correct" a store that really does push
      // to a client. Only a line with no visible head may be inferred.
      expect(preamble).toMatch(/never reverse a visible arrowhead/i);
      expect(preamble).not.toMatch(/if it runs backwards/i);
    });

    it("says the picture outranks the general advice, and says it after that advice", () => {
      // Composed, the prompt carries a sketch preamble and then a generic
      // contract that describes how architectures usually read. Where the two
      // disagree nothing said which won.
      const precedence = DIAGRAM_SKETCH_PROMPT.lastIndexOf("overrides the general advice");
      const generic = DIAGRAM_SKETCH_PROMPT.lastIndexOf("solid path read left to right");

      expect(precedence).toBeGreaterThan(generic);
    });

    it("puts its own checks last, after everything else it says", () => {
      // They used to sit mid-document, with the whole contract printed after
      // them — so the most important check was the furthest from the answer.
      const checks = DIAGRAM_SKETCH_PROMPT.indexOf("Last checks");
      const contract = DIAGRAM_SKETCH_PROMPT.indexOf("Check before answering");

      expect(checks).toBeGreaterThan(contract);
      expect(DIAGRAM_SKETCH_PROMPT.slice(checks)).not.toContain(DIAGRAM_GUIDELINES);
    });

    it("names no example that a misread label could be pulled towards", () => {
      // The prompt said "Notes API" twice. The model returned a node called
      // NOTES and titled the document aws-notes-postgres, from a sketch whose
      // middle box read NESTJS. A worked example inside a prompt is not inert.
      expect(DIAGRAM_SKETCH_PROMPT).not.toMatch(/Notes/);
    });
  });

  /**
   * One test per way the second and third evaluated sketches went wrong. Both
   * were read almost perfectly — the right nodes, the right icons, the right
   * boundaries — and both came back mirrored, because a sketch draws its boxes
   * left to right and its arrows pointing back up the flow.
   */
  describe("what the mirrored sketches got wrong", () => {
    const preamble = DIAGRAM_SKETCH_PROMPT.replace(DIAGRAM_GUIDELINES, "");

    it("asks for the nodes in the order they read across the page", () => {
      // A whiteboard of Cloudflare | Cloudflare | Neon, wired right to left,
      // came back as Neon | Cloudflare | Cloudflare. Every arrowhead was read
      // correctly; nothing in the document carried the order they were drawn
      // in, which is the only evidence that could have settled it.
      expect(preamble).toMatch(/order they read/i);
      // The prompt is a wrapped string, so the phrase can straddle a newline.
      expect(preamble).toMatch(/left to\s+right/i);
    });

    it("makes a double-headed arrow one edge rather than two", () => {
      // Two edges between the same pair, one each way, draw two lines on top of
      // each other — and make a two-node cycle that auto-layout cannot layer.
      expect(preamble).toMatch(/double-headed arrow is one edge/i);
    });

    it("keeps the mark it can see instead of erasing the box to a question mark", () => {
      // A box holding "O" over an unreadable word became a tile named `?` with
      // `?` for its monogram, throwing away the one letter that was legible.
      expect(preamble).toMatch(/mark drawn inside the box/i);
      expect(preamble).toMatch(/neither is legible/i);
    });

    it("reads the line style of an enclosing rectangle", () => {
      // The AWS perimeter was drawn dashed and came back solid. `dashed` is on
      // the schema; nothing told the model the picture decides it.
      expect(preamble).toMatch(/dashed: true/);
    });
  });

  it("leaves no unresolved interpolation", () => {
    expect(DIAGRAM_SKETCH_PROMPT).not.toContain("${");
    expect(DIAGRAM_SKETCH_PROMPT).not.toContain("undefined");
  });
});
