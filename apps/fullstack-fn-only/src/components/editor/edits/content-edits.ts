import type { CanvasTone } from "@diagram-tool/domain/constants";
import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { deriveEdgeIds } from "@diagram-tool/domain/schemas";
import {
  collectionOf,
  contentOf,
  editDocument,
  existingLayoutBranch,
  findById,
  isRecord,
  layoutBranch,
  pruneLayout,
  snapToGrid,
  type RawRecord,
} from "./edit-document";

/**
 * Edits that write only inside `content`.
 *
 * Renaming a technology, changing a tone, adding a relationship: everything
 * that changes what the architecture *is*, and nothing that changes where it
 * sits. The exception is deletion, which has to reach into `layout` — not to
 * move anything, but to take the entries the deleted element owned with it. A
 * layout key naming something that is gone is a validation error, and the
 * author who deleted a tile did not ask to be handed one.
 */

type NodeInput = Record<string, unknown>;
type BoundaryInput = Record<string, unknown>;
type EdgeInput = Record<string, unknown>;

/** A partial update. A field set to `undefined` is removed. */
export type NodePatch = Record<string, unknown>;
export type BoundaryPatch = Record<string, unknown>;
export type EdgePatch = Record<string, unknown>;

const patch = (target: RawRecord, fields: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
};

/**
 * The id each raw edge answers to, in array order.
 *
 * An id is optional in the text, so the ids the schema *would* derive are
 * computed rather than read: matching on a raw `id` field alone would find
 * nothing in a document that never wrote one, the seed included.
 * `deriveEdgeIds` comes from the domain, so there is exactly one answer to the
 * question of which edge an id names.
 */
const UNIDENTIFIABLE = { id: undefined, from: "", to: "" } as const;

const effectiveEdgeIds = (edges: readonly unknown[]): string[] =>
  deriveEdgeIds(
    edges.map((edge) =>
      isRecord(edge) && typeof edge.from === "string" && typeof edge.to === "string"
        ? { id: typeof edge.id === "string" ? edge.id : undefined, from: edge.from, to: edge.to }
        : UNIDENTIFIABLE,
    ),
  ).map((edge) => edge.id);

// ---------------------------------------------------------------- nodes

/** Patches a node's fields. A field set to `undefined` is removed. */
export const updateNodeFields = (text: string, id: string, fields: NodePatch): string =>
  editDocument(text, (document) => {
    const node = findById(document, "nodes", id);
    if (!node) return false;

    patch(node, fields);
    return true;
  });

/**
 * Appends a node, and pins it where it was dropped.
 *
 * A tile put somewhere on purpose is a supplied position by definition, so this
 * writes both halves: the node into `content`, the point into `layout`. The
 * caller owns id uniqueness; the schema reports a clash.
 */
export const addNode = (text: string, node: NodeInput, at: { x: number; y: number }): string =>
  editDocument(text, (document) => {
    const nodes = collectionOf(document, "nodes");
    if (!nodes) return false;

    nodes.push({ ...node });
    layoutBranch(document, "nodes")[String(node.id)] = { x: snapToGrid(at.x), y: snapToGrid(at.y) };
    return true;
  });

/**
 * Removes a node, every edge that touched it, and every layout entry they owned.
 *
 * The edges go with it rather than being left dangling: an edge naming a node
 * that no longer exists is invalid, and the author deleting a tile did not ask
 * to be handed two validation errors about relations they can no longer see.
 * The same reasoning reaches one step further in v2 — a group that is left with
 * no node in it is invalid too, so it is dissolved here rather than reported.
 */
export const removeNode = (text: string, id: string, diagram: ResolvedDiagram | null): string =>
  editDocument(text, (document) => {
    const nodes = collectionOf(document, "nodes");
    if (!nodes) return false;

    const kept = nodes.filter((node) => !isRecord(node) || node.id !== id);
    if (kept.length === nodes.length) return false;

    const content = contentOf(document);
    if (!content) return false;
    content.nodes = kept;

    const edges = collectionOf(document, "edges");
    if (edges) {
      const ids = effectiveEdgeIds(edges);
      const orphaned = new Set(
        ids.filter((_, index) => {
          const edge = edges[index];
          return isRecord(edge) && (edge.from === id || edge.to === id);
        }),
      );

      content.edges = edges.filter((_, index) => !orphaned.has(ids[index] as string));
      forgetLayout(document, [...orphaned, id]);
    } else {
      forgetLayout(document, [id]);
    }

    dropFromGroups(document, id);
    repairGroups(document, diagram);
    return true;
  });

