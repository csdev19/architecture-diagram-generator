import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";
import type { CanvasTone } from "@diagram-tool/domain/constants";
import { layoutDiagram } from "@diagram-tool/domain/render";
import { validateDiagramConfig } from "@diagram-tool/domain/schemas";
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

/** Moves a node's centre, snapped to the grid. Nothing is out of bounds. */
export const moveNode = (text: string, id: string, x: number, y: number): string =>
  editConfig(text, (config) => {
    const node = findNode(config, id);
    if (!node) return false;

    node.x = snapToGrid(x);
    node.y = snapToGrid(y);
    return true;
  });

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

/**
 * Appends a node at a point on the canvas.
 *
 * Snapping happens here, like every other write of a coordinate. Nothing is
 * clamped: there is no frame to be outside of, so a tile goes exactly where it
 * was dropped, negative coordinates included.
 *
 * The caller owns id uniqueness; the schema reports a clash.
 */
export const addNode = (text: string, node: NodeInput): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.nodes)) return false;

    config.nodes.push({ ...node, x: snapToGrid(node.x), y: snapToGrid(node.y) });
    return true;
  });

/**
 * Removes a node and every edge that touched it.
 *
 * The edges go with it rather than being left dangling: an edge naming a node
 * that no longer exists is invalid, and the author deleting a tile did not ask
 * to be handed two validation errors about relations they can no longer see.
 */
export const removeNode = (text: string, id: string): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.nodes)) return false;

    const kept = config.nodes.filter((node) => !isRecord(node) || node.id !== id);
    if (kept.length === config.nodes.length) return false;
    config.nodes = kept;

    if (Array.isArray(config.edges)) {
      config.edges = config.edges.filter(
        (edge) => !isRecord(edge) || (edge.from !== id && edge.to !== id),
      );
    }

    return true;
  });

type GroupInput = DiagramConfigInput["groups"][number];

/** A partial group update. An `undefined` value removes the field entirely. */
export type GroupPatch = Partial<GroupInput>;

/** The group with this id, if the config has one to find. */
const findGroup = (config: RawRecord, id: string): RawRecord | undefined => {
  if (!Array.isArray(config.groups)) return undefined;
  return config.groups.find((group) => isRecord(group) && group.id === id) as RawRecord | undefined;
};

/**
 * Appends a group, snapped to the grid.
 *
 * Prepended rather than pushed would be wrong: the renderer draws groups in
 * array order, so the newest has to be last to sit on top of the ones it
 * overlaps — which is also what makes hit-testing back-to-front correct.
 */
export const addGroup = (text: string, group: GroupInput): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.groups)) return false;

    config.groups.push({
      ...group,
      x: snapToGrid(group.x),
      y: snapToGrid(group.y),
      w: snapToGrid(group.w),
      h: snapToGrid(group.h),
    });
    return true;
  });

/** Patches a group's fields. A field set to `undefined` is removed. */
export const updateGroupFields = (text: string, id: string, patch: GroupPatch): string =>
  editConfig(text, (config) => {
    const group = findGroup(config, id);
    if (!group) return false;

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete group[key];
      else group[key] = value;
    }
    return true;
  });

/** Moves a group's top-left corner, snapped. Its size is unchanged. */
export const moveGroup = (text: string, id: string, x: number, y: number): string =>
  editConfig(text, (config) => {
    const group = findGroup(config, id);
    if (!group) return false;

    group.x = snapToGrid(x);
    group.y = snapToGrid(y);
    return true;
  });

/**
 * Removes a group.
 *
 * Nothing else goes with it: a group is a box drawn around nodes, not a parent
 * of them. The nodes it enclosed stay exactly where they were, which is the
 * whole reason grouping is cheap to try.
 */
export const removeGroup = (text: string, id: string): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.groups)) return false;

    const kept = config.groups.filter((group) => !isRecord(group) || group.id !== id);
    if (kept.length === config.groups.length) return false;

    config.groups = kept;
    return true;
  });

/** Sets the paper tone. Part of the drawing, so it belongs in the config. */
export const setBackground = (text: string, tone: CanvasTone): string =>
  editConfig(text, (config) => {
    config.background = tone;
    return true;
  });

/** Appends an edge. */
export const addEdge = (text: string, edge: EdgeInput): string =>
  editConfig(text, (config) => {
    if (!Array.isArray(config.edges)) return false;

    config.edges.push({ ...edge });
    return true;
  });

/** A partial edge update. An `undefined` value removes the field entirely. */
export type EdgePatch = Partial<EdgeInput>;

/** Patches the edge at `index`. Edges have no id, so position is the handle. */
export const updateEdgeFields = (text: string, index: number, patch: EdgePatch): string =>
  editConfig(text, (config) => {
    const { edges } = config;
    if (!Array.isArray(edges)) return false;

    const edge = edges[index];
    if (!isRecord(edge)) return false;

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete edge[key];
      else edge[key] = value;
    }
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
 * Re-places every node from the diagram's topology.
 *
 * Only coordinates are written back. Running the laid-out config
 * through `JSON.stringify` wholesale would be simpler, but it would also stamp
 * every schema default into the author's file — `sub: ""`, `style: "solid"`,
 * `filled: true` — rewriting lines they never touched. A no-op if the config
 * does not validate, because layout has nothing to work from.
 */
export const arrangeNodes = (text: string): string =>
  editConfig(text, (config) => {
    const validated = validateDiagramConfig(config);
    if (!validated.ok) return false;
    if (!Array.isArray(config.nodes)) return false;

    const laidOut = layoutDiagram(validated.config);
    const placed = new Map(laidOut.nodes.map((node) => [node.id, node]));

    for (const node of config.nodes) {
      if (!isRecord(node)) continue;
      const position = placed.get(String(node.id));
      if (!position) continue;

      node.x = position.x;
      node.y = position.y;
    }

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
      addNode: (node: NodeInput) => setText((text) => addNode(text, node)),
      setBackground: (tone: CanvasTone) => setText((text) => setBackground(text, tone)),
      addGroup: (group: GroupInput) => setText((text) => addGroup(text, group)),
      updateGroupFields: (id: string, patch: GroupPatch) =>
        setText((text) => updateGroupFields(text, id, patch)),
      moveGroup: (id: string, x: number, y: number) => setText((text) => moveGroup(text, id, x, y)),
      removeGroup: (id: string) => setText((text) => removeGroup(text, id)),
      removeNode: (id: string) => setText((text) => removeNode(text, id)),
      addEdge: (edge: EdgeInput) => setText((text) => addEdge(text, edge)),
      updateEdgeFields: (index: number, patch: EdgePatch) =>
        setText((text) => updateEdgeFields(text, index, patch)),
      removeEdge: (index: number) => setText((text) => removeEdge(text, index)),
      arrangeNodes: () => setText(arrangeNodes),
    }),
    [setText],
  );
