import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { DIAGRAM_GEOMETRY } from "@diagram-tool/domain/constants";
import { contentFrame, renderSVG } from "@diagram-tool/domain/render";
import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import {
  clientToViewBox,
  hitTestBoundary,
  hitTestNode,
} from "@/components/editor/pointer-geometry";
import type { Point } from "@/components/editor/pointer-geometry";
import { isBoundary, isNode } from "@/components/editor/selection";
import type { MaybeSelection } from "@/components/editor/selection";
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
 * — it comes from our own renderer, from a validated document, with every
 * interpolated string XML-escaped.
 *
 * Selection and hover halos are drawn in a *separate* overlay SVG on top, never
 * into the scene. The alternative — marking chrome inside the drawing and
 * stripping it before export — makes correctness depend on remembering to
 * strip. Here the exported document is the one the renderer produced, byte for
 * byte, because the chrome was never in it.
 */

interface DiagramStageProps {
  /** The last document that resolved. `null` before there is one. */
  diagram: ResolvedDiagram | null;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  selection: MaybeSelection;
  onSelect: (selection: MaybeSelection) => void;
  /**
   * What a press on this element should select.
   *
   * The page decides, because the answer depends on the group tree and on
   * which group has been entered — and the stage has neither. It also decides
   * whether the gesture moves one thing or a whole group.
   */
  resolveSelection: (kind: "node" | "boundary", id: string) => MaybeSelection;
  /** Adds or removes one element, for a shift-click. */
  onToggleSelect: (kind: "node" | "boundary", id: string) => void;
  /** Enters the group a double-click landed in, so the next click reaches inside. */
  onEnterGroup: (kind: "node" | "boundary", id: string) => void;
  /** The rectangle a selected group covers, drawn as a halo and never exported. */
  groupOutline: { x: number; y: number; w: number; h: number } | null;
  /** Moves everything in the selection by the same delta. */
  onSelectionMove: (dx: number, dy: number) => void;
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
  /** Called once a drag or a draw has actually begun, before anything is written. */
  onGestureStart: () => void;
  /** Called when Escape abandons a gesture, to put back what it changed. */
  onGestureCancel: () => void;
  onBoundaryMove: (id: string, x: number, y: number) => void;
  /** Commits a box drawn with the boundary tool. */
  onDrawBoundary: (box: { x: number; y: number; w: number; h: number }) => void;
  onDeleteSelected: () => void;
  /** Which strips of the stage the floating panels are covering. */
  insets: StageInsets;
}

interface NodeDrag {
  kind: "node";
  id: string;
  /** The grab offset, so the tile does not jump its centre to the pointer. */
  offsetX: number;
  offsetY: number;
  /** Where the press landed, which is what a group drag measures its delta from. */
  fromX: number;
  fromY: number;
  /** Whether the press picked a whole group, so everything in it moves together. */
  moveGroup: boolean;
  pointerId: number;
}

interface BoundaryDrag {
  kind: "boundary";
  id: string;
  /** The grab offset, so the box does not jump its corner to the pointer. */
  offsetX: number;
  offsetY: number;
  /** Where the press landed, for the same reason a node drag records it. */
  fromX: number;
  fromY: number;
  moveGroup: boolean;
  pointerId: number;
}

