/**
 * What is currently picked on the canvas.
 *
 * One kind, several ids. Keeping the kind single is deliberate: the bin, the
 * Delete key, the inspector and the grouping shortcuts all need to know *what*
 * they are looking at, and a mixed selection would make every one of them
 * invent a tie-break. Shift-clicking a different kind replaces the selection
 * rather than mixing it.
 */

export type SelectionKind = "node" | "boundary" | "group";

export interface Selection {
  kind: SelectionKind;
  /** Never empty: an empty selection is `null`. */
  ids: string[];
}

export type MaybeSelection = Selection | null;

export const selectionOf = (kind: SelectionKind, id: string): Selection => ({ kind, ids: [id] });

export const isSelected = (selection: MaybeSelection, kind: SelectionKind, id: string): boolean =>
  selection?.kind === kind && selection.ids.includes(id);

export const isNode = (selection: MaybeSelection, id: string): boolean =>
  isSelected(selection, "node", id);

export const isBoundary = (selection: MaybeSelection, id: string): boolean =>
  isSelected(selection, "boundary", id);

/** The single id a selection names, or `null` when it names several. */
export const onlyId = (selection: MaybeSelection): string | null =>
  selection && selection.ids.length === 1 ? (selection.ids[0] ?? null) : null;

/**
 * Adds or removes one thing, for a shift-click.
 *
 * A different kind replaces the selection outright. Removing the last id
 * clears it, so an empty selection is always `null` rather than a kind with
 * nothing in it.
 */
export const toggled = (
  selection: MaybeSelection,
  kind: SelectionKind,
  id: string,
): MaybeSelection => {
  if (!selection || selection.kind !== kind) return selectionOf(kind, id);

  const ids = selection.ids.includes(id)
    ? selection.ids.filter((candidate) => candidate !== id)
    : [...selection.ids, id];

  return ids.length > 0 ? { kind, ids } : null;
};

export const sameSelection = (a: MaybeSelection, b: MaybeSelection): boolean => {
  if (!a || !b) return a === b;
  return (
    a.kind === b.kind &&
    a.ids.length === b.ids.length &&
    a.ids.every((id, index) => id === b.ids[index])
  );
};
