import {
  EXAMPLE_DIAGRAM_DOCUMENT,
  diagramDocumentSchema,
  validateDiagramDocument,
} from "@diagram-tool/domain/schemas";
import { resolveDiagram } from "@diagram-tool/domain/render";
import { describe, expect, it } from "vitest";
import { materialiseLayout } from "../materialise";
import { addMember, createGroup, groupRefusal, removeMember, ungroup } from "../group-edits";

/**
 * The seed: `runtime` holds the CLOUDFLARE boundary plus `api` and `db`, and
 * `pipeline` holds `ci` and `web` with no boundary at all.
 */
const seed = () => JSON.stringify(EXAMPLE_DIAGRAM_DOCUMENT, null, 2);

const parse = (text: string) => JSON.parse(text) as Record<string, any>;
const resolved = (text: string) => resolveDiagram(diagramDocumentSchema.parse(JSON.parse(text)));
const valid = (text: string) => validateDiagramDocument(JSON.parse(text)).ok;

const groupsOf = (text: string) =>
  parse(text).content.groups as Array<{ id: string; members: string[] }>;
const groupIn = (text: string, id: string) => groupsOf(text).find((group) => group.id === id);

/** A document with no groups at all, so a first group can be made in it. */
const ungrouped = () => {
  const document = structuredClone(EXAMPLE_DIAGRAM_DOCUMENT);
  document.content.groups = [];
  document.layout = { boundaries: { cf: { x: 0, y: 0, w: 300, h: 200 } } };
  return JSON.stringify(document, null, 2);
};

describe("createGroup", () => {
  it("creates a group with no geometry at all", () => {
    const next = createGroup(ungrouped(), "g1", ["api", "db"], resolved(ungrouped()));

    expect(groupIn(next, "g1")).toEqual({ id: "g1", members: ["api", "db"] });
    expect(parse(next).layout.groups).toBeUndefined();
  });

  it("nests inside the parent when the members already share one", () => {
    const next = createGroup(seed(), "g1", ["api", "db"], resolved(seed()));

    // Pulling them out into a sibling would leave `runtime` holding only its
    // boundary, with nothing to frame — a document the validator rejects.
    expect(groupIn(next, "runtime")?.members).toEqual(["cf", "g1"]);
    expect(groupIn(next, "g1")?.members).toEqual(["api", "db"]);
    expect(valid(next)).toBe(true);
  });

  it("lands in the nearest common ancestor when the members span two groups", () => {
    const nested = createGroup(seed(), "inner", ["api", "db"], resolved(seed()));
    const next = createGroup(nested, "g2", ["cf", "inner"], resolved(nested));

    expect(groupIn(next, "runtime")?.members).toEqual(["g2"]);
    expect(groupIn(next, "g2")?.members).toEqual(["cf", "inner"]);
    expect(valid(next)).toBe(true);
  });

  it("dissolves a parent it emptied, and gives its boundary a rectangle back", () => {
    // Grouping across the two seeded groups empties `pipeline` entirely.
    const next = createGroup(seed(), "g1", ["web", "ci", "api", "db"], resolved(seed()));

    expect(groupIn(next, "pipeline")).toBeUndefined();
    expect(parse(next).layout.boundaries.cf).toMatchObject({ w: expect.any(Number) });
    expect(valid(next)).toBe(true);
  });

  it("refuses a group that would contain its own ancestor", () => {
    const text = seed();
    expect(createGroup(text, "g1", ["runtime", "api"], resolved(text))).toBe(text);
    expect(groupRefusal(text, ["runtime", "api"])).toBe("cycle");
  });

  it("refuses to put two boundaries in one group", () => {
    const document = structuredClone(EXAMPLE_DIAGRAM_DOCUMENT);
    document.content.boundaries = [
      { id: "cf", label: "CLOUDFLARE", tone: "orange" },
      { id: "aws", label: "AWS", tone: "green" },
    ];
    document.content.groups = [{ id: "runtime", members: ["cf", "api"] }];
    document.layout = { boundaries: { aws: { x: 0, y: 0, w: 100, h: 100 } } };
    const text = JSON.stringify(document, null, 2);

    expect(createGroup(text, "g1", ["cf", "aws", "db"], resolved(text))).toBe(text);
    expect(groupRefusal(text, ["cf", "aws", "db"])).toBe("two-boundaries");
  });

  it("refuses a group that would hold no tile", () => {
    const document = structuredClone(EXAMPLE_DIAGRAM_DOCUMENT);
    document.content.boundaries = [
      { id: "cf", label: "CLOUDFLARE", tone: "orange" },
      { id: "aws", label: "AWS", tone: "green" },
    ];
    document.content.groups = [];
    document.layout = {
      boundaries: { cf: { x: 0, y: 0, w: 100, h: 100 }, aws: { x: 0, y: 0, w: 100, h: 100 } },
    };
    const text = JSON.stringify(document, null, 2);

    expect(groupRefusal(text, ["cf"])).toBe("not-enough");
    expect(createGroup(text, "g1", ["cf", "aws"], resolved(text))).toBe(text);
  });

  it("refuses a selection of one", () => {
    const text = seed();
    expect(createGroup(text, "g1", ["api"], resolved(text))).toBe(text);
    expect(groupRefusal(text, ["api"])).toBe("not-enough");
  });

  it("leaves a document that validates, whatever it groups", () => {
    const cases = [
      ["api", "db"],
      ["web", "ci"],
      ["web", "api"],
      ["cf", "api"],
    ];

    for (const members of cases) {
      const next = createGroup(seed(), "g1", members, resolved(seed()));
      expect(valid(next), `grouping ${members.join(" + ")} produced an invalid document`).toBe(
        true,
      );
    }
  });
});