// ------------------------------------------------------------ boundaries

/** Appends a boundary. Its geometry is the caller's business, not content's. */
export const addBoundary = (text: string, boundary: BoundaryInput): string =>
  editDocument(text, (document) => {
    const boundaries = collectionOf(document, "boundaries");
    const content = contentOf(document);
    if (!content) return false;

    // The renderer draws boundaries in array order, so the newest goes last to
    // sit on top of the ones it overlaps — which is also what makes hit-testing
    // back to front correct.
    content.boundaries = [...(boundaries ?? []), { ...boundary }];
    return true;
  });

/** Patches a boundary's fields — label, tone, padding. */
export const updateBoundaryFields = (text: string, id: string, fields: BoundaryPatch): string =>
  editDocument(text, (document) => {
    const boundary = findById(document, "boundaries", id);
    if (!boundary) return false;

    patch(boundary, fields);
    return true;
  });

/**
 * Removes a boundary and the rectangle it may have had.
 *
 * Nothing else goes with it: a boundary is a box drawn around things, not a
 * parent of them, which is what makes trying one cheap. The group it framed
 * survives — its members still belong together, they just stop being fenced.
 */
export const removeBoundary = (text: string, id: string, diagram: ResolvedDiagram | null): string =>
  editDocument(text, (document) => {
    const boundaries = collectionOf(document, "boundaries");
    const content = contentOf(document);
    if (!boundaries || !content) return false;

    const kept = boundaries.filter((boundary) => !isRecord(boundary) || boundary.id !== id);
    if (kept.length === boundaries.length) return false;

    content.boundaries = kept;
    forgetLayout(document, [id]);
    dropFromGroups(document, id);
    repairGroups(document, diagram);
    return true;
  });

// ----------------------------------------------------------------- edges

/**
 * Appends an edge, writing an id only when the derived one would be ambiguous.
 *
 * Normally the id stays out of the text: `from` and `to` already identify the
 * edge, and a field the author never has to write is one they never have to
 * read. The exception is a second connection between the same pair, whose
 * derived id depends on which of the two comes first in the array — reordering
 * them by hand would then swap their identities, which is the instability ids
 * exist to remove.
 */
export const addEdge = (text: string, edge: EdgeInput): string =>
  editDocument(text, (document) => {
    const edges = collectionOf(document, "edges");
    const content = contentOf(document);
    if (!content) return false;

    const existing = edges ?? [];
    const samePair = existing.some(
      (candidate) =>
        isRecord(candidate) && candidate.from === edge.from && candidate.to === edge.to,
    );

    if (!samePair) {
      content.edges = [...existing, { ...edge }];
      return true;
    }

    const taken = new Set(effectiveEdgeIds(existing));
    const base = `${String(edge.from)}-${String(edge.to)}`;
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    content.edges = [...existing, { ...edge, id }];
    return true;
  });

/** Patches the edge with this id — its label or its style, never its anchors. */
export const updateEdgeFields = (text: string, id: string, fields: EdgePatch): string =>
  editDocument(text, (document) => {
    const edges = collectionOf(document, "edges");
    if (!edges) return false;

    const edge = edges[effectiveEdgeIds(edges).indexOf(id)];
    if (!isRecord(edge)) return false;

    patch(edge, fields);
    return true;
  });

/** Removes the edge with this id, and the anchors it had in layout. */
export const removeEdge = (text: string, id: string): string =>
  editDocument(text, (document) => {
    const edges = collectionOf(document, "edges");
    const content = contentOf(document);
    if (!edges || !content) return false;

    const index = effectiveEdgeIds(edges).indexOf(id);
    if (index < 0) return false;

    content.edges = edges.filter((_, position) => position !== index);
    forgetLayout(document, [id]);
    return true;
  });

// ------------------------------------------------------------- the paper

