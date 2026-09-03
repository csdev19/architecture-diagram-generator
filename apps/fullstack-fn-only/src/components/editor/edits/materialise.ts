import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { editDocument, isRecord, layoutBranch, type RawRecord } from "./edit-document";

/**
 * Writes down where everything already is, before anything moves it.
 *
 * Auto-layout is a function of the whole document, so supplying a position for
 * one tile — or adding a tile at all — can legally move the tiles that had no
 * position of their own. That is correct for a document and wrong for a
 * gesture: the user moved one thing and expects one thing to move.
 *
 * So the first touch that could re-flow the drawing pins what is on screen,
 * and from then on the picture only changes where it is told to. Nothing that
 * already has a position is touched, so this is a no-op on a document the
 * editor has been working in.
 *
 * Only positions and the rectangles of ungrouped boundaries are written. A
 * grouped boundary is derived from its members by definition, and pinning one
 * would be writing down a contradiction the validator rejects.
 */
export const materialiseLayout = (text: string, diagram: ResolvedDiagram): string =>
  editDocument(text, (document) => {
    let changed = false;

    const grouped = new Set(
      (
        (isRecord(document.content) && Array.isArray(document.content.groups)
          ? document.content.groups
          : []) as unknown[]
      )
        .filter(isRecord)
        .flatMap((group) => (Array.isArray(group.members) ? group.members.map(String) : [])),
    );

    const nodes = existing(document, "nodes");
    for (const node of diagram.nodes) {
      if (nodes && node.id in nodes) continue;

      layoutBranch(document, "nodes")[node.id] = { x: node.x, y: node.y };
      changed = true;
    }

    const boundaries = existing(document, "boundaries");
    for (const boundary of diagram.boundaries) {
      if (grouped.has(boundary.id)) continue;
      if (boundaries && boundary.id in boundaries) continue;

      layoutBranch(document, "boundaries")[boundary.id] = {
        x: boundary.x,
        y: boundary.y,
        w: boundary.w,
        h: boundary.h,
      };
      changed = true;
    }

    return changed;
  });

const existing = (document: RawRecord, kind: "nodes" | "boundaries"): RawRecord | undefined => {
  const layout = isRecord(document.layout) ? document.layout : undefined;
  if (!layout) return undefined;

  return isRecord(layout[kind]) ? (layout[kind] as RawRecord) : undefined;
};
