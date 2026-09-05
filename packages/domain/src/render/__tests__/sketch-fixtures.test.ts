import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIAGRAM_GEOMETRY } from "../../constants/diagram";
import { validateDiagramDocument } from "../../schemas/diagram-document";
import type { DiagramBoundary, DiagramNode, ResolvedDiagram } from "../../schemas/diagram";
import { boundaryBounds, nodeBounds } from "../bounds";
import { resolveDiagram } from "../resolve";
import notebookExpected from "./fixtures/sketches/notebook-angular-nestjs-postgres/expected.json";
import notebookObserved from "./fixtures/sketches/notebook-angular-nestjs-postgres/observed.json";
import whiteboardExpected from "./fixtures/sketches/whiteboard-cloudflare-neon/expected.json";
import whiteboardObserved from "./fixtures/sketches/whiteboard-cloudflare-neon/observed.json";

/**
 * What this project draws from what a model actually returned.
 *
 * Every fixture is a photographed sketch, the document one run of the copied
 * prompt gave back from it, and the facts about the picture a person reviewed
 * against the photograph. The documents are recordings and are never edited:
 * the question here is not whether a model read a whiteboard correctly — that
 * has a different answer every run and needs an API key to ask — but whether
 * the drawing derived from its answer reads the way the whiteboard does.
 *
 * The distinction is not academic. Both fixtures below were read almost
 * perfectly and both were drawn back to front, because auto-layout took the
 * arrows for the reading order and a sketch draws those two things apart.
 * Nothing in the unit tests could see it: every one of them was written with
 * the arrows already pointing the way the diagram was meant to read.
 *
 * `fixtures/sketches/README.md` is the protocol for adding one.
 */

/** The reviewed facts about a sketch. See the README for what each one claims. */
interface SketchExpectation {
  /** What the photograph shows, for a reader who does not have it open. */
  sketch: string;
  /** Node ids left to right across the page. */
  readingOrder: string[];
  /** Groups of node ids that sit on one row. */
  rows: string[][];
  /** Node ids that sit under the main row, in the band. */
  below?: string[];
  /** Node ids whose tile falls inside a boundary's rectangle. */
  inside: Record<string, string[]>;
  /** Node ids that must not fall inside it. */
  outside?: Record<string, string[]>;
  /** What the model got wrong. Prose, for a person, asserted by nothing. */
  misreadings?: string[];
}

interface SketchFixture {
  /** The directory, which is also what the test reports itself as. */
  name: string;
  /** A document a model returned, verbatim. `unknown` because validating it is the first test. */
  observed: unknown;
  expected: SketchExpectation;
}

/**
 * Listed by hand rather than globbed.
 *
 * A glob would add a fixture the moment a folder appeared, which sounds like
 * the point until a half-finished directory joins the suite silently. Adding a
 * line here is the cheap part of adding a fixture; reading the photograph and
 * writing down what it shows is the rest.
 */
const FIXTURES: SketchFixture[] = [
  {
    name: "notebook-angular-nestjs-postgres",
    observed: notebookObserved,
    expected: notebookExpected,
  },
  {
    name: "whiteboard-cloudflare-neon",
    observed: whiteboardObserved,
    expected: whiteboardExpected,
  },
];

const nodeOf = (diagram: ResolvedDiagram, id: string): DiagramNode => {
  const node = diagram.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`the expectation names a node "${id}" the document does not have`);
  return node;
};

const boundaryOf = (diagram: ResolvedDiagram, id: string): DiagramBoundary => {
  const boundary = diagram.boundaries.find((candidate) => candidate.id === id);
  if (!boundary) {
    throw new Error(`the expectation names a boundary "${id}" the document does not have`);
  }
  return boundary;
};

/** Whether a node's tile and label sit entirely within a boundary's rectangle. */
const isInside = (diagram: ResolvedDiagram, nodeId: string, boundaryId: string): boolean => {
  const tile = nodeBounds(nodeOf(diagram, nodeId));
  const box = boundaryBounds(boundaryOf(diagram, boundaryId));

  return (
    tile.minX >= box.minX && tile.maxX <= box.maxX && tile.minY >= box.minY && tile.maxY <= box.maxY
  );
};

describe.each(FIXTURES)("the sketch $name was drawn", ({ name, observed, expected }) => {
  it("from a photograph kept beside the document", () => {
    // A recording nobody can check against the picture it came from is not
    // evidence of anything, and the next person to touch these facts will need
    // to look at that picture.
    const photograph = new URL(`./fixtures/sketches/${name}/sketch.jpg`, import.meta.url);

    expect(existsSync(photograph), "no sketch.jpg in this fixture").toBe(true);
  });

  const validation = validateDiagramDocument(observed);

  it("from a document this project accepts", () => {
    expect(validation.ok ? [] : validation.errors).toEqual([]);
  });

  if (!validation.ok) return;

  const diagram = resolveDiagram(validation.document);
  const x = (id: string) => nodeOf(diagram, id).x;
  const y = (id: string) => nodeOf(diagram, id).y;

  it(`reading left to right: ${expected.readingOrder.join(" → ")}`, () => {
    // The one fact a mirrored diagram cannot satisfy.
    const drawn = [...expected.readingOrder].sort((a, b) => x(a) - x(b));

    expect(drawn).toEqual(expected.readingOrder);
  });

  it("with the rows the page has", () => {
    for (const row of expected.rows) {
      const heights = new Set(row.map(y));
      expect([...heights], `"${row.join('", "')}" are not on one row`).toHaveLength(1);
    }
  });

  it("with everything unconnected in the band underneath", () => {
    const flow = Math.max(...expected.readingOrder.map(y));

    for (const id of expected.below ?? []) {
      expect(y(id), `"${id}" is not below the flow`).toBeGreaterThan(flow);
    }
  });

  it("inside the boxes drawn around them", () => {
    for (const [boundary, members] of Object.entries(expected.inside)) {
      for (const id of members) {
        expect(isInside(diagram, id, boundary), `"${id}" is outside "${boundary}"`).toBe(true);
      }
    }

    for (const [boundary, strangers] of Object.entries(expected.outside ?? {})) {
      for (const id of strangers) {
        expect(isInside(diagram, id, boundary), `"${id}" was swallowed by "${boundary}"`).toBe(
          false,
        );
      }
    }
  });

  it("with no tile on top of another", () => {
    // Declared by nobody: it is true of every diagram, and a layout that
    // satisfies every stated fact by piling two tiles up has satisfied none.
    for (const first of diagram.nodes) {
      for (const second of diagram.nodes) {
        if (first.id === second.id) continue;

        const clear =
          Math.abs(first.x - second.x) >= DIAGRAM_GEOMETRY.TILE_SIZE ||
          Math.abs(first.y - second.y) >= DIAGRAM_GEOMETRY.TILE_SIZE;

        expect(clear, `"${first.id}" overlaps "${second.id}"`).toBe(true);
      }
    }
  });
});