/** Drawing a new boundary: the corner it started from, in world units. */
interface BoundaryDraw {
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

type Gesture = NodeDrag | BoundaryDrag | BoundaryDraw | PanDrag;

/** How far outside the tile the halo sits. */
const HALO_SLACK = 5;
const HALO_SIZE = DIAGRAM_GEOMETRY.TILE_SIZE + HALO_SLACK * 2;
const HALO_RADIUS = DIAGRAM_GEOMETRY.TILE_RADIUS + HALO_SLACK;

/** What the camera looks at before there is anything to look at. */
const EMPTY_CONTENT = { x: 0, y: 0, w: 0, h: 0 };

/** Below this in either direction, a boundary drag was a click that slipped. */
const MIN_BOUNDARY_SIDE = DIAGRAM_GEOMETRY.GRID_CELL * 2;

/** Screen pixels of pan per pixel of wheel delta. 1:1 — the content tracks the fingers. */
const PAN_SPEED = 1;

/**
 * What one `DOM_DELTA_LINE` is worth in pixels.
 *
 * Some mice report scroll in lines rather than pixels, where a notch is about
 * three. Unscaled, a notch would pan the canvas three units and read as broken.
 */
const LINE_HEIGHT = 16;

/**
 * Divides the wheel delta before it is exponentiated. Larger is calmer.
 *
 * Exponential rather than linear so a notch changes the zoom by the same
 * proportion at 30% as at 300%.
 */
const ZOOM_DAMPING = 140;

/**
 * The most one event may contribute to a zoom.
 *
 * A trackpad pinch reports deltas of about one to ten; a mouse notch under Cmd
 * reports a hundred or more. Without a ceiling, the sensitivity that feels
 * right under two fingers throws away half a zoom level per notch.
 */
const MAX_ZOOM_DELTA = 24;

/**
 * `WheelEvent.DOM_DELTA_LINE`, spelled out.
 *
 * The class itself does not exist on the server, and this module is imported
 * during SSR.
 */
const DOM_DELTA_LINE = 1;

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
  diagram,
  tool,
  onToolChange,
  selection,
  onSelect,
  resolveSelection,
  onToggleSelect,
  onEnterGroup,
  groupOutline,
  onSelectionMove,
  edgeFrom,
  onPickEdgeEnd,
  tileLabel,
  onPlaceTile,
  onDropTile,
  onNodeMove,
  onGestureStart,
  onGestureCancel,
  onBoundaryMove,
  onDrawBoundary,
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
  const content = useMemo(() => (diagram ? contentFrame(diagram) : EMPTY_CONTENT), [diagram]);
  const view = useStageView(stageRef, content, insets);
  const { setScaleAt, panBy } = view;
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
    if (!diagram || frameW <= 0 || frameH <= 0) return null;
    return renderSVG(diagram, { frame: { x: frameX, y: frameY, w: frameW, h: frameH } });
  }, [diagram, frameX, frameY, frameW, frameH]);

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
    if (!diagram) return;

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

    if (tool === EDITOR_TOOLS.BOUNDARY) {
      onGestureStart();
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

    const node = hitTestNode(diagram, point);

    if (tool === EDITOR_TOOLS.EDGE) {
      if (node) onPickEdgeEnd(node.id);
      return;
    }

    if (tool !== EDITOR_TOOLS.SELECT) return;

    if (node) {
      if (event.shiftKey) {
        onToggleSelect("node", node.id);
        return;
      }

      const target = resolveSelection("node", node.id);
      onSelect(target);
      onGestureStart();
      gestureRef.current = {
        kind: "node",
        id: node.id,
        offsetX: point.x - node.x,
        offsetY: point.y - node.y,
        fromX: point.x,
        fromY: point.y,
        moveGroup: target?.kind === "group",
        pointerId: event.pointerId,
      };
      setGesturing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Stops the browser turning the gesture into a text selection.
      event.preventDefault();
      return;
    }

    // Nodes win over the boundary they sit in: the tile is the smaller, more
    // specific target, and it is drawn on top.
    const boundary = hitTestBoundary(diagram, point);
    if (!boundary) {
      onSelect(null);
      return;
    }

    if (event.shiftKey) {
      onToggleSelect("boundary", boundary.id);
      return;
    }

    const target = resolveSelection("boundary", boundary.id);
    onSelect(target);
    onGestureStart();
    gestureRef.current = {
      kind: "boundary",
      id: boundary.id,
      offsetX: point.x - boundary.x,
      offsetY: point.y - boundary.y,
      fromX: point.x,
      fromY: point.y,
      moveGroup: target?.kind === "group",
      pointerId: event.pointerId,
    };
    setGesturing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  /**
   * Enters the group a double-click landed in.
   *
   * The way into a group, and the only way to reach a boundary that frames one:
   * a single click selects the outermost group, so without this the elements
   * inside would be unreachable once they were grouped.
   */
  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!diagram || tool !== EDITOR_TOOLS.SELECT) return;

    const point = pointAt(event.clientX, event.clientY);
    if (!point) return;

    const node = hitTestNode(diagram, point);
    if (node) {
      onEnterGroup("node", node.id);
      return;
    }

    const boundary = hitTestBoundary(diagram, point);
    if (boundary) onEnterGroup("boundary", boundary.id);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!diagram) return;

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
      if (gesture.moveGroup) onSelectionMove(point.x - gesture.fromX, point.y - gesture.fromY);
      // A node's coordinates are its centre, so the raw pointer would drag the
      // tile's middle under the cursor and throw it half a tile on the first
      // move. The offset is what the press was holding.
      else onNodeMove(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY);
      return;
    }

    if (gesture?.kind === "boundary") {
      // A grouped boundary has no rectangle of its own to move: its group does
      // the moving, and the box follows whatever it frames.
      if (gesture.moveGroup) onSelectionMove(point.x - gesture.fromX, point.y - gesture.fromY);
      else onBoundaryMove(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY);
      return;
    }

    if (gesture?.kind === "draw") {
      setDraft(boxBetween({ x: gesture.fromX, y: gesture.fromY }, point));
      return;
    }

    const overTile = tool === EDITOR_TOOLS.SELECT || tool === EDITOR_TOOLS.EDGE;
    setHoverId(overTile ? (hitTestNode(diagram, point)?.id ?? null) : null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    event.currentTarget.releasePointerCapture?.(gesture.pointerId);

    // A box too small to hold anything was a click that slipped, not a boundary.
    if (
      gesture.kind === "draw" &&
      draft &&
      draft.w >= MIN_BOUNDARY_SIDE &&
      draft.h >= MIN_BOUNDARY_SIDE
    ) {
      onDrawBoundary(draft);
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

      // The whole gesture is undone, not just the last position it wrote: a
      // drag also settles the layout of everything else on screen before it
      // moves anything, and abandoning it has to take that back too.
      onGestureCancel();
      setDraft(null);
      endGesture();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gesturing, onGestureCancel, endGesture]);

  // Read through a ref so the listener below is registered once. Re-binding it
  // on every scale change would tear a wheel listener down mid-gesture.
  const scaleRef = useRef(view.scale);
  scaleRef.current = view.scale;

  // Wired natively rather than through `onWheel`: React registers its wheel
  // listener as passive, so `preventDefault` there cannot stop the page from
  // scrolling — or the browser from zooming — behind the gesture.
  //
  // Which gesture it is comes out of the event itself, so there is no
  // recogniser here: a two-finger drag arrives as a plain wheel event, and a
  // pinch arrives as one carrying a synthetic `ctrlKey` with no key held.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // A trackpad emits wheel events faster than the browser paints, and each
    // one would otherwise rebuild the whole scene. Deltas are summed here and
    // spent once a frame instead, which is exact rather than approximate: pan
    // is linear in the delta, and `exp(-(a + b) / d)` is the product of the
    // two zooms it stands in for.
    let frame = 0;
    let panX = 0;
    let panY = 0;
    let zoom = 0;
    let zoomX = 0;
    let zoomY = 0;

    const flush = () => {
      frame = 0;

      if (zoom !== 0) {
        const delta = zoom;
        zoom = 0;
        setScaleAt(scaleRef.current * Math.exp(-delta / ZOOM_DAMPING), zoomX, zoomY);
      }

      if (panX !== 0 || panY !== 0) {
        const dx = panX;
        const dy = panY;
        panX = 0;
        panY = 0;
        panBy(dx, dy);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const step = event.deltaMode === DOM_DELTA_LINE ? LINE_HEIGHT : 1;

      if (event.ctrlKey || event.metaKey) {
        // Clamped per event rather than per frame, so a pinch's many small
        // deltas still accumulate freely while one mouse notch cannot lurch.
        const delta = event.deltaY * step;
        zoom += Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, delta));
        // The last point wins: a pinch barely moves, and the alternative is
        // averaging two positions that were never far apart.
        zoomX = event.clientX;
        zoomY = event.clientY;
      } else {
        // Shift turns a vertical wheel sideways. macOS swaps the axes itself
        // before the event is dispatched, which is why the swap only applies
        // where there is no horizontal delta already asking to be respected.
        const sideways = event.shiftKey && event.deltaX === 0;
        const deltaX = sideways ? event.deltaY : event.deltaX;
        const deltaY = sideways ? 0 : event.deltaY;

        // Scrolling down moves the content up, which is the camera going down.
        panX -= deltaX * step * PAN_SPEED;
        panY -= deltaY * step * PAN_SPEED;
      }

      if (frame === 0) frame = requestAnimationFrame(flush);
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [setScaleAt, panBy]);

  const nodeHalos = (diagram?.nodes ?? [])
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

  /**
   * The rectangle around a selected group.
   *
   * A group is never drawn, so this lives in the overlay with every other halo
   * — dashed, to read as a selection rather than as a boundary someone made.
   */
  const groupHalo = groupOutline ? (
    <rect
      x={groupOutline.x - HALO_SLACK}
      y={groupOutline.y - HALO_SLACK}
      width={groupOutline.w + HALO_SLACK * 2}
      height={groupOutline.h + HALO_SLACK * 2}
      rx={HALO_RADIUS}
      fill="none"
      stroke="var(--ed-accent)"
      strokeWidth={1.75 / view.scale}
      strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}
    />
  ) : null;

  const boundaryHalos = (diagram?.boundaries ?? [])
    .filter((boundary) => isBoundary(selection, boundary.id))
    .map((boundary) => (
      <rect
        key={`boundary-${boundary.id}`}
        x={boundary.x - HALO_SLACK}
        y={boundary.y - HALO_SLACK}
        width={boundary.w + HALO_SLACK * 2}
        height={boundary.h + HALO_SLACK * 2}
        rx={DIAGRAM_GEOMETRY.BOUNDARY_RADIUS + HALO_SLACK}
        fill="none"
        stroke="var(--ed-accent)"
        strokeWidth={1.75 / view.scale}
      />
    ));

  /** The box being dragged out, drawn as chrome so it never enters the drawing. */
  const draftHalo = draft ? (
    <rect
      key="draft"
      x={draft.x}
      y={draft.y}
      width={draft.w}
      height={draft.h}
      rx={DIAGRAM_GEOMETRY.BOUNDARY_RADIUS}
      fill="var(--ed-accent)"
      fillOpacity={0.06}
      stroke="var(--ed-accent)"
      strokeWidth={1.5 / view.scale}
      strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}
    />
  ) : null;

  /**
   * The markup handed to `dangerouslySetInnerHTML`, memoised on the string.
   *
   * React 19 compares this prop by *object* identity and, when it differs,
   * assigns `innerHTML` without ever looking at the string inside. A fresh
   * `{ __html }` literal per render therefore tears down and rebuilds the whole
   * scene on every hover, selection and keystroke — invisibly, because the
   * markup that comes back is identical.
   *
   * What it is not invisible to is the browser. Chrome synthesises `click` and
   * `dblclick` from a press and a release that share a live target, so a scene
   * rebuilt between `pointerdown` and `pointerup` detaches the element the
   * press landed on and neither event is ever fired. That is what made
   * double-click-to-enter-a-group do nothing: the handler was never called.
   */
  const sceneHtml = useMemo(() => ({ __html: svg ?? "" }), [svg]);

  const cursor = gestureRef.current?.kind === "pan" ? "grabbing" : STAGE_CURSORS[tool];

  return (
    <div
      ref={stageRef}
      data-testid="diagram-stage"
      role="presentation"
      className="absolute inset-0 touch-none overflow-hidden bg-ed-stage"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
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
            data-selected-node={selection?.kind === "node" ? selection.ids.join(" ") : undefined}
            data-selected-boundary={
              selection?.kind === "boundary" ? selection.ids.join(" ") : undefined
            }
            data-selected-group={selection?.kind === "group" ? selection.ids.join(" ") : undefined}
            className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={sceneHtml}
          />
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`${frameX} ${frameY} ${frameW} ${frameH}`}
          >
            {nodeHalos}
            {boundaryHalos}
            {groupHalo}
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

      {/*
        The bottom-left cluster: the zoom readout, and the byline beside it.

        Attribution sits here rather than in the header because the header is
        where the work happens. It was in the left pill, and the pill grows with
        whatever it holds — far enough, at a normal window width, to reach the
        centred toolbar and cover the tools.
      */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <ZoomBar scale={view.scale} onScaleChange={view.setScaleCentred} onFit={view.fit} />

        <a
          href="https://cs19.dev"
          target="_blank"
          rel="noreferrer"
          className={cn(
            "pointer-events-auto rounded-[6px] px-1 py-0.5 font-mono text-[11px]",
            "text-ed-text-3 hover:text-ed-text focus-visible:text-ed-text",
            "outline-none focus-visible:shadow-[var(--ed-focus-ring)]",
          )}
        >
          built by csdev
        </a>
      </div>
    </div>
  );
}
