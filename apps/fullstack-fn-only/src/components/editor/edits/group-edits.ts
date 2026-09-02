import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { collectionOf, contentOf, editDocument, isRecord, pruneLayout } from "./edit-document";
import type { RawRecord } from "./edit-document";
import {
  boundaryIdsIn,
  forgetBoundaryRect,
  groupsIn,
  holdsNode,
  nodeIdsIn,
  parentsIn,
  placeOrphanedBoundaries,
  repairGroups,
  type RawGroup,
} from "./group-repair";

/**
 * Making and dissolving groups.
 *
 * All content: a group has no geometry, so nothing here writes a coordinate.
 * The one exception runs the other way — a boundary that stops being grouped
 * has to be handed the rectangle it was being drawn with, because a boundary in
 * no group carries its own.
 *
 * Every function refuses rather than corrects. A gesture that would break an
 * invariant returns the text byte-identical, and the caller says why: refusing
 * in one place is what keeps the rules checkable in one function instead of at
 * every call site.
 */

/** Why a grouping gesture was refused, in words a person can act on. */
export type GroupRefusal =
  | "not-enough"
  | "unknown-member"
  | "cycle"
  | "two-boundaries"
  | "no-node"
  | "already-grouped";

export const REFUSAL_MESSAGES: Record<GroupRefusal, string> = {
  "not-enough": "Select at least two things to group them.",
  "unknown-member": "That is not part of this diagram.",
  cycle: "A group cannot be put inside itself.",
  "two-boundaries": "A group is framed by at most one boundary.",
  "no-node": "A group needs at least one tile in it.",
  "already-grouped": "That already belongs to another group. Ungroup it first.",
};

/** The chain of groups above an element, innermost first. */
const ancestorsOf = (id: string, parent: ReadonlyMap<string, string>): string[] => {
  const chain: string[] = [];
  const seen = new Set<string>([id]);

  let current = parent.get(id);
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parent.get(current);
  }

  return chain;
};

/**
 * The group that already holds all of these, or `undefined` for the top level.
 *
 * Where the new group goes. Grouping a subset of a group's members has to nest
 * inside it, not pull them out into a sibling: a parent left holding only its
 * boundary has nothing to frame, which is a document this editor's own
 * validator rejects.
 */
const nearestCommonAncestor = (
  members: readonly string[],
  parent: ReadonlyMap<string, string>,
): string | undefined => {
  const chains = members.map((member) => ancestorsOf(member, parent));
  const first = chains[0];
  if (!first) return undefined;

  return first.find((candidate) => chains.every((chain) => chain.includes(candidate)));
};

/** Removes an id from every group's member list. */
const detach = (document: RawRecord, id: string): void => {
  for (const group of groupsIn(document)) {
    if (!group.members.includes(id)) continue;
    group.raw.members = group.members.filter((member) => member !== id);
  }
};

/**
 * Whether the members would form a group the format allows.
 *
 * The two rules that make a group resolvable — at most one boundary, at least
 * one node — plus the one that keeps membership a tree.
 */
const refuse = (
  document: RawRecord,
  memberIds: readonly string[],
  minimum: number,
): GroupRefusal | null => {
  if (memberIds.length < minimum) return "not-enough";

  const nodeIds = nodeIdsIn(document);
  const boundaryIds = boundaryIdsIn(document);
  const groups = groupsIn(document);
  const byId = new Map(groups.map((group) => [group.id, group]));

  for (const id of memberIds) {
    if (!nodeIds.has(id) && !boundaryIds.has(id) && !byId.has(id)) return "unknown-member";
  }

  if (memberIds.filter((id) => boundaryIds.has(id)).length > 1) return "two-boundaries";

  const holdsANode = memberIds.some((id) => {
    if (nodeIds.has(id)) return true;
    const group = byId.get(id);
    return group ? holdsNode(group, byId, nodeIds) : false;
  });
  if (!holdsANode) return "no-node";

  // A group cannot be put inside something it already contains.
  const parent = parentsIn(document);
  const selected = new Set(memberIds);
  for (const id of memberIds) {
    if (ancestorsOf(id, parent).some((ancestor) => selected.has(ancestor))) return "cycle";
  }

  return null;
};

