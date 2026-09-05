# Canvas Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor canvas navigate the way Excalidraw does — a two-finger
trackpad drag pans, a pinch zooms, both smooth — and stop a dragged tile from
jumping its centre to the pointer.

**Architecture:** One file changes. `diagram-stage.tsx` owns both the `wheel`
listener and the pointer gestures. The wheel handler branches on the event's
`ctrlKey` flag (which the browser sets synthetically for a trackpad pinch) into
pan or zoom, sums deltas in refs, and spends them once per `requestAnimationFrame`
so a burst of trackpad events costs one render rather than twenty. The node drag
gains the grab offset the boundary drag already has. `useStageView` already
exposes `panBy` and `setScaleAt`; it does not change.

**Tech Stack:** React 19, TypeScript, Vitest + jsdom, `@testing-library/react` 16.

**Spec:** `docs/specs/2026-09-04-canvas-navigation-design.md`

## Global Constraints

- **English only** in code, comments, tests, commits, branch names and PR text.
- **Only one production file may change:** `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx`. Test files are of course fair game — `__tests__/diagram-stage.test.tsx`, and `src/vitest.setup.ts` if Task 2 needs the contingency it names. If a task seems to need a change in `use-stage-view.ts`, `pointer-geometry.ts`, `edits/`, or the `domain` package, stop and report it instead.
- **Commit format:** conventional commits with the `editor` scope — `fix(editor): …`, `feat(editor): …`.
- **Comments explain why, not what.** The file's existing comments are the house style: full sentences, naming the reason a line exists. Match that density; do not narrate the obvious.
- **Every task is TDD:** the test is written and seen to fail before the implementation exists.
- **Test command** (run from `apps/fullstack-fn-only/`): `bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx`. Narrow to one test with `-t "<name>"`.
- **Work happens on a branch and lands as a PR.** Task 0 creates the branch; Task 4 opens the PR.

## Background an implementer needs

