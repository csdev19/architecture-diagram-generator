import type { AnchorSide } from "@diagram-tool/domain/constants";
import type { Point } from "@diagram-tool/domain/render";
import {
  dropLayoutEntry,
  editDocument,
  existingLayoutBranch,
  isRecord,
  layoutBranch,
  pruneLayout,
  snapToGrid,
} from "./edit-document";

/**
 * Edits that write only inside `layout`.
 *
 * A drag says where something sits and nothing else, so it must not be able to
 * touch a name, a tone or a relationship. Keeping the two halves in separate
 * modules is what makes that visible at the call site as well as in the diff.
 */

/** Moves a node's centre, snapped to the grid. Nothing is out of bounds. */
export const moveNode = (text: string, id: string, x: number, y: number): string =>
  editDocument(text, (document) => {
    layoutBranch(document, "nodes")[id] = { x: snapToGrid(x), y: snapToGrid(y) };
    return true;
  });

/**
 * Writes several positions at once, so a group drag is one entry in the undo
 * history rather than one per tile.
 *
 * Written verbatim, unlike a single move: snapping each position on its own
 * would move the members by different amounts and shear the group apart. The
 * caller snaps the delta once instead, which keeps every internal distance
 * exactly as it was.
 */
export const moveNodes = (text: string, points: Readonly<Record<string, Point>>): string =>
  editDocument(text, (document) => {
    const entries = Object.entries(points);
    if (entries.length === 0) return false;

    const branch = layoutBranch(document, "nodes");
    for (const [id, point] of entries) {
      branch[id] = { x: point.x, y: point.y };
    }

    return true;
  });

/**
 * Puts a node back where a cancelled drag found it.
 *
 * `null` deletes the entry rather than writing one: a node with no supplied
 * position is a node auto-layout is placing, and cancelling a drag on it must
 * hand it back to auto-layout rather than pin it where the gesture began.
 * Written verbatim, without snapping, for the same reason it always was — a
 * position is not required to sit on the grid, and restoring through the
 * snapping path would quietly relocate a node nobody meant to move.
 */
export const setNodePosition = (text: string, id: string, point: Point | null): string =>
  editDocument(text, (document) => {
    if (!point) return dropLayoutEntry(document, "nodes", id);

    layoutBranch(document, "nodes")[id] = { x: point.x, y: point.y };
    return true;
  });

/** Moves an ungrouped boundary's top-left corner, snapped. Its size is unchanged. */
export const moveBoundary = (text: string, id: string, x: number, y: number): string =>
  editDocument(text, (document) => {
    const branch = existingLayoutBranch(document, "boundaries");
    const rect = branch?.[id];
    // A grouped boundary has no rectangle to move: it is sized by what it
    // frames, and moving its members is what moves it.
    if (!isRecord(rect)) return false;

    rect.x = snapToGrid(x);
    rect.y = snapToGrid(y);
    return true;
  });

/**
 * Resizes an ungrouped boundary. A grouped one changes its padding instead.
 *
 * Unsnapped, unlike everything a pointer writes: this is the inspector's path,
 * and a number someone typed is exactly the number they meant. Rounding 500 to
 * 494 in a field they are looking at reads as the editor ignoring them.
 */
export const resizeBoundary = (
  text: string,
  id: string,
  rect: { x: number; y: number; w: number; h: number },
): string =>
  editDocument(text, (document) => {
    const branch = existingLayoutBranch(document, "boundaries");
    if (!branch || !isRecord(branch[id])) return false;

    branch[id] = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    return true;
  });

/** Places a boundary that belongs to no group. */
export const placeBoundary = (
  text: string,
  id: string,
  rect: { x: number; y: number; w: number; h: number },
): string =>
  editDocument(text, (document) => {
    layoutBranch(document, "boundaries")[id] = {
      x: snapToGrid(rect.x),
      y: snapToGrid(rect.y),
      w: snapToGrid(rect.w),
      h: snapToGrid(rect.h),
    };
    return true;
  });

/** Writes the sides an edge leaves and arrives at. Composition, not meaning. */
export const setEdgeAnchors = (
  text: string,
  id: string,
  anchors: { out?: AnchorSide; inn?: AnchorSide },
): string =>
  editDocument(text, (document) => {
    const branch = layoutBranch(document, "edges");
    const current = isRecord(branch[id]) ? (branch[id] as Record<string, unknown>) : {};

    branch[id] = { ...current, ...anchors };
    return true;
  });

/** Forgets every layout entry these ids owned. Used when an element is deleted. */
export const dropLayoutFor = (text: string, ids: readonly string[]): string =>
  editDocument(text, (document) => {
    let changed = false;

    for (const kind of ["nodes", "boundaries", "edges"] as const) {
      const branch = existingLayoutBranch(document, kind);
      if (!branch) continue;

      for (const id of ids) {
        if (!(id in branch)) continue;
        delete branch[id];
        changed = true;
      }
    }

    if (changed) pruneLayout(document);
    return changed;
  });

/**
 * Hands placement back to auto-layout.
 *
 * Arrange is the smallest mutation in the editor, and it is exactly what it
 * says: it forgets every position rather than computing new ones. The
 * rectangles of ungrouped boundaries survive — they are placed things, not
 * computed ones, and nothing about arranging the tiles moves them.
 */
export const clearNodeLayout = (text: string): string =>
  editDocument(text, (document) => {
    const branch = existingLayoutBranch(document, "nodes");
    if (!branch || Object.keys(branch).length === 0) return false;

    const layout = isRecord(document.layout) ? document.layout : undefined;
    if (!layout) return false;

    delete layout.nodes;
    pruneLayout(document);
    return true;
  });