/**
 * Groups elements, nesting the new group where they already belonged.
 *
 * When the selection spans several parents, the new group lands in the nearest
 * one that holds all of them — the top level, if there is no such group — and
 * every parent it emptied is dissolved on the way out.
 */
export const createGroup = (
  text: string,
  id: string,
  memberIds: readonly string[],
  diagram: ResolvedDiagram | null,
): string =>
  editDocument(text, (document) => {
    const content = contentOf(document);
    if (!content) return false;
    if (refuse(document, memberIds, 2)) return false;

    const home = nearestCommonAncestor(memberIds, parentsIn(document));

    for (const member of memberIds) detach(document, member);

    const groups = collectionOf(document, "groups") ?? [];
    content.groups = [...groups, { id, members: [...memberIds] }];

    if (home !== undefined) {
      const parent = groupsIn(document).find((group) => group.id === home);
      if (parent) parent.raw.members = [...parent.members, id];
    }

    repairGroups(document, diagram);
    return true;
  });

/**
 * Dissolves a group, promoting what it held to where the group itself was.
 *
 * Nothing moves: the members keep every position they had, and a boundary that
 * was being sized by the group is handed the rectangle it was drawn with.
 */
export const ungroup = (text: string, id: string, diagram: ResolvedDiagram | null): string =>
  editDocument(text, (document) => {
    const content = contentOf(document);
    if (!content) return false;

    const groups = groupsIn(document);
    const doomed = groups.find((group) => group.id === id);
    if (!doomed) return false;

    content.groups = groups
      .filter((group) => group.id !== id)
      .map((group) => {
        if (!group.members.includes(id)) return group.raw;

        group.raw.members = group.members.flatMap((member) =>
          member === id ? doomed.members : [member],
        );
        return group.raw;
      });

    repairGroups(document, diagram);
    return true;
  });

/** Adds one element to an existing group, if the result would still validate. */
export const addMember = (
  text: string,
  groupId: string,
  memberId: string,
  diagram: ResolvedDiagram | null,
): string =>
  editDocument(text, (document) => {
    const group = groupsIn(document).find((candidate) => candidate.id === groupId);
    if (!group || group.members.includes(memberId)) return false;

    if (parentsIn(document).has(memberId)) return false;
    if (refuse(document, [...group.members, memberId], 1)) return false;

    group.raw.members = [...group.members, memberId];
    forgetBoundaryRect(document, memberId);
    pruneLayout(document);
    repairGroups(document, diagram);
    return true;
  });

/** Takes one element out of a group, unless that would leave it with no node. */
export const removeMember = (
  text: string,
  groupId: string,
  memberId: string,
  diagram: ResolvedDiagram | null,
): string =>
  editDocument(text, (document) => {
    const group = groupsIn(document).find((candidate) => candidate.id === groupId);
    if (!group || !group.members.includes(memberId)) return false;

    const remaining = group.members.filter((member) => member !== memberId);
    // Refused rather than repaired: the author asked for one element to leave,
    // and dissolving the group around it is not what they asked for.
    if (remaining.length > 0 && refuse(document, remaining, 1)) return false;

    group.raw.members = remaining;
    placeOrphanedBoundaries(document, diagram);
    repairGroups(document, diagram);
    return true;
  });

/**
 * Why a grouping gesture would be refused, or `null` if it would go through.
 *
 * Exported so the caller can say what happened. The check runs against the same
 * rules the edit does, from the same text, so the two cannot disagree.
 */
export const groupRefusal = (
  text: string,
  memberIds: readonly string[],
): GroupRefusal | "unparseable" | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return "unparseable";
  }

  if (!isRecord(parsed)) return "unparseable";
  return refuse(parsed, memberIds, 2);
};

export type { RawGroup };
