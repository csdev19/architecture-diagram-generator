import { describe, expect, it } from "vitest";
import { DIAGRAM_GUIDELINES, JSON_TRANSPORT_RULE } from "../guidelines";
import {
  DIAGRAM_REPOSITORY_PROMPTS,
  REPOSITORY_PROMPT_ORDER,
  REPOSITORY_PROMPT_SHAPES,
} from "../repository-prompt";

/**
 * The prompts a person copies out of the editor and pastes into a coding agent
 * that already has their repository open. Three shapes of the same contract —
 * the runtime flow, the whole stack, the stack by layer — each of them the
 * format guidelines plus the part that says how to read a codebase, and never
 * a second, drifting copy of the contract.
 */
describe("DIAGRAM_REPOSITORY_PROMPTS", () => {
  const shapes = Object.values(REPOSITORY_PROMPT_SHAPES);

  it("offers exactly the three shapes, in the order the panel lists them", () => {
    expect(REPOSITORY_PROMPT_ORDER).toEqual([
      REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW,
      REPOSITORY_PROMPT_SHAPES.FULL_STACK,
      REPOSITORY_PROMPT_SHAPES.LAYERS,
    ]);
    expect(Object.keys(DIAGRAM_REPOSITORY_PROMPTS).sort()).toEqual([...shapes].sort());
  });

  it("gives every shape a label and a one-line explanation, all of them distinct", () => {
    // The blurb is the whole reason the selector exists: a person picks a shape
    // by reading what it does, not by trying all three.
    const labels = shapes.map((shape) => DIAGRAM_REPOSITORY_PROMPTS[shape].label);
    const blurbs = shapes.map((shape) => DIAGRAM_REPOSITORY_PROMPTS[shape].blurb);

    expect(new Set(labels).size).toBe(shapes.length);
    expect(new Set(blurbs).size).toBe(shapes.length);
    for (const blurb of blurbs) {
      expect(blurb.length).toBeGreaterThan(20);
      expect(blurb).not.toContain("\n");
    }
  });

  describe.each(shapes)("the %s prompt", (shape) => {
    const { prompt } = DIAGRAM_REPOSITORY_PROMPTS[shape];
    /**
     * The preamble alone. Asserting against the whole prompt would pass on
     * wording that lives in the guidelines and prove nothing about the part
     * that reads a repository.
     */
    const preamble = prompt.replace(DIAGRAM_GUIDELINES, "");

    it("carries the authoring guidelines verbatim", () => {
      expect(prompt).toContain(DIAGRAM_GUIDELINES);
    });

    it("says the whole reply is JSON, and says it first", () => {
      expect(preamble.slice(0, 400)).toMatch(/JSON/);
      // The title is the strongest instruction in the prompt. It must name
      // the output, not the artefact someone wants.
      expect(preamble).not.toMatch(/^# .*\bdiagram\b/im);
    });

    it("repeats the safe transport rule before repository instructions", () => {
      const transport = prompt.indexOf(JSON_TRANSPORT_RULE);
      const reading = prompt.indexOf("repository open in your workspace");

      expect(transport).toBeGreaterThan(-1);
      expect(transport).toBeLessThan(reading);
    });

    it("forbids drawing, rendering or generating an image", () => {
      expect(preamble).toMatch(/do not (draw|render|generate|produce)[^.]*image/i);
    });

    it("addresses a coding agent that has the repository open", () => {
      expect(preamble).toMatch(/coding agent/i);
      expect(preamble).toMatch(/repository/i);
    });

    it("tells the agent what to read, starting with what the team already wrote down", () => {
      // A README or an architecture doc is where a team described their own
      // stack in words. It beats inferring the same thing from a lockfile.
      const readme = preamble.search(/README/);
      const manifests = preamble.search(/manifest/i);
      const lockfile = preamble.search(/lockfile/i);

      expect(readme).toBeGreaterThan(-1);
      expect(manifests).toBeGreaterThan(readme);
      expect(lockfile).toBeGreaterThan(manifests);
      expect(preamble).toMatch(/Dockerfile|wrangler|Terraform|compose/i);
      expect(preamble).toMatch(/entrypoint|entry point/i);
    });

    it("keeps the agent out of the business logic", () => {
      // The request was explicit: read the technologies as technologies. A
      // model that reads handlers and services draws the domain, not the stack.
      expect(preamble).toMatch(/business logic/i);
      expect(preamble).toMatch(/do not read|not (to )?read|never read/i);
    });

    it("keeps secrets and generated code out of the reading", () => {
      expect(preamble).toMatch(/\.env/);
      expect(preamble).toMatch(/secret/i);
      expect(preamble).toMatch(/node_modules/);
    });

    it("says everything stays on the machine but the JSON", () => {
      // The person's repository is private to their team. The only thing that
      // travels is a JSON document naming technologies — and the prompt has to
      // say so, because the agent is the one deciding what to put in it.
      expect(preamble).toMatch(
        /stays? (on|in) (this|the|your) machine|leaves? (this|the|your) machine|never leaves/i,
      );
      expect(preamble).toMatch(/no (source|code)|not? .*source code|no file paths|no credentials/i);
    });

    it("forbids inventing a technology the files do not show", () => {
      expect(preamble).toMatch(/do not invent/i);
      expect(preamble).toMatch(/evidence/i);
    });

    it("says a perimeter is a boundary, not also a node", () => {
      // The first full-stack run of this repository drew a "Cloudflare Workers"
      // tile in front of the app and then a "Cloudflare Workers" boundary
      // around it: the platform twice, and a spine that ran through a tile the
      // request never reaches. Where something runs is the box, not a hop.
      expect(preamble).toMatch(/not (also )?a node|never (also )?a node/i);
      expect(preamble).toMatch(/where (it|something|the app) runs/i);
    });

    it("asks for the product's own casing and a role in sub", () => {
      expect(preamble).toContain("`sub`");
      expect(preamble).toMatch(/the way its own product writes it|product's own (name|casing)/i);
    });

    it("puts its own checks last, after everything else it says", () => {
      const checks = prompt.indexOf("Last checks");
      const contract = prompt.indexOf("Check before answering");

      expect(checks).toBeGreaterThan(contract);
      expect(prompt.slice(checks)).not.toContain(DIAGRAM_GUIDELINES);
    });

    it("leaves no unresolved interpolation", () => {
      expect(prompt).not.toContain("${");
      expect(prompt).not.toContain("undefined");
    });
  });

  describe("what makes each shape a different diagram", () => {
    const preambleOf = (shape: keyof typeof DIAGRAM_REPOSITORY_PROMPTS) =>
      DIAGRAM_REPOSITORY_PROMPTS[shape].prompt.replace(DIAGRAM_GUIDELINES, "");

    it("runtime flow keeps only what moves data, and says tooling is not a node", () => {
      const preamble = preambleOf(REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW);

      expect(preamble).toMatch(/moves?\s+data/i);
      expect(preamble).toMatch(/not a\s+node/i);
      expect(preamble).toMatch(/tooling|build tool|test runner|linter/i);
    });

    it("full stack keeps the flow and adds the tooling in boundaries off the spine", () => {
      const preamble = preambleOf(REPOSITORY_PROMPT_SHAPES.FULL_STACK);

      expect(preamble).toMatch(/moves?\s+data/i);
      expect(preamble).toMatch(/tooling/i);
      expect(preamble).toMatch(/boundary|boundaries/i);
      // Tooling wired into the request path with solid lines turns the stack
      // into a fake flow: Vitest does not call Postgres.
      expect(preamble).toMatch(/no\s+solid edge|never a solid edge|dashed/i);
    });

    it("layers draws one boundary per layer and wires only between layers", () => {
      const preamble = preambleOf(REPOSITORY_PROMPT_SHAPES.LAYERS);

      for (const layer of ["frontend", "backend", "data", "infra", "tooling"]) {
        expect(preamble, `layers prompt never names the "${layer}" layer`).toMatch(
          new RegExp(layer, "i"),
        );
      }
      expect(preamble).toMatch(/one outer\s+boundary per layer/i);
      expect(preamble).toMatch(/between\s+layers|across\s+layers/i);
      expect(preamble).toMatch(/not (inside|within) a layer|never\s+inside a layer/i);
      expect(preamble).toMatch(/web, mobile or desktop application/i);
      expect(preamble).toMatch(/separately deployed Worker/i);
    });
  });
});
