import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@diagram-tool/web-ui";
import type { DiagramConfig } from "@diagram-tool/domain/schemas";
import { downloadSvg, downloadSvgAsPng } from "@/lib/export-png";
import { clientToViewBox, hitTestNode } from "@/components/editor/pointer-geometry";

interface DiagramPreviewProps {
  svg: string | null;
  title: string;
  /** Needed to hit-test tiles. `null` while the config does not validate. */
  config?: DiagramConfig | null;
  /** Omit to render a preview that cannot be dragged. Snaps to the grid. */
  onNodeMove?: (id: string, x: number, y: number) => void;
  /** Writes a position verbatim. Used to undo a cancelled drag exactly. */
  onNodeRestore?: (id: string, x: number, y: number) => void;
  selectedNodeId?: string | null;
  onSelectNode?: (id: string | null) => void;
}

interface DragState {
  id: string;
  /** Where the node started, so Escape can put it back. */
  originX: number;
  originY: number;
  pointerId: number;
  /** Set once the pointer actually moves, to tell a drag from a click. */
  moved: boolean;
}

/**
 * The preview pane.
 *
 * The SVG is injected as markup rather than rebuilt as a React tree on purpose:
 * one renderer, shared with the server, is what guarantees the exported PNG
 * matches what is on screen. The markup is not attacker-controlled — it comes
 * from our own renderer, from a schema-validated config, with every
 * interpolated string XML-escaped.
 *
 * Dragging writes through `onNodeMove` back into the editor's text. The preview
 * holds no copy of the config; it re-renders because the text changed, which is
 * what keeps the canvas and the JSON from ever disagreeing.
 */
export function DiagramPreview({
  svg,
  title,
  config = null,
  onNodeMove,
  onNodeRestore,
  selectedNodeId = null,
  onSelectNode,
}: DiagramPreviewProps) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [overTile, setOverTile] = useState(false);
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const interactive = Boolean(config && (onNodeMove ?? onSelectNode));

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const svgElement = containerRef.current?.querySelector("svg");
    if (!svgElement) return undefined;
    return clientToViewBox(svgElement, event.clientX, event.clientY);
  };

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!config || !interactive) return;

    const point = pointAt(event);
    if (!point) return;

    const node = hitTestNode(config, point);
    if (!node) {
      onSelectNode?.(null);
      return;
    }

    onSelectNode?.(node.id);
    if (!onNodeMove) return;

    dragRef.current = {
      id: node.id,
      originX: node.x,
      originY: node.y,
      pointerId: event.pointerId,
      moved: false,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Stops the browser turning the gesture into a text selection.
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!config) return;

    const point = pointAt(event);
    if (!point) return;

    const drag = dragRef.current;
    if (!drag) {
      setOverTile(Boolean(hitTestNode(config, point)));
      return;
    }

    drag.moved = true;
    onNodeMove?.(drag.id, point.x, point.y);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    stopDrag();
  };

  // Escape abandons the drag and puts the node back where it started. The
  // listener is on the window because pointer capture means the keyboard focus
  // is wherever it was before the gesture began.
  useEffect(() => {
    if (!dragging) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const drag = dragRef.current;
      // Restored verbatim rather than through `onNodeMove`: the node's original
      // position need not sit on the grid, and snapping it here would move a
      // node the user just decided not to move.
      if (drag) (onNodeRestore ?? onNodeMove)?.(drag.id, drag.originX, drag.originY);
      stopDrag();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dragging, onNodeMove, onNodeRestore, stopDrag]);

  const handleExportPng = async () => {
    if (!svg) return;
    setExportError(null);
    try {
      await downloadSvgAsPng(svg, `${title}.png`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export failed");
    }
  };

  const cursor = dragging ? "cursor-grabbing" : overTile ? "cursor-grab" : "";

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Preview</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!svg}
            onClick={() => svg && downloadSvg(svg, `${title}.svg`)}
          >
            Download SVG
          </Button>
          <Button size="sm" disabled={!svg} onClick={handleExportPng}>
            Export PNG (2x)
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-4">
        {svg ? (
          <div
            ref={containerRef}
            data-testid="diagram-canvas"
            data-selected-node={selectedNodeId ?? undefined}
            role="presentation"
            className={`max-w-full touch-none [&>svg]:h-auto [&>svg]:max-w-full ${cursor}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => setOverTile(false)}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Fix the problems on the left to see the diagram.
          </p>
        )}
      </div>

      {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}
    </div>
  );
}