**Geometry.** `DIAGRAM_GEOMETRY` (in `@diagram-tool/domain/constants`) gives
`TILE_SIZE: 62` (so a tile's half-width is 31) and `GRID_CELL: 26`. Nodes snap to
`GRID_CELL / 2` = **13** world units, via `snapToGrid` in
`src/components/editor/edits/edit-document.ts`. **A node's `x`/`y` is the centre
of its tile**, not its corner — that fact is the whole of the bug in Task 1.

**The camera.** `useStageView` keeps `{ scale, camera }` and derives `frame`, the
world rectangle on screen. `frame` becomes the rendered SVG's `viewBox`
attribute, formatted as `"x y w h"` and rounded to two decimals by `num()` in the
domain renderer. Tests read the camera back from that attribute — which is why
every numeric assertion below uses `toBeCloseTo(value, 1)` rather than `toBe`.
On the seed diagram it reads `"-1326.47 -1584.65 4102.04 3281.63"`, so Fit
starts the editor at roughly 24% and one screen pixel is worth about four world
units. Those numbers are context, not something to assert against: every test
below derives what it expects from the camera it just read.

**Test environment.** `src/vitest.setup.ts` stubs `clientWidth`/`clientHeight` on
every element to **1000 × 800**, because jsdom performs no layout. It also
polyfills `PointerEvent` and `DragEvent`. Separately, `stubScreenCTM()` inside
the test file makes `getScreenCTM` return the identity matrix, so **client
coordinates equal world coordinates** in tests. Note that jsdom's
`getBoundingClientRect` still returns all zeros, so `setScaleAt` treats the
stage's centre as `(0, 0)`; a zoom test that fires at `clientX: 0, clientY: 0`
therefore zooms about the camera's own centre and leaves the camera point still.

---

## Task 0: Branch

**Files:** none.

- [ ] **Step 1: Confirm the working tree is clean apart from the docs**

Run: `git status --short`
Expected: only `docs/specs/2026-09-04-canvas-navigation-design.md` and
`docs/plans/2026-09-04-canvas-navigation.md` appear (as untracked or staged). If
anything under `apps/` or `packages/` is modified, stop and report it.

- [ ] **Step 2: Create the branch**

```bash
git checkout -b feat/canvas-navigation
```

- [ ] **Step 3: Commit the design and the plan**

```bash
git add docs/specs/2026-09-04-canvas-navigation-design.md docs/plans/2026-09-04-canvas-navigation.md
git commit -m "docs(specs): design Excalidraw-style navigation for the canvas"
```

---

## Task 1: A node drag keeps its grab offset

The bug: `handlePointerMove` calls `onNodeMove(gesture.id, point.x, point.y)`,
and `moveNode` writes that point as the node's **centre**. Press a tile 26 units
right of its centre, move one pixel, and the tile jumps 26 units left so its
centre lands under the cursor.

Every existing drag test presses at `at(id)` — the tile's exact centre — where
the offset is zero, which is why the bug has never shown up in the suite.

**Files:**

- Modify: `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx` (the `NodeDrag` interface at lines 95–103; the `kind: "node"` gesture built in `handlePointerDown`; the `gesture?.kind === "node"` branch in `handlePointerMove`)
- Test: `apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `NodeDrag` gains `offsetX: number` and `offsetY: number`. No exported signature changes.

- [ ] **Step 1: Write the failing test**

Add this import to the top of the test file, beside the existing imports:

```ts
import { snapToGrid } from "../edits/edit-document";
```

Then add this test inside the existing `describe("dragging a node", …)` block,
after `it("snaps to the half-grid on the way", …)`:

```tsx
  it("keeps the grab offset instead of jumping the tile's centre to the pointer", () => {
    render(<EditorPage />);
    selectTile("api");

    const start = at("api");
    // Half a tile is 31, so 26 to the right is a press well off centre but
    // still inside the tile — and it is two whole grid cells, so the snap
    // cannot quietly absorb the difference the bug used to introduce.
    const grab = { x: start.x + 26, y: start.y };
    const to = { x: grab.x + 130, y: grab.y + 130 };

    fireEvent.pointerDown(canvas(), { clientX: grab.x, clientY: grab.y, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: to.x, clientY: to.y, pointerId: 1 });

    // The tile travels exactly as far as the pointer did, and no further.
    expect(positionIn(documentText(), "api")).toEqual({
      x: snapToGrid(start.x + 130),
      y: snapToGrid(start.y + 130),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx -t "keeps the grab offset"
```

Expected: FAIL. The received `x` is `snapToGrid(start.x + 26 + 130)` — 26 units
further right than expected — because the centre jumped to the pointer.

- [ ] **Step 3: Record the offset on the gesture**

In `diagram-stage.tsx`, add the two fields to `NodeDrag`:

```ts
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
```

In `handlePointerDown`, inside the `if (node)` branch, add the two fields to the
gesture it builds:

```ts
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
```

- [ ] **Step 4: Subtract the offset on every move**

In `handlePointerMove`, replace the `kind === "node"` branch:

```ts
    if (gesture?.kind === "node") {
      if (gesture.moveGroup) onSelectionMove(point.x - gesture.fromX, point.y - gesture.fromY);
      // A node's coordinates are its centre, so the raw pointer would drag the
      // tile's middle under the cursor and throw it half a tile on the first
      // move. The offset is what the press was holding.
      else onNodeMove(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY);
      return;
    }
```

- [ ] **Step 5: Run the whole file to verify it passes and nothing regressed**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx
```

Expected: PASS, all tests. The pre-existing drag tests press at the tile's
centre, where the offset is zero, so they are unaffected.

- [ ] **Step 6: Commit**

```bash
git add apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx
git commit -m "fix(editor): hold a dragged tile where it was grabbed, not by its centre"
```

---

## Task 2: A plain wheel pans, coalesced into one frame

**Files:**

- Modify: `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx` (constants near `MIN_BOUNDARY_SIDE` at line 145; the `const { setScaleAt } = view;` destructure at line 198; the wheel `useEffect` at lines 448–464)
- Test: `apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx`

**Interfaces:**

- Consumes: `panBy(dx: number, dy: number): void` and `setScaleAt(scale: number, clientX: number, clientY: number): void`, both already on the object `useStageView` returns.
- Produces: module constants `PAN_SPEED`, `LINE_HEIGHT`, `DOM_DELTA_LINE`. Task 3 adds `ZOOM_DAMPING` and `MAX_ZOOM_DELTA` beside them and extends the same `handleWheel`.

- [ ] **Step 1: Add the test helpers**

At the top of the test file, extend the `vitest` import to include `afterEach` and `vi`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

and extend the `@testing-library/react` import to include `act`:

```ts
import { act, fireEvent, render, screen } from "@testing-library/react";
```

Then add these helpers next to the existing ones, after `stubScreenCTM`:

```tsx
/** The stage element, which is where the wheel listener lives. */
const stage = () => screen.getByTestId("diagram-stage");

/**
 * The camera rectangle, read back off the `viewBox` the renderer wrote.
 *
 * The renderer rounds to two decimals, so assertions against these numbers use
 * `toBeCloseTo` rather than exact equality.
 */
const camera = () => {
  const svg = canvas().querySelector("svg");
  if (!svg) throw new Error("the stage drew no scene to read a camera from");
  const [x, y, w, h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
  return { x: x ?? NaN, y: y ?? NaN, w: w ?? NaN, h: h ?? NaN };
};

/** The stage measures 1000 x 800 in tests; `src/vitest.setup.ts` stubs it there. */
const STAGE_WIDTH = 1000;

/**
 * World units one screen pixel is worth right now, derived from the camera
 * itself so the assertions never have to know what scale Fit chose.
 */
const worldPerPixel = () => camera().w / STAGE_WIDTH;

/**
 * The stage spends wheel input once per animation frame, and jsdom never
 * paints. Callbacks are collected rather than run inline so a test can also
 * assert that a burst of events produced a single frame.
 */
let frames: FrameRequestCallback[] = [];

const captureFrames = () => {
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
};

/** Runs everything the stage asked to do on the next frame. */
const runFrame = () => {
  const pending = frames;
  frames = [];
  // Wrapped because the callback is what actually moves the camera, and React
  // would otherwise warn that the update escaped `act`.
  act(() => {
    for (const callback of pending) callback(0);
  });
};

/** A wheel event on the stage, plus the frame it schedules. */
const wheel = (init: WheelEventInit) => {
  fireEvent.wheel(stage(), init);
  runFrame();
};
```

- [ ] **Step 2: Write the failing tests**

Add this block at the end of the test file:

```tsx
describe("navigating with the wheel", () => {
  beforeEach(captureFrames);
  afterEach(() => vi.restoreAllMocks());

  it("pans down without changing the zoom", () => {
    render(<EditorPage />);
    const before = camera();
    const perPixel = worldPerPixel();

    wheel({ deltaY: 100 });

    const after = camera();
    // Scrolling down moves the camera down the plane by what those pixels are
    // worth, and the rectangle it looks at keeps its size: this is not a zoom.
    expect(after.y).toBeCloseTo(before.y + 100 * perPixel, 1);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.w).toBeCloseTo(before.w, 1);
  });

  it("pans sideways on a horizontal delta", () => {
    render(<EditorPage />);
    const before = camera();
    const perPixel = worldPerPixel();

    wheel({ deltaX: 80 });

    const after = camera();
    expect(after.x).toBeCloseTo(before.x + 80 * perPixel, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  it("turns a shifted vertical wheel sideways", () => {
    render(<EditorPage />);
    const before = camera();
    const perPixel = worldPerPixel();

    wheel({ deltaY: 80, shiftKey: true });

    const after = camera();
    expect(after.x).toBeCloseTo(before.x + 80 * perPixel, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  it("scales a delta reported in lines rather than pixels", () => {
    render(<EditorPage />);
    const before = camera();
    const perPixel = worldPerPixel();

    // A notch on a mouse that reports lines is 3, not 3 pixels — unscaled the
    // pan would be three units and go unnoticed.
    wheel({ deltaY: 3, deltaMode: 1 });

    expect(camera().y).toBeCloseTo(before.y + 48 * perPixel, 1);
  });

  it("spends a burst of events in a single frame", () => {
    render(<EditorPage />);
    const before = camera();
    const perPixel = worldPerPixel();
    // Whatever React or the floating panels asked for on mount is not what is
    // under test here, and this assertion counts frames.
    frames.length = 0;

    fireEvent.wheel(stage(), { deltaY: 20 });
    fireEvent.wheel(stage(), { deltaY: 20 });
    fireEvent.wheel(stage(), { deltaY: 20 });

    // A trackpad outruns the compositor. Three events, one render.
    expect(frames).toHaveLength(1);
    runFrame();

    // And nothing is dropped on the way: the frame spends all three.
    expect(camera().y).toBeCloseTo(before.y + 60 * perPixel, 1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx -t "navigating with the wheel"
```

Expected: FAIL, all five. The current handler zooms on every wheel event, so
`after.w` differs from `before.w` and no pan happens at all.

**Contingency.** `requestAnimationFrame`, `WheelEvent`, and the `viewBox` this
plan reads back were all confirmed present in this suite while the plan was
written, so this should not come up. But if the run dies on
`requestAnimationFrame is not a function` inside `captureFrames`, this jsdom is
not running in visual mode and has no `requestAnimationFrame` to spy on. Add it
to `apps/fullstack-fn-only/src/vitest.setup.ts`, in the same spirit as the
`PointerEvent` polyfill already there:

```ts
/**
 * jsdom only supplies `requestAnimationFrame` in visual mode. The stage
 * coalesces wheel input into a frame, so without it the camera never moves —
 * and a test would read that as a broken handler rather than a missing API.
 */
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    setTimeout(() => callback(0), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}
```

Then re-run this step; the tests must still fail, and fail on the assertions
rather than on a missing function.

- [ ] **Step 4: Add the constants**

In `diagram-stage.tsx`, after `const MIN_BOUNDARY_SIDE = DIAGRAM_GEOMETRY.GRID_CELL * 2;`:

```ts
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
 * `WheelEvent.DOM_DELTA_LINE`, spelled out.
 *
 * The class itself does not exist on the server, and this module is imported
 * during SSR.
 */
const DOM_DELTA_LINE = 1;
```

- [ ] **Step 5: Replace the wheel effect**

Still in `diagram-stage.tsx`, change the destructure at line 198 from
`const { setScaleAt } = view;` to:

```ts
  const { setScaleAt, panBy } = view;
```

Then replace the whole wheel `useEffect` (lines 448–464, from the
`// Wired natively rather than through \`onWheel\``comment through its closing`}, [setScaleAt]);`) with:

```ts
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
    // is linear in the delta.
    let frame = 0;
    let panX = 0;
    let panY = 0;

    const flush = () => {
      frame = 0;

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

      // Shift turns a vertical wheel sideways. macOS swaps the axes itself
      // before the event is dispatched, which is why the swap only applies
      // where there is no horizontal delta already asking to be respected.
      const sideways = event.shiftKey && event.deltaX === 0;
      const deltaX = sideways ? event.deltaY : event.deltaX;
      const deltaY = sideways ? 0 : event.deltaY;

      // Scrolling down moves the content up, which is the camera going down.
      panX -= deltaX * step * PAN_SPEED;
      panY -= deltaY * step * PAN_SPEED;

      if (frame === 0) frame = requestAnimationFrame(flush);
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [setScaleAt, panBy]);
```

Note `setScaleAt` stays in the dependency array: Task 3 puts it back to work
inside `flush`, and both callbacks are stable, so the listener is registered
once either way.

- [ ] **Step 6: Run the file to verify the new tests pass and nothing regressed**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx
```

Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx
git commit -m "feat(editor): pan the canvas with the wheel, a frame at a time"
```

---

## Task 3: A pinch, or Cmd and the wheel, zooms

**Files:**

- Modify: `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx` (the constants added in Task 2; the `handleWheel` and `flush` written in Task 2)
- Test: `apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx`

**Interfaces:**

- Consumes: `PAN_SPEED`, `LINE_HEIGHT`, `DOM_DELTA_LINE`, and the `flush`/`handleWheel` pair from Task 2; `setScaleAt(scale, clientX, clientY)` from `useStageView`.
- Produces: module constants `ZOOM_DAMPING = 140` and `MAX_ZOOM_DELTA = 24`. Nothing later depends on them.

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the `describe("navigating with the wheel", …)`
block created in Task 2:

```tsx
  it("zooms in on a pinch, which the browser reports as a ctrl-wheel", () => {
    render(<EditorPage />);
    const before = camera();

    // Fired at the origin because jsdom reports a zero-sized bounding box, so
    // the stage's centre is (0, 0) there: the camera point then stays put and
    // the scale is the only thing under test.
    wheel({ deltaY: -10, ctrlKey: true, clientX: 0, clientY: 0 });

    // Zooming in narrows the rectangle the camera looks at.
    expect(camera().w).toBeCloseTo(before.w * Math.exp(-10 / 140), 1);
  });

  it("zooms out on the opposite pinch", () => {
    render(<EditorPage />);
    const before = camera();

    wheel({ deltaY: 10, ctrlKey: true, clientX: 0, clientY: 0 });

    expect(camera().w).toBeCloseTo(before.w * Math.exp(10 / 140), 1);
  });

  it("caps how far one mouse notch under Cmd can zoom", () => {
    render(<EditorPage />);
    const before = camera();

    // A notch reports 100 or more where a pinch reports single digits. Without
    // the cap the same code that feels right under two fingers lurches.
    wheel({ deltaY: -400, metaKey: true, clientX: 0, clientY: 0 });

    expect(camera().w).toBeCloseTo(before.w * Math.exp(-24 / 140), 1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx -t "zooms"
```

Expected: FAIL. After Task 2 every wheel event pans, so `camera().w` is
unchanged and the received value equals `before.w`.

Also run `-t "caps how far"`; it fails the same way.

- [ ] **Step 3: Add the zoom constants**

In `diagram-stage.tsx`, beside `PAN_SPEED`:

```ts
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
```

- [ ] **Step 4: Branch the handler and spend the zoom in the same frame**

Add two accumulators beside `panX`/`panY` inside the effect:

```ts
    let frame = 0;
    let panX = 0;
    let panY = 0;
    let zoom = 0;
    let zoomX = 0;
    let zoomY = 0;
```

Extend the summing comment above them to cover the zoom:

```ts
    // A trackpad emits wheel events faster than the browser paints, and each
    // one would otherwise rebuild the whole scene. Deltas are summed here and
    // spent once a frame instead, which is exact rather than approximate: pan
    // is linear in the delta, and `exp(-(a + b) / d)` is the product of the
    // two zooms it stands in for.
```

Give `flush` the zoom, before the pan:

```ts
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
```

And branch `handleWheel`, wrapping the pan written in Task 2 in the `else`:

```ts
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
```

- [ ] **Step 5: Run the file to verify everything passes**

Run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx
```

Expected: PASS, all tests — the eight wheel tests, the grab-offset test from
Task 1, and every test that was there before.

- [ ] **Step 6: Commit**

```bash
git add apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx
git commit -m "feat(editor): zoom the canvas on a pinch rather than on every wheel"
```

---

## Task 4: Verify against a real trackpad, then open the PR

Every constant in this plan is a first guess at a feel. This task is where the
guesses get checked by hand, because no jsdom test can tell you whether a pan is
too fast.

**Files:**

- Possibly modify: `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx` (constants only)
- Possibly modify: the assertions in `apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx` that name `140` or `24`

- [ ] **Step 1: Run the full check from the repo root**

```bash
bun run check-types && bun run test && bun run lint
```

Expected: all three pass. `check-types` covers the whole Turborepo, so a type
error introduced in `diagram-stage.tsx` surfaces here even though only the app
changed.

- [ ] **Step 2: Start the app**

```bash
bun run dev:fullstack-fn
```

Open the editor route in a browser on the machine with the trackpad.

- [ ] **Step 3: Walk the gesture checklist**

Confirm each, and report any that fail rather than fixing silently:

1. Two fingers dragged up/down on the trackpad pans the canvas; the zoom
   percentage in the bottom-left bar does not move.
2. Two fingers dragged left/right pans sideways.
3. A pinch open zooms in, a pinch closed zooms out, and the point under the
   cursor stays under the cursor.
4. The pan and the zoom are smooth — no stepping, no stutter, no lag behind the
   fingers.
5. Cmd + a mouse wheel notch zooms by a reasonable amount, not a lurch.
6. A plain mouse wheel notch pans vertically.
7. The page behind the canvas never scrolls, and the browser never zooms.
8. Middle-button drag still pans, and the Pan tool still pans.
9. Grabbing a tile by its edge and dragging: the tile follows the cursor and
   does not jump when the drag starts.
10. The `+` / `−` buttons and Fit still work.

- [ ] **Step 4: Tune, if anything felt wrong**

Only these constants are in scope. Change one, reload, re-check:

- Pan too fast or too slow → `PAN_SPEED` (start from `1`; `0.8` is calmer).
- Zoom too fast or too slow → `ZOOM_DAMPING` (higher is calmer; `180` for a slower pinch, `110` for a quicker one).
- Cmd + wheel still lurching → lower `MAX_ZOOM_DELTA` toward `16`.

If `ZOOM_DAMPING` or `MAX_ZOOM_DELTA` changes, update the three zoom tests that
name `140` and `24` and re-run:

```bash
bunx vitest run src/components/editor/__tests__/diagram-stage.test.tsx
```

Commit only if something changed:

```bash
git add apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx apps/fullstack-fn-only/src/components/editor/__tests__/diagram-stage.test.tsx
git commit -m "fix(editor): tune the canvas navigation constants against a trackpad"
```

- [ ] **Step 5: Push and open the PR**

The remote uses the `github-personal` SSH alias, so `gh` must be on the
`csdev19` account:

```bash
gh auth switch --user csdev19
git push -u origin feat/canvas-navigation
gh pr create --title "feat(editor): navigate the canvas the way Excalidraw does" --body "$(cat <<'EOF'
## What

A two-finger trackpad drag now pans the canvas and a pinch zooms it, instead of
every wheel event zooming. A dragged tile now stays where it was grabbed.

## Why

Two complaints with one theme — the canvas responded too strongly to small
input. Zoom was the only thing the wheel did, so the gesture everyone reaches
for to scroll zoomed instead, and it zoomed hard because trackpad deltas arrive
far faster than mouse notches. Separately, a node's coordinates are its centre,
and the drag handler passed the raw pointer straight into them: pressing a tile
anywhere off centre threw it half a tile before the drag had begun.

## How

The browser already tells the two trackpad gestures apart — a pinch arrives as a
wheel event carrying a synthetic `ctrlKey` — so the handler branches on that
flag rather than trying to recognise a gesture. Deltas are summed and spent once
per animation frame, which caps a burst of trackpad events at one scene rebuild;
summing is exact for both, since pan is linear and zoom is exponential in the
delta. Sensitivity lives in four named constants, tuned against a real trackpad.

The node drag gains the grab offset the boundary drag already had.

A plain mouse wheel now pans vertically rather than zooming. That is deliberate,
and matches Excalidraw: one rule for every device, with zoom on Cmd/Ctrl, the
+/- buttons and Fit.

## Testing

Eight new tests cover pan on each axis, the shift swap, line-mode deltas,
frame coalescing, zoom in and out, and the per-event zoom cap. One more covers
the grab offset — it fails against the old handler. Gestures were also walked by
hand on a Mac trackpad against the checklist in the plan.

Design: `docs/specs/2026-09-04-canvas-navigation-design.md`
Plan: `docs/plans/2026-09-04-canvas-navigation.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Report the PR URL**

Print the URL `gh pr create` returned. The work is not delivered until it is a
PR.