/** Sets the paper tone. Content: it survives Arrange, like every semantic choice. */
export const setBackground = (text: string, tone: CanvasTone): string =>
  editDocument(text, (document) => {
    const content = contentOf(document);
    if (!content) return false;

    content.background = tone;
    return true;
  });

/** Renames the diagram. */
export const setTitle = (text: string, title: string): string =>
  editDocument(text, (document) => {
    const content = contentOf(document);
    if (!content) return false;

    content.title = title;
    return true;
  });

// ------------------------------------------------------------- the tidying

/** Forgets every layout entry these ids owned, wherever it lives. */
const forgetLayout = (document: RawRecord, ids: readonly string[]): void => {
  for (const kind of ["nodes", "boundaries", "edges"] as const) {
    const branch = existingLayoutBranch(document, kind);
    if (!branch) continue;

    for (const id of ids) delete branch[id];
  }

  pruneLayout(document);
};

/** Takes an id out of every group that held it. */
const dropFromGroups = (document: RawRecord, id: string): void => {
  const groups = collectionOf(document, "groups");
  if (!groups) return;

  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.members)) continue;
    group.members = group.members.filter((member) => member !== id);
  }
};

/**
 * Dissolves any group left holding no node, and gives an orphaned boundary a
 * rectangle.
 *
 * Deleting the last tile inside a group leaves a group with nothing to keep
 * together and, if it was framed, a boundary with nothing to enclose — a
 * document the validator rejects. Rather than hand the author that error for a
 * gesture that was perfectly reasonable, the group is dissolved and whatever it
 * held is promoted to where the group used to be. A boundary that ends up in no
 * group needs geometry of its own, and the rectangle it had on screen a moment
 * ago is the only answer that does not move it.
 */
const repairGroups = (document: RawRecord, diagram: ResolvedDiagram | null): void => {
  const content = contentOf(document);
  if (!content) return;

  const nodeIds = new Set(
    (collectionOf(document, "nodes") ?? []).filter(isRecord).map((node) => String(node.id)),
  );

  const groupsOf = () =>
    (collectionOf(document, "groups") ?? []).filter(isRecord).map((group) => ({
      id: String(group.id),
      members: Array.isArray(group.members) ? group.members.map(String) : [],
      raw: group,
    }));

  // Dissolving one group can empty its parent, so this runs until nothing else
  // changes rather than once. Bounded by the number of groups.
  for (let pass = 0; pass < 32; pass += 1) {
    const groups = groupsOf();
    const byId = new Map(groups.map((group) => [group.id, group]));

    const holdsNode = (group: (typeof groups)[number], seen: Set<string>): boolean => {
      if (seen.has(group.id)) return false;
      seen.add(group.id);

      return group.members.some((member) => {
        if (nodeIds.has(member)) return true;
        const nested = byId.get(member);
        return nested ? holdsNode(nested, seen) : false;
      });
    };

    const doomed = groups.find((group) => !holdsNode(group, new Set()));
    if (!doomed) break;

    content.groups = groups
      .filter((group) => group.id !== doomed.id)
      .map((group) => {
        if (!group.members.includes(doomed.id)) return group.raw;

        // Promoted rather than dropped: whatever the dissolved group held still
        // belongs where the group itself belonged.
        group.raw.members = group.members.flatMap((member) =>
          member === doomed.id ? doomed.members : [member],
        );
        return group.raw;
      });
  }

  // Any boundary that is no longer in a group has to carry its own rectangle.
  const grouped = new Set(
    (collectionOf(document, "groups") ?? [])
      .filter(isRecord)
      .flatMap((group) => (Array.isArray(group.members) ? group.members.map(String) : [])),
  );

  for (const boundary of (collectionOf(document, "boundaries") ?? []).filter(isRecord)) {
    const id = String(boundary.id);
    if (grouped.has(id)) continue;
    if (existingLayoutBranch(document, "boundaries")?.[id]) continue;

    const drawn = diagram?.boundaries.find((candidate) => candidate.id === id);
    layoutBranch(document, "boundaries")[id] = drawn
      ? { x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h }
      : { x: 0, y: 0, w: 200, h: 140 };
  }
};
