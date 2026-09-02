import type { DiagramFrame } from "@diagram-tool/domain/render";
import { boundaryBounds, nodeBounds, union } from "@diagram-tool/domain/render";
import type { DiagramContent, DiagramGroup, ResolvedDiagram } from "@diagram-tool/domain/schemas";

/**
 * Reading the group tree the document describes.
 *
 * Every function here is total on a document that does not validate as well as
 * one that does: these run against the *last good* document while the user is
 * mid-edit, and a lookup that overflows its stack on a cycle would take the
 * canvas down with it. So the walks carry a visited set rather than trusting
 * the validator to have got there first.
 */

/** The group holding this element directly, if any. */
export const parentGroup = (content: DiagramContent, id: string): DiagramGroup | undefined =>
  content.groups.find((group) => group.members.includes(id));

/**
 * The outermost group this element belongs to.
 *
 * What a click selects: pressing a tile picks the largest thing it is part of,
 * and entering that group is what lets the next click reach inside it. Figma,
 * tldraw and Excalidraw all behave this way, and it is what makes a group
 * feel like one object rather than a label on several.
 */
export const outermostGroup = (content: DiagramContent, id: string): DiagramGroup | undefined => {
  const seen = new Set<string>([id]);
  let outermost: DiagramGroup | undefined;
  let current = parentGroup(content, id);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    outermost = current;
    current = parentGroup(content, current.id);
  }

  return outermost;
};

/** Whether `id` is inside `groupId`, however deeply. */
export const isInsideGroup = (content: DiagramContent, groupId: string, id: string): boolean => {
  const seen = new Set<string>([id]);
  let current = parentGroup(content, id);

  while (current && !seen.has(current.id)) {
    if (current.id === groupId) return true;
    seen.add(current.id);
    current = parentGroup(content, current.id);
  }

  return false;
};

/** Every node under a group, however deeply nested. */
export const descendantNodeIds = (content: DiagramContent, groupId: string): string[] => {
  const nodeIds = new Set(content.nodes.map((node) => node.id));
  const groupById = new Map(content.groups.map((group) => [group.id, group]));

  const found: string[] = [];
  const seen = new Set<string>([groupId]);
  const pending = [...(groupById.get(groupId)?.members ?? [])];

  while (pending.length > 0) {
    const member = pending.pop();
    if (member === undefined || seen.has(member)) continue;
    seen.add(member);

    if (nodeIds.has(member)) {
      found.push(member);
      continue;
    }

    const nested = groupById.get(member);
    if (nested) pending.push(...nested.members);
  }

  return found;
};

/** Every element under a group — nodes, boundaries and nested groups alike. */
export const descendantIds = (content: DiagramContent, groupId: string): string[] => {
  const groupById = new Map(content.groups.map((group) => [group.id, group]));

  const found: string[] = [];
  const seen = new Set<string>([groupId]);
  const pending = [...(groupById.get(groupId)?.members ?? [])];

  while (pending.length > 0) {
    const member = pending.pop();
    if (member === undefined || seen.has(member)) continue;
    seen.add(member);
    found.push(member);

    const nested = groupById.get(member);
    if (nested) pending.push(...nested.members);
  }

  return found;
};

/**
 * The rectangle a group covers, for the selection halo.
 *
 * The only rectangle a group ever has, and it exists in the editor's overlay
 * rather than in the document: a group is never drawn, so this must never reach
 * the renderer.
 */
export const groupBounds = (
  content: DiagramContent,
  diagram: ResolvedDiagram,
  groupId: string,
): DiagramFrame | null => {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const boundaryById = new Map(diagram.boundaries.map((boundary) => [boundary.id, boundary]));

  const parts = descendantIds(content, groupId).flatMap((id) => {
    const node = nodeById.get(id);
    if (node) return [nodeBounds(node)];

    const boundary = boundaryById.get(id);
    return boundary ? [boundaryBounds(boundary)] : [];
  });

  const first = parts[0];
  if (!first) return null;

  const bounds = parts.reduce(union, first);

  return {
    x: bounds.minX,
    y: bounds.minY,
    w: bounds.maxX - bounds.minX,
    h: bounds.maxY - bounds.minY,
  };
};
