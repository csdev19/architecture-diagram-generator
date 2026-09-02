import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";
import type { DiagramConfigInput } from "@diagram-tool/domain/schemas";

/**
 * Every visual edit, expressed as a transformation of the editor's text.
 *
 * The textarea's contents stay the single source of truth: a drag parses the
 * current text, mutates the config, and prints it back. Nothing holds a parsed
 * config alongside the text, so the canvas and the JSON cannot disagree, undo
 * stays text-level, and phase 0's invariant survives its own success.
 *
 * These functions deliberately do **not** validate. A rename that overruns the
 * tile still gets written, and the existing error channel reports it — the user
 * can see what they did and fix it. Silently refusing an edit would be worse.
 */

/** Nodes snap to half a background grid cell, the finest spacing that reads as deliberate. */
const SNAP = DIAGRAM_GEOMETRY.GRID_CELL / 2;

export const snapToGrid = (value: number): number => {
  const snapped = Math.round(value / SNAP) * SNAP;
  // `-0` prints as `-0` in JSON and compares unequal to `0`.
  return snapped === 0 ? 0 : snapped;
};

type NodeInput = DiagramConfigInput["nodes"][number];
type EdgeInput = DiagramConfigInput["edges"][number];

/** A partial node update. An `undefined` value removes the field entirely. */
export type NodePatch = Partial<NodeInput>;

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Runs `edit` against a mutable copy of whatever the text parses to, and prints
 * the result back at the seed's indentation.
 *
 * Text that does not parse — or that parses to something without the shape the
 * edit needs — comes back byte-identical. The parse error is already on screen;
 * a drag must neither crash nor quietly discard what the user typed. `edit`
 * returns false to signal it changed nothing.
 *
 * The config is walked as raw JSON rather than through the schema on purpose:
 * parsing with Zod would fill in defaults the author never wrote, rewriting
 * parts of their file they did not touch.
 */
const editConfig = (text: string, edit: (config: RawRecord) => boolean): string => {
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

/** The node with this id, if the config has one to find. */
const findNode = (config: RawRecord, id: string): RawRecord | undefined => {
  if (!Array.isArray(config.nodes)) return undefined;
  return config.nodes.find((node) => isRecord(node) && node.id === id) as RawRecord | undefined;
};

/**
 * Writes a node's centre exactly as given.
 *
 * Used to put a node back when a drag is cancelled: a config's coordinates are
 * not required to sit on the grid, so restoring through the snapping `moveNode`
 * would quietly relocate a node the user only meant to leave alone.
 */
export const setNodePosition = (text: string, id: string, x: number, y: number): string =>
  editConfig(text, (config) => {
    const node = findNode(config, id);
    if (!node) return false;

    node.x = x;
    node.y = y;
    return true;
  });

/** Moves a node's centre, snapped to the grid. */
export const moveNode = (text: string, id: string, x: number, y: number): string =>
  setNodePosition(text, id, snapToGrid(x), snapToGrid(y));

/** Patches a node's fields. A field set to `undefined` is removed. */
export const updateNodeFields = (text: string, id: string, patch: NodePatch): string =>
  editConfig(text, (config) => {
    const node = findNode(config, id);
    if (!node) return false;

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete node[key];
      else node[key] = value;
    }
    return true;
  });

/** Appends an edge. */
export const addEdge = (text: string, edge: EdgeInput): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.edges)) return false;

    config.edges.push({ ...edge });
    return true;
  });

/** Removes the edge at `index`, by position rather than identity — edges have no id. */
export const removeEdge = (text: string, index: number): string =>
  editConfig(text, (config) => {
    const { edges } = config;
    if (!Array.isArray(edges)) return false;
    if (!Number.isInteger(index) || index < 0 || index >= edges.length) return false;

    edges.splice(index, 1);
    return true;
  });

/**
 * The same edits, bound to the editor's `setText`.
 *
 * Each one goes through the functional form of `setText` so a drag emitting
 * many moves in a frame always reads the latest text rather than the one
 * captured when the handler was created.
 */
export const useDiagramEditing = (setText: Dispatch<SetStateAction<string>>) =>
  useMemo(
    () => ({
      moveNode: (id: string, x: number, y: number) => setText((text) => moveNode(text, id, x, y)),
      setNodePosition: (id: string, x: number, y: number) =>
        setText((text) => setNodePosition(text, id, x, y)),
      updateNodeFields: (id: string, patch: NodePatch) =>
        setText((text) => updateNodeFields(text, id, patch)),
      addEdge: (edge: EdgeInput) => setText((text) => addEdge(text, edge)),
      removeEdge: (index: number) => setText((text) => removeEdge(text, index)),
    }),
    [setText],
  );
