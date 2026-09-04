# Canvas Navigation Design

**Status:** accepted, not yet implemented on `main`.
**Scope:** `apps/fullstack-fn-only/src/components/editor/diagram-stage.tsx`.

## Problem

Two complaints, one theme: the canvas responds too strongly to small input.

1. **Every wheel event zooms.** On a Mac trackpad the two-finger drag — the
   gesture everyone reaches for to scroll — zooms instead of panning, and it
   zooms hard, because trackpad deltas arrive far faster than mouse notches.
   There is no way to pan except the middle mouse button or the Pan tool.
2. **Dragging a tile teleports it.** Press a tile anywhere but dead centre,
   move one pixel, and the tile jumps so that its _centre_ lands under the
   cursor. Grabbing a tile by its edge throws it half a tile before the drag
   has begun.

## Decision

### Pan and zoom come from the same event, told apart by a flag

The browser already distinguishes the two trackpad gestures, so no gesture
recogniser is needed. A pinch arrives as a `wheel` event carrying a
**synthetic `ctrlKey`** — the flag is set with no key held. A two-finger drag
arrives as a plain `wheel` event with `deltaX`/`deltaY`. The handler branches on
that flag:

| Input                                 | Result                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `wheel`, no modifier                  | Pan by `deltaX`/`deltaY`                                                |
| `wheel` + `shiftKey`                  | Pan sideways (only where the platform has not already swapped the axes) |
| `wheel` + `ctrlKey` (trackpad pinch)  | Zoom about the pointer                                                  |
| `wheel` + `ctrlKey`/`metaKey` (mouse) | Zoom about the pointer                                                  |

This makes a plain mouse wheel pan vertically rather than zoom. That is a
deliberate change and matches Excalidraw: one rule covers every device, and the
zoom stays reachable through Cmd/Ctrl, the `+`/`−` buttons, and Fit.

`useStageView` already exposes both primitives — `panBy(dx, dy)` in screen
pixels and `setScaleAt(scale, clientX, clientY)`. Neither changes.

### Input is spent once per frame, not once per event

A trackpad emits wheel events faster than the browser paints, and each one
currently rebuilds the entire scene: the SVG is a `useMemo` keyed on the camera
rectangle, so every camera change re-renders every shape. Deltas are summed in
refs and flushed inside a single `requestAnimationFrame`, capping the work at
one render per frame.

Summing is exact for both gestures rather than an approximation: pan is linear,
and zoom is exponential in the delta, so `exp(-(a+b)/d) === exp(-a/d) *
exp(-b/d)`. Coalescing changes when the work happens, never the result.

### Sensitivity lives in named constants

| Constant         | Value | Why                                                                                                                                                  |
| ---------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAN_SPEED`      | `1`   | 1:1. macOS already applies its own acceleration to the gesture; any other factor makes the canvas feel detached from the fingers.                    |
| `ZOOM_DAMPING`   | `140` | Divides the delta before exponentiating. Larger is calmer. Calmer than Excalidraw's ~100 by choice.                                                  |
| `MAX_ZOOM_DELTA` | `24`  | A pinch reports deltas of 1–10; a mouse notch under Cmd reports 100+. Without a per-event ceiling the same code lurches half a zoom level per notch. |
| `LINE_HEIGHT`    | `16`  | Some mice report scroll in lines (`deltaMode === 1`, a notch is ~3) rather than pixels. Unscaled, the pan would be imperceptible on those devices.   |

The old handler divided by `400`, calibrated for mouse notches. Left as-is a
pinch would barely register.

### A node drag keeps its grab offset

`moveNode` writes a node's **centre**, and the drag handler passes the raw
pointer position into it. The boundary drag already solves this — it records
`offsetX`/`offsetY` at `pointerdown` and subtracts them on every move. Nodes get
the same treatment. Nothing else about the drag changes: the snap to the
half-grid (13 world units) stays, and the group-drag path already measures a
delta and is already correct.

## Alternatives rejected

- **Keep zoom on the plain wheel and detect the trackpad heuristically**
  (fractional `deltaY`, non-zero `deltaX`, `deltaMode`). Works most of the time,
  fails silently the rest, and doubles the branching. Rejected in favour of one
  rule for every device.
- **Loosen the grid snap to make dragging feel finer.** The snap is not what
  makes the tile travel far; the missing offset is. Changing both at once would
  have hidden the bug.
- **Add momentum/inertia to the pan.** The OS already supplies momentum on a
  trackpad through the tail of wheel events. Simulating our own would fight it.
- **Space + drag to pan.** A real Excalidraw gesture, but not asked for, and the
  middle button and Pan tool already cover the need.

## Non-goals

Touch and pointer-based pinch on tablets, kinetic scrolling, zoom-to-selection,
and any change to `useStageView`.

## What would reopen this

If pinch zoom turns out to be unreliable in a browser that does not set the
synthetic `ctrlKey` on a trackpad pinch, the flag-based split needs a fallback —
most likely the Safari-only `gesturestart`/`gesturechange` events.
