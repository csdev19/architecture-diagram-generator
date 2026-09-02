import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";

/**
 * The one way anything edits the diagram: parse the text, mutate raw JSON,
 * print it back.
 *
 * The textarea's contents stay the single source of truth. Nothing holds a
 * parsed document alongside the text, so the canvas and the JSON cannot
 * disagree, undo stays text-level, and the invariant that carried phase 0
 * survives the format change.
 *
 * These functions deliberately do **not** validate. A rename that overruns the
 * tile still gets written, and the existing error channel reports it — the user
 * can see what they did and fix it. Silently refusing an edit would be worse.
 */

export type RawRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is RawRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Nodes snap to half a background grid cell, the finest spacing that reads as deliberate. */
const SNAP = DIAGRAM_GEOMETRY.GRID_CELL / 2;

export const snapToGrid = (value: number): number => {
  const snapped = Math.round(value / SNAP) * SNAP;
  // `-0` prints as `-0` in JSON and compares unequal to `0`.
  return snapped === 0 ? 0 : snapped;
};

/**
 * Runs `edit` against a mutable copy of whatever the text parses to, and prints
 * the result back at the seed's indentation.
 *
 * Text that does not parse — or that parses to something without the shape the
 * edit needs — comes back byte-identical. The parse error is already on screen;
 * a drag must neither crash nor quietly discard what the user typed. `edit`
 * returns false to signal it changed nothing.
 *
 * The document is walked as raw JSON rather than through the schema on purpose:
 * parsing with Zod would fill in defaults the author never wrote, rewriting
 * parts of their file they did not touch.
 */
export const editDocument = (text: string, edit: (document: RawRecord) => boolean): string => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  if (!isRecord(parsed)) return text;

  const draft = structuredClone(parsed);
  if (!edit(draft)) return text;

  return JSON.stringify(draft, null, 2);
};

/** The `content` object, if the document has one to edit. */
export const contentOf = (document: RawRecord): RawRecord | undefined =>
  isRecord(document.content) ? document.content : undefined;

/** The array of `kind` inside `content`, if it is there. */
export const collectionOf = (
  document: RawRecord,
  kind: "nodes" | "boundaries" | "groups" | "edges",
): unknown[] | undefined => {
  const content = contentOf(document);
  if (!content) return undefined;
  return Array.isArray(content[kind]) ? (content[kind] as unknown[]) : undefined;
};

/** The item with this id inside a content collection. */
export const findById = (
  document: RawRecord,
  kind: "nodes" | "boundaries" | "groups",
  id: string,
): RawRecord | undefined => {
  const items = collectionOf(document, kind);
  return items?.find((item) => isRecord(item) && item.id === id) as RawRecord | undefined;
};

/**
 * The layout record for a kind, created on demand.
 *
 * A content-only document is the normal shape a model returns, so the first
 * drag has to be able to write a position into a document that has no `layout`
 * key at all — without every caller checking first.
 */
export const layoutBranch = (
  document: RawRecord,
  kind: "nodes" | "boundaries" | "edges",
): RawRecord => {
  const layout = isRecord(document.layout) ? document.layout : {};
  document.layout = layout;

  const branch = isRecord(layout[kind]) ? (layout[kind] as RawRecord) : {};
  layout[kind] = branch;
  return branch;
};

/** The layout record for a kind, only if it is already there. */
export const existingLayoutBranch = (
  document: RawRecord,
  kind: "nodes" | "boundaries" | "edges",
): RawRecord | undefined => {
  const layout = isRecord(document.layout) ? document.layout : undefined;
  if (!layout) return undefined;

  return isRecord(layout[kind]) ? (layout[kind] as RawRecord) : undefined;
};

/**
 * Drops a layout entry, and the branch with it once it is empty.
 *
 * A document should not accumulate `"nodes": {}` as things are deleted: an
 * empty branch is noise in a panel whose whole job is to be read.
 */
export const dropLayoutEntry = (
  document: RawRecord,
  kind: "nodes" | "boundaries" | "edges",
  id: string,
): boolean => {
  const branch = existingLayoutBranch(document, kind);
  if (!branch || !(id in branch)) return false;

  delete branch[id];
  pruneLayout(document);
  return true;
};

/** Removes every empty branch, and `layout` itself once nothing is left in it. */
export const pruneLayout = (document: RawRecord): void => {
  const layout = isRecord(document.layout) ? document.layout : undefined;
  if (!layout) return;

  for (const kind of ["nodes", "boundaries", "edges"] as const) {
    const branch = layout[kind];
    if (isRecord(branch) && Object.keys(branch).length === 0) delete layout[kind];
  }

  if (Object.keys(layout).length === 0) delete document.layout;
};
