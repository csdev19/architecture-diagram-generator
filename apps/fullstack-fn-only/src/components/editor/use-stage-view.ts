import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { DiagramFrame } from "@diagram-tool/domain/render";

/**
 * Where the camera is pointing, and how close.
 *
 * A camera rather than a scrolled sheet: there is no sheet any more. The
 * drawing has no frame of its own, so the editor decides which rectangle of an
 * unbounded plane to look at, and that rectangle becomes the SVG's `viewBox`.
 * Everything follows from that — the whole window is drawing surface, nothing
 * is "outside the canvas", and panning is moving the camera rather than sliding
 * a piece of paper around a table.
 *
 * View state is deliberately *not* part of the config. Panning and zooming
 * change what the author is looking at, never what they would export, so this
 * is the one piece of editor state that does not round-trip through the JSON.
 */

export interface StageViewState {
  scale: number;
  /** The world point sitting at the centre of the stage. */
  camera: { x: number; y: number };
}

/** Zoom bounds for the wheel and the +/- buttons. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

/** Fit never enlarges past this: a two-node diagram blown up looks like a bug. */
const MAX_FIT_SCALE = 1.6;
/** Fit never shrinks past this either; below it the labels stop being readable. */
const MIN_FIT_SCALE = 0.2;

/** Breathing room Fit leaves inside the free area, on every side. */
const FIT_PADDING = 32;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

interface Size {
  width: number;
  height: number;
}

/**
 * The strips of stage the floating chrome is sitting on.
 *
 * The stage spans the whole window and the panels float over it, so "the space
 * available to the drawing" is not the element's size — it is the element minus
 * whatever is covering it. Fit works against this rectangle, which is why
 * closing the JSON panel re-centres the diagram instead of leaving it off to
 * one side under a panel that is no longer there.
 */
export interface StageInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface StageView extends StageViewState {
  /** Stage size in CSS pixels. Zero until the element has been laid out. */
  size: Size;
  /** The world rectangle currently on screen — the SVG's `viewBox`. */
  frame: DiagramFrame;
  setScaleAt: (nextScale: number, clientX: number, clientY: number) => void;
  setScaleCentred: (nextScale: number) => void;
  panBy: (dx: number, dy: number) => void;
  fit: () => void;
}

/**
 * Pan, zoom and fit for the stage element.
 *
 * Auto-fit runs on mount and whenever the framing inputs change — a panel
 * opening, the window resizing, the diagram growing — but stops the moment the
 * author zooms by hand. Nothing is more annoying than a canvas that undoes a
 * deliberate zoom because a panel moved; pressing Fit hands control back.
 */
export const useStageView = (
  stageRef: RefObject<HTMLElement | null>,
  /** What there is to look at: the bounds of the drawing itself. */
  content: DiagramFrame,
  insets: StageInsets,
): StageView => {
  const [view, setView] = useState<StageViewState>({ scale: 1, camera: { x: 0, y: 0 } });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const userZoomedRef = useRef(false);

  // Read inside `fit` without making them dependencies of the callback itself.
  const contentRef = useRef(content);
  contentRef.current = content;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const fitTo = useCallback((stage: Size) => {
    const target = contentRef.current;
    if (stage.width === 0 || stage.height === 0 || target.w === 0 || target.h === 0) return;

    const { left, right, top, bottom } = insetsRef.current;
    const freeWidth = stage.width - left - right - FIT_PADDING * 2;
    const freeHeight = stage.height - top - bottom - FIT_PADDING * 2;
    if (freeWidth <= 0 || freeHeight <= 0) return;

    const scale = clamp(
      Math.min(freeWidth / target.w, freeHeight / target.h),
      MIN_FIT_SCALE,
      MAX_FIT_SCALE,
    );

    // Centre the drawing in the *free* area rather than in the stage: a world
    // point lands at `stage/2 + (p - camera) * scale`, so pointing the camera
    // half an inset off-centre puts the middle of the drawing between the panels.
    setView({
      scale,
      camera: {
        x: target.x + target.w / 2 - (left - right) / (2 * scale),
        y: target.y + target.h / 2 - (top - bottom) / (2 * scale),
      },
    });
  }, []);

  const fit = useCallback(() => {
    userZoomedRef.current = false;
    fitTo(sizeRef.current);
  }, [fitTo]);

  // Reframes when anything that decides the framing moves: a panel opening or
  // closing, and the drawing itself growing as tiles are added.
  useEffect(() => {
    if (!userZoomedRef.current) fitTo(sizeRef.current);
  }, [
    fitTo,
    insets.left,
    insets.right,
    insets.top,
    insets.bottom,
    content.x,
    content.y,
    content.w,
    content.h,
  ]);

  // Measured rather than assumed: the stage fills the viewport, and the
  // viewport is the one thing here that is not ours to decide.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const next = { width: stage.clientWidth, height: stage.clientHeight };
      setSize(next);
      if (!userZoomedRef.current) fitTo(next);
    };

    measure();

    // jsdom implements no ResizeObserver. The initial measurement above is what
    // matters there; a test window never resizes.
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, fitTo]);

  /**
   * Zooms about a point on screen, so whatever is under the pointer stays under
   * it. The offset of that point from the stage's centre is fixed in pixels, so
   * holding it means moving the camera by the change in what those pixels are
   * worth in world units.
   */
  const setScaleAt = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const bounds = stage.getBoundingClientRect();
      const offsetX = clientX - bounds.left - bounds.width / 2;
      const offsetY = clientY - bounds.top - bounds.height / 2;

      userZoomedRef.current = true;
      setView((current) => {
        const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
        if (scale === current.scale) return current;

        const shift = 1 / current.scale - 1 / scale;
        return {
          scale,
          camera: { x: current.camera.x + offsetX * shift, y: current.camera.y + offsetY * shift },
        };
      });
    },
    [stageRef],
  );

  /** Zooms about the middle of the stage. What the +/- buttons do. */
  const setScaleCentred = useCallback((nextScale: number) => {
    userZoomedRef.current = true;
    setView((current) => ({ ...current, scale: clamp(nextScale, MIN_SCALE, MAX_SCALE) }));
  }, []);

  /** Drags the world by `dx`/`dy` screen pixels, which moves the camera the other way. */
  const panBy = useCallback((dx: number, dy: number) => {
    // A pan is the author choosing where the camera points just as much as a
    // zoom is, so it disarms auto-fit the same way: without this, the first
    // wheel pan to empty space is undone the moment a panel opens or closes,
    // or a tile is placed, and the camera yanks back to wherever Fit wants it.
    userZoomedRef.current = true;
    setView((current) => ({
      ...current,
      camera: {
        x: current.camera.x - dx / current.scale,
        y: current.camera.y - dy / current.scale,
      },
    }));
  }, []);

  const frame: DiagramFrame = {
    x: view.camera.x - size.width / (2 * view.scale),
    y: view.camera.y - size.height / (2 * view.scale),
    w: size.width / view.scale,
    h: size.height / view.scale,
  };

  return { ...view, size, frame, setScaleAt, setScaleCentred, panBy, fit };
};
