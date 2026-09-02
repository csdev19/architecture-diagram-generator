/**
 * What is currently picked on the canvas.
 *
 * Two kinds, one slot: selecting a group has to clear a selected tile and the
 * other way round, and the toolbar's bin, the Delete key and the inspector all
 * need to know which they are looking at. A pair of independent `selectedNodeId`
 * / `selectedGroupId` states would let both be set at once, and every reader
 * would have to invent its own tie-break.
 */
export type Selection = { kind: "node"; id: string } | { kind: "group"; id: string } | null;

export const isNode = (selection: Selection, id: string): boolean =>
  selection?.kind === "node" && selection.id === id;

export const isGroup = (selection: Selection, id: string): boolean =>
  selection?.kind === "group" && selection.id === id;
