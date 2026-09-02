import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AnchorSide, CanvasTone } from "@diagram-tool/domain/constants";
import type { Point } from "@diagram-tool/domain/render";
import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import {
  addBoundary,
  addEdge,
  addNode,
  removeBoundary,
  removeEdge,
  removeNode,
  setBackground,
  updateBoundaryFields,
  updateEdgeFields,
  updateNodeFields,
  type BoundaryPatch,
  type EdgePatch,
  type NodePatch,
} from "@/components/editor/edits/content-edits";
import {
  clearNodeLayout,
  moveBoundary,
  moveNode,
  moveNodes,
  placeBoundary,
  resizeBoundary,
  setEdgeAnchors,
  setNodePosition,
} from "@/components/editor/edits/layout-edits";
import { materialiseLayout } from "@/components/editor/edits/materialise";

/**
 * Every visual edit, bound to the editor's `setText`.
 *
 * Each one goes through the functional form of `setText`, so a drag emitting
 * many moves in a frame always reads the latest text rather than the one
 * captured when the handler was created.
 *
 * The `diagram` argument is what is currently on screen. It is needed for two
 * things and nothing else: pinning the drawing before a gesture that could
 * re-flow it, and handing a boundary its rectangle when the group it framed
 * disappears.
 */
export const useDiagramEditing = (
  setText: Dispatch<SetStateAction<string>>,
  diagram: ResolvedDiagram | null,
) =>
  useMemo(() => {
    /**
     * Pins what is on screen before running an edit that could re-flow it.
     *
     * Applies to anything that moves an element or changes the set of them.
     * Not to a field edit, which cannot change geometry — and never to Arrange,
     * whose entire job is to unpin.
     */
    const settled =
      (edit: (text: string) => string) =>
      (text: string): string =>
        edit(diagram ? materialiseLayout(text, diagram) : text);

    return {
      moveNode: (id: string, x: number, y: number) =>
        setText(settled((text) => moveNode(text, id, x, y))),
      moveNodes: (points: Readonly<Record<string, Point>>) =>
        setText(settled((text) => moveNodes(text, points))),
      setNodePosition: (id: string, point: Point | null) =>
        setText((text) => setNodePosition(text, id, point)),
      updateNodeFields: (id: string, patch: NodePatch) =>
        setText((text) => updateNodeFields(text, id, patch)),
      addNode: (node: Record<string, unknown>, at: Point) =>
        setText(settled((text) => addNode(text, node, at))),
      removeNode: (id: string) => setText(settled((text) => removeNode(text, id, diagram))),

      addBoundary: (boundary: Record<string, unknown>, rect: Point & { w: number; h: number }) =>
        setText(
          settled((text) => placeBoundary(addBoundary(text, boundary), String(boundary.id), rect)),
        ),
      updateBoundaryFields: (id: string, patch: BoundaryPatch) =>
        setText((text) => updateBoundaryFields(text, id, patch)),
      moveBoundary: (id: string, x: number, y: number) =>
        setText(settled((text) => moveBoundary(text, id, x, y))),
      resizeBoundary: (id: string, rect: Point & { w: number; h: number }) =>
        setText(settled((text) => resizeBoundary(text, id, rect))),
      removeBoundary: (id: string) => setText(settled((text) => removeBoundary(text, id, diagram))),

      addEdge: (edge: Record<string, unknown>) => setText(settled((text) => addEdge(text, edge))),
      updateEdgeFields: (id: string, patch: EdgePatch) =>
        setText((text) => updateEdgeFields(text, id, patch)),
      setEdgeAnchors: (id: string, anchors: { out?: AnchorSide; inn?: AnchorSide }) =>
        setText((text) => setEdgeAnchors(text, id, anchors)),
      removeEdge: (id: string) => setText(settled((text) => removeEdge(text, id))),

      setBackground: (tone: CanvasTone) => setText((text) => setBackground(text, tone)),
      arrangeNodes: () => setText(clearNodeLayout),
    };
  }, [setText, diagram]);