describe("ungroup", () => {
  it("dissolves the group without moving anything", () => {
    // Against a settled document, which is the only state the editor reaches:
    // it materialises the layout before any gesture that could re-flow it. On a
    // content-only document, dissolving a group legitimately re-lays it out —
    // the group was a clustering hint, and it has just gone.
    const settled = materialiseLayout(seed(), resolved(seed()));
    const before = resolved(settled);
    const next = ungroup(settled, "pipeline", before);
    const after = resolved(next);

    expect(groupIn(next, "pipeline")).toBeUndefined();
    for (const node of before.nodes) {
      expect(after.nodes.find((candidate) => candidate.id === node.id)).toMatchObject({
        x: node.x,
        y: node.y,
      });
    }
  });

  it("gives a boundary its rectangle back when its group dissolves", () => {
    const drawn = resolved(seed()).boundaries.find((boundary) => boundary.id === "cf");
    const next = ungroup(seed(), "runtime", resolved(seed()));

    expect(parse(next).layout.boundaries.cf).toEqual({
      x: drawn?.x,
      y: drawn?.y,
      w: drawn?.w,
      h: drawn?.h,
    });
    expect(valid(next)).toBe(true);
  });

  it("promotes what it held into the group above it", () => {
    const nested = createGroup(seed(), "inner", ["api", "db"], resolved(seed()));
    const next = ungroup(nested, "inner", resolved(nested));

    expect(groupIn(next, "runtime")?.members).toEqual(["cf", "api", "db"]);
  });

  it("is a no-op for a group that does not exist", () => {
    const text = seed();
    expect(ungroup(text, "ghost", resolved(text))).toBe(text);
  });
});

describe("membership", () => {
  it("adds an element that belongs to no group yet", () => {
    const loose = ungroup(seed(), "pipeline", resolved(seed()));
    const next = addMember(loose, "runtime", "web", resolved(loose));

    expect(groupIn(next, "runtime")?.members).toContain("web");
    expect(valid(next)).toBe(true);
  });

  it("refuses to add something that already belongs elsewhere", () => {
    const text = seed();
    // `web` is in `pipeline`; membership is a tree, not a set of overlapping sets.
    expect(addMember(text, "runtime", "ci", resolved(text))).toBe(text);
  });

  it("refuses to add a second boundary", () => {
    const document = structuredClone(EXAMPLE_DIAGRAM_DOCUMENT);
    document.content.boundaries = [
      { id: "cf", label: "CLOUDFLARE", tone: "orange" },
      { id: "aws", label: "AWS", tone: "green" },
    ];
    document.layout = { boundaries: { aws: { x: 0, y: 0, w: 100, h: 100 } } };
    const text = JSON.stringify(document, null, 2);

    expect(addMember(text, "runtime", "aws", resolved(text))).toBe(text);
  });

  it("takes an element out of a group", () => {
    const next = removeMember(seed(), "runtime", "db", resolved(seed()));

    expect(groupIn(next, "runtime")?.members).toEqual(["cf", "api"]);
    expect(valid(next)).toBe(true);
  });

  it("refuses to take the last tile out of a group that still frames one", () => {
    const once = removeMember(seed(), "runtime", "db", resolved(seed()));
    // `runtime` is down to the boundary and `api`; taking `api` would leave the
    // boundary with nothing to enclose.
    expect(removeMember(once, "runtime", "api", resolved(once))).toBe(once);
  });
});
