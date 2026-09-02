import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";
import { contentFrame, renderSVG } from "@diagram-tool/domain/render";
import type { DiagramConfig } from "@diagram-tool/domain/schemas";
import { clientToViewBox, hitTestGroup, hitTestNode } from "@/components/editor/pointer-geometry";
import type { Point } from "@/components/editor/pointer-geometry";
import { isGroup, isNode } from "@/components/editor/selection";
import type { Selection } from "@/components/editor/selection";
import { EDITOR_TOOLS, STAGE_CURSORS, toolHint } from "@/components/editor/editor-tools";
import type { EditorTool } from "@/components/editor/editor-tools";
import { StageToolbar } from "@/components/editor/stage-toolbar";
import { TILE_DRAG_MIME } from "@/components/editor/tile-catalog";
import { ZoomBar } from "@/components/editor/zoom-bar";
import { useStageView } from "@/components/editor/use-stage-view";
import type { StageInsets } from "@/components/editor/use-stage-view";

/**
 * The stage: an unbounded plane, seen through the window.
 *
 * There is no sheet on a table any more. The renderer is handed the rectangle
 * of the world the camera is looking at and draws into it, so the drawing
 * surface — background, grid and all — *is* the window, and every visible pixel
 * is somewhere a tile can go. Export asks the same renderer for the frame the
 * diagram implies instead, which is the only difference between the two.
 *
 * The SVG is injected as markup rather than rebuilt as a React tree on purpose:
 * one renderer, shared with the server, is what guarantees the exported PNG is
 * the same drawing as the one on screen. The markup is not attacker-controlled
 * — it comes from our own renderer, from a schema-validated config, with every
 * interpolated string XML-escaped.
 *
 * Selection and hover halos are drawn in a *separate* overlay SVG on top, never
 * into the scene. The alternative — marking chrome inside the drawing and
 * stripping it before export — makes correctness depend on remembering to
 * strip. Here the exported document is the one the renderer produced, byte for
 * byte, because the chrome was never in it.
 */

interface DiagramStageProps {
  /** The last config that validated. `null` before there is one. */
  config: DiagramConfig | null;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Source tile of an edge being drawn, once one has been picked. */
  edgeFrom: string | null;
  onPickEdgeEnd: (id: string) => void;
  /** Human name of the palette's chosen tile, for the hint line. */
  tileLabel: string;
  /** Places the palette's chosen tile. */
  onPlaceTile: (point: Point) => void;
  /** Places a specific tile, dropped from the palette. */
  onDropTile: (key: string, point: Point) => void;
  onNodeMove: (id: string, x: number, y: number) => void;
  /** Writes a position verbatim, so a cancelled drag undoes exactly. */
  onNodeRestore: (id: string, x: number, y: number) => void;
  onGroupMove: (id: string, x: number, y: number) => void;
  /** Commits a box drawn with the group tool. */
  onDrawGroup: (box: { x: number; y: number; w: number; h: number }) => void;
  onDeleteSelected: () => void;
  /** Which strips of the stage the floating panels are covering. */
  insets: StageInsets;
}

interface NodeDrag {
  kind: "node";
  id: string;
  /** Where the node started, so Escape can put it back. */
  originX: number;
  originY: number;
  pointerId: number;
}

interface GroupDrag {
  kind: "group";
  id: string;
  /** The grab offset, so the box does not jump its corner to the pointer. */
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  pointerId: number;
}

/** Drawing a new group: the corner it started from, in world units. */
interface GroupDraw {
  kind: "draw";
  fromX: number;
  fromY: number;
  pointerId: number;
}

interface PanDrag {
  kind: "pan";
  pointerId: number;
  clientX: number;
  clientY: number;
}

type Gesture = NodeDrag | GroupDrag | GroupDraw | PanDrag;

/** How far outside the tile the halo sits. */
const HALO_SLACK = 5;
const HALO_SIZE = DIAGRAM_GEOMETRY.TILE_SIZE + HALO_SLACK * 2;
const HALO_RADIUS = DIAGRAM_GEOMETRY.TILE_RADIUS + HALO_SLACK;

/** What the camera looks at before there is anything to look at. */
const EMPTY_CONTENT = { x: 0, y: 0, w: 0, h: 0 };

/** Below this in either direction, a group drag was a click that slipped. */
const MIN_GROUP_SIDE = DIAGRAM_GEOMETRY.GRID_CELL * 2;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The rectangle between two corners, whichever way the drag went. */
const boxBetween = (from: Point, to: Point): Box => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  w: Math.abs(to.x - from.x),
  h: Math.abs(to.y - from.y),
});

