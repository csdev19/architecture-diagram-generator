import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateDiagramDocument } from "../diagram-document";

const samplesDirectory = fileURLToPath(new URL("../../../../../samples/", import.meta.url));

describe("sample diagrams", () => {
  it("keeps every checked-in JSON sample valid", () => {
    const files = readdirSync(samplesDirectory).filter((file) => file.endsWith(".json"));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = readFileSync(new URL(file, `file://${samplesDirectory}/`), "utf8");
      const result = validateDiagramDocument(JSON.parse(text));

      expect(result, `${file} must validate`).toMatchObject({ ok: true });
    }
  });
});
