import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import {
  collectionOf,
  contentOf,
  existingLayoutBranch,
  isRecord,
  layoutBranch,
  type RawRecord,
} from "./edit-document";

/**
 * Putting a document back into a shape its own validator accepts.
 *
 * Two of the format's invariants are easy to break with a perfectly reasonable
 * gesture: deleting the last tile inside a group leaves a group with nothing to
 * keep together, and dissolving a group leaves its boundary with no geometry.
 * Repairing both here beats reporting them, and it is the same repair whether
 * the gesture was a delete, an ungroup or a regroup — so it lives in one place
 * that all three call.
 */

/** Every group in the document, as plain data plus the record to mutate. */
export interface RawGroup {
  id: string;
  members: string[];
  raw: RawRecord;
}

export const groupsIn = (document: RawRecord): RawGroup[] =>
  (collectionOf(document, "groups") ?? []).filter(isRecord).map((group) => ({
    id: String(group.id),
    members: Array.isArray(group.members) ? group.members.map(String) : [],
    raw: group,
  }));

export const nodeIdsIn = (document: RawRecord): Set<string> =>
  new Set((collectionOf(document, "nodes") ?? []).filter(isRecord).map((node) => String(node.id)));

export const boundaryIdsIn = (document: RawRecord): Set<string> =>
  new Set(
    (collectionOf(document, "boundaries") ?? [])
      .filter(isRecord)
      .map((boundary) => String(boundary.id)),
  );

/** The group each element sits in directly. */
export const parentsIn = (document: RawRecord): Map<string, string> => {
  const parent = new Map<string, string>();

  for (const group of groupsIn(document)) {
    for (const member of group.members) {
      if (!parent.has(member)) parent.set(member, group.id);
    }
  }

  return parent;
};

/** Whether a group holds a node at all, directly or through nesting. */
export const holdsNode = (
  group: RawGroup,
  byId: ReadonlyMap<string, RawGroup>,
  nodeIds: ReadonlySet<string>,
  seen: Set<string> = new Set(),
): boolean => {
  if (seen.has(group.id)) return false;
  seen.add(group.id);

  return group.members.some((member) => {
    if (nodeIds.has(member)) return true;
    const nested = byId.get(member);
    return nested ? holdsNode(nested, byId, nodeIds, seen) : false;
  });
};

/**
 * Dissolves any group left holding no node, and gives an orphaned boundary a
 * rectangle.
 *
 * Whatever a dissolved group held is promoted to where the group itself was,
 * rather than dropped: those elements did not stop belonging anywhere just
 * because the thing keeping them together went away. And a boundary that ends
 * up in no group needs geometry of its own — the rectangle it had on screen a
 * moment ago is the only answer that does not move it.
 */
export const repairGroups = (document: RawRecord, diagram: ResolvedDiagram | null): void => {
  const content = contentOf(document);
  if (!content) return;

  const nodeIds = nodeIdsIn(document);

  // Dissolving one group can empty its parent, so this runs until nothing else
  // changes rather than once. Bounded by the number of groups.
  for (let pass = 0; pass < 32; pass += 1) {
    const groups = groupsIn(document);
    const byId = new Map(groups.map((group) => [group.id, group]));

    const doomed = groups.find((group) => !holdsNode(group, byId, nodeIds));
    if (!doomed) break;

    content.groups = groups
      .filter((group) => group.id !== doomed.id)
      .map((group) => {
        if (!group.members.includes(doomed.id)) return group.raw;

        group.raw.members = group.members.flatMap((member) =>
          member === doomed.id ? doomed.members : [member],
        );
        return group.raw;
      });
  }

  placeOrphanedBoundaries(document, diagram);
};

/** Gives every boundary that belongs to no group the rectangle it needs. */
export const placeOrphanedBoundaries = (
  document: RawRecord,
  diagram: ResolvedDiagram | null,
): void => {
  const grouped = new Set(groupsIn(document).flatMap((group) => group.members));

  for (const id of boundaryIdsIn(document)) {
    if (grouped.has(id)) continue;
    if (existingLayoutBranch(document, "boundaries")?.[id]) continue;

    const drawn = diagram?.boundaries.find((candidate) => candidate.id === id);
    layoutBranch(document, "boundaries")[id] = drawn
      ? { x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h }
      : { x: 0, y: 0, w: 200, h: 140 };
  }
};

/** Drops a rectangle a boundary is no longer allowed to carry. */
export const forgetBoundaryRect = (document: RawRecord, id: string): void => {
  const branch = existingLayoutBranch(document, "boundaries");
  if (branch) delete branch[id];
};