export function DiagramStage({
  config,
  tool,
  onToolChange,
  selection,
  onSelect,
  edgeFrom,
  onPickEdgeEnd,
  tileLabel,
  onPlaceTile,
  onDropTile,
  onNodeMove,
  onNodeRestore,
  onGroupMove,
  onDrawGroup,
  onDeleteSelected,
  insets,
}: DiagramStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [gesturing, setGesturing] = useState(false);
  /** The box being dragged out, previewed as chrome until it is committed. */
  const [draft, setDraft] = useState<Box | null>(null);

  // What Fit aims at: the bounds of the drawing, not of any declared frame.
  const content = useMemo(() => (config ? contentFrame(config) : EMPTY_CONTENT), [config]);
  const view = useStageView(stageRef, content, insets);
  const { setScaleAt } = view;
  const { x: frameX, y: frameY, w: frameW, h: frameH } = view.frame;

  /**
   * The scene, framed to the window.
   *
   * Rebuilt whenever the camera moves, which is what makes the grid extend to
   * every edge instead of stopping at a document boundary. It is string
   * concatenation over a few dozen shapes — cheap enough to do per frame, and
   * the drag path already re-rendered on every pointer move.
   */
  const svg = useMemo(() => {
    if (!config || frameW <= 0 || frameH <= 0) return null;
    return renderSVG(config, { frame: { x: frameX, y: frameY, w: frameW, h: frameH } });
  }, [config, frameX, frameY, frameW, frameH]);

  const pointAt = (clientX: number, clientY: number): Point | undefined => {
    const svgElement = sceneRef.current?.querySelector("svg");
    if (!svgElement) return undefined;
    return clientToViewBox(svgElement, clientX, clientY);
  };

  const endGesture = useCallback(() => {
    gestureRef.current = null;
    setGesturing(false);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!config) return;

    // Middle-button pan works under every tool: it is the gesture people
    // already have in their hands from every other canvas.
    if (tool === EDITOR_TOOLS.PAN || event.button === 1) {
      gestureRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      setGesturing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }

    const point = pointAt(event.clientX, event.clientY);
    if (!point) return;

    if (tool === EDITOR_TOOLS.NODE) {
      // Anywhere. There is no frame to be outside of.
      onPlaceTile(point);
      return;
    }

    if (tool === EDITOR_TOOLS.GROUP) {
      gestureRef.current = {
        kind: "draw",
        fromX: point.x,
        fromY: point.y,
        pointerId: event.pointerId,
      };
      setDraft({ x: point.x, y: point.y, w: 0, h: 0 });
      setGesturing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }

    const node = hitTestNode(config, point);

    if (tool === EDITOR_TOOLS.EDGE) {
      if (node) onPickEdgeEnd(node.id);
      return;
    }

    if (tool !== EDITOR_TOOLS.SELECT) return;

    if (node) {
      onSelect({ kind: "node", id: node.id });
      gestureRef.current = {
        kind: "node",
        id: node.id,
        originX: node.x,
        originY: node.y,
        pointerId: event.pointerId,
      };
      setGesturing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Stops the browser turning the gesture into a text selection.
      event.preventDefault();
      return;
    }

    // Nodes win over the group they sit in: the tile is the smaller, more
    // specific target, and it is drawn on top.
    const group = hitTestGroup(config, point);
    if (!group) {
      onSelect(null);
      return;
    }

    onSelect({ kind: "group", id: group.id });
    gestureRef.current = {
      kind: "group",
      id: group.id,
      offsetX: point.x - group.x,
      offsetY: point.y - group.y,
      originX: group.x,
      originY: group.y,
      pointerId: event.pointerId,
    };
    setGesturing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!config) return;

    const gesture = gestureRef.current;

    if (gesture?.kind === "pan") {
      view.panBy(event.clientX - gesture.clientX, event.clientY - gesture.clientY);
      gesture.clientX = event.clientX;
      gesture.clientY = event.clientY;
      return;
    }

    const point = pointAt(event.clientX, event.clientY);
    if (!point) return;

    if (gesture?.kind === "node") {
      onNodeMove(gesture.id, point.x, point.y);
      return;
    }

    if (gesture?.kind === "group") {
      onGroupMove(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY);
      return;
    }

    if (gesture?.kind === "draw") {
      setDraft(boxBetween({ x: gesture.fromX, y: gesture.fromY }, point));
      return;
    }

    const overTile = tool === EDITOR_TOOLS.SELECT || tool === EDITOR_TOOLS.EDGE;
    setHoverId(overTile ? (hitTestNode(config, point)?.id ?? null) : null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    event.currentTarget.releasePointerCapture?.(gesture.pointerId);

    // A box too small to hold anything was a click that slipped, not a group.
    if (
      gesture.kind === "draw" &&
      draft &&
      draft.w >= MIN_GROUP_SIDE &&
      draft.h >= MIN_GROUP_SIDE
    ) {
      onDrawGroup(draft);
    }

    setDraft(null);
    endGesture();
  };

  /** A tile dragged off the palette. The drop point is where it lands. */
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const key = event.dataTransfer.getData(TILE_DRAG_MIME);
    if (!key) return;

    event.preventDefault();
    const point = pointAt(event.clientX, event.clientY);
    if (point) onDropTile(key, point);
  };

  // Escape abandons a drag and puts the node back. The listener is on the
  // window because pointer capture means keyboard focus is wherever it was
  // before the gesture began.
  useEffect(() => {
    if (!gesturing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const gesture = gestureRef.current;
      // Restored verbatim rather than through `onNodeMove`: a config's
      // coordinates need not sit on the grid, and snapping here would move a
      // node the author just decided not to move.
      if (gesture?.kind === "node") onNodeRestore(gesture.id, gesture.originX, gesture.originY);
      if (gesture?.kind === "group") onGroupMove(gesture.id, gesture.originX, gesture.originY);
      setDraft(null);
      endGesture();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gesturing, onNodeRestore, onGroupMove, endGesture]);

  // Read through a ref so the listener below is registered once. Re-binding it
  // on every scale change would tear a wheel listener down mid-gesture.
  const scaleRef = useRef(view.scale);
  scaleRef.current = view.scale;

  // Wired natively rather than through `onWheel`: React registers its wheel
  // listener as passive, so `preventDefault` there cannot stop the page from
  // scrolling behind the zoom.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Exponential so a notch of the wheel changes the zoom by the same
      // proportion at 30% as at 300%.
      setScaleAt(scaleRef.current * Math.exp(-event.deltaY / 400), event.clientX, event.clientY);
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [setScaleAt]);

  const nodeHalos = (config?.nodes ?? [])
    .map((node) => {
      const state =
        node.id === edgeFrom
          ? { stroke: "var(--ed-accent-2)", width: 1.75, opacity: 1 }
          : isNode(selection, node.id)
            ? { stroke: "var(--ed-accent)", width: 1.75, opacity: 1 }
            : node.id === hoverId
              ? { stroke: "var(--ed-accent)", width: 1, opacity: 0.45 }
              : null;
      if (!state) return null;

      return (
        <rect
          key={`node-${node.id}`}
          x={node.x - HALO_SIZE / 2}
          y={node.y - HALO_SIZE / 2}
          width={HALO_SIZE}
          height={HALO_SIZE}
          rx={HALO_RADIUS}
          fill="none"
          stroke={state.stroke}
          strokeWidth={state.width / view.scale}
          opacity={state.opacity}
        />
      );
    })
    .filter(Boolean);

  const groupHalos = (config?.groups ?? [])
    .filter((group) => isGroup(selection, group.id))
    .map((group) => (
      <rect
        key={`group-${group.id}`}
        x={group.x - HALO_SLACK}
        y={group.y - HALO_SLACK}
        width={group.w + HALO_SLACK * 2}
        height={group.h + HALO_SLACK * 2}
        rx={DIAGRAM_GEOMETRY.GROUP_RADIUS + HALO_SLACK}
        fill="none"
        stroke="var(--ed-accent)"
        strokeWidth={1.75 / view.scale}
      />
    ));

  /** The box being dragged out, drawn as chrome so it never enters the config. */
  const draftHalo = draft ? (
    <rect
      key="draft"
      x={draft.x}
      y={draft.y}
      width={draft.w}
      height={draft.h}
      rx={DIAGRAM_GEOMETRY.GROUP_RADIUS}
      fill="var(--ed-accent)"
      fillOpacity={0.06}
      stroke="var(--ed-accent)"
      strokeWidth={1.5 / view.scale}
      strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}
    />
  ) : null;

  const cursor = gestureRef.current?.kind === "pan" ? "grabbing" : STAGE_CURSORS[tool];

  return (
    <div
      ref={stageRef}
      data-testid="diagram-stage"
      role="presentation"
      className="absolute inset-0 touch-none overflow-hidden bg-ed-stage"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHoverId(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {svg ? (
        <>
          <div
            ref={sceneRef}
            data-testid="diagram-canvas"
            data-selected-node={selection?.kind === "node" ? selection.id : undefined}
            data-selected-group={selection?.kind === "group" ? selection.id : undefined}
            className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`${frameX} ${frameY} ${frameW} ${frameH}`}
          >
            {nodeHalos}
            {groupHalos}
            {draftHalo}
          </svg>
        </>
      ) : (
        <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-[13px] text-ed-text-2">
          Fix the problems in the JSON panel to see the diagram.
        </p>
      )}

      <StageToolbar
        tool={tool}
        onToolChange={onToolChange}
        onDelete={selection ? onDeleteSelected : null}
      />

      <p
        role="status"
        className="pointer-events-none absolute top-[74px] left-1/2 z-10 max-w-[340px] -translate-x-1/2 text-center text-[13px] text-ed-text-2"
      >
        {toolHint(tool, { tileLabel, edgeFrom })}
      </p>

      <ZoomBar scale={view.scale} onScaleChange={view.setScaleCentred} onFit={view.fit} />
    </div>
  );
}
