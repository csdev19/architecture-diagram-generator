// Adds the jest-dom matchers (toBeInTheDocument, toBeDisabled, …) to vitest's
// expect for every component test, and keeps them in the tsconfig program (it
// lives under src/) so tsc sees the augmentation too.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own auto-cleanup when vitest is running
// with `globals: true`. It is not, so unmounting is wired explicitly — without
// it, every `render` in a file stacks up in the same document and queries fail
// with "found multiple elements" rather than anything that names the cause.
afterEach(cleanup);

/**
 * jsdom implements no `PointerEvent`. Testing Library falls back to a plain
 * `Event`, which carries no `clientX`/`clientY` — so a drag test fires a
 * perfectly shaped gesture with no coordinates in it, and the assertions fail
 * as though the handler were broken. Extending `MouseEvent` restores them.
 */
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

/**
 * The same gap for drag and drop: jsdom implements no `DragEvent`, so a drop
 * fired at a point arrives with no point on it, and the handler that converts
 * client coordinates into the diagram's would silently compute `NaN`.
 */
if (typeof globalThis.DragEvent === "undefined") {
  class DragEventPolyfill extends MouseEvent {
    readonly dataTransfer: DataTransfer | null;

    constructor(type: string, params: DragEventInit = {}) {
      super(type, params);
      this.dataTransfer = params.dataTransfer ?? null;
    }
  }

  globalThis.DragEvent = DragEventPolyfill as unknown as typeof DragEvent;
}

/**
 * jsdom performs no layout, so every element reports a zero size. The editor's
 * camera derives the visible rectangle from the stage's measured size, and a
 * zero-sized stage means there is nothing to look at and nothing to draw — so
 * elements report a fixed viewport instead, the way `getScreenCTM` below
 * reports a fixed matrix. The number is arbitrary; only "not zero" matters.
 */
const TEST_VIEWPORT = { width: 1000, height: 800 };

for (const [property, value] of Object.entries({
  clientWidth: TEST_VIEWPORT.width,
  clientHeight: TEST_VIEWPORT.height,
})) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get: () => value,
  });
}

// Pointer capture is part of the same gap. The component calls these
// defensively, but stubbing them keeps a capture from silently doing nothing
// different in tests than it does in a browser.
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
