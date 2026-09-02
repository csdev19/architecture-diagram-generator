import type { ObjectProperties } from "@diagram-tool/domain/types";

/**
 * The stage's tools. Five, each of which does something.
 *
 * `group` was once here as an affordance only — pressing it changed the hint
 * and nothing else — and was removed, because a button that does nothing is the
 * least legible kind of button there is. It is back now that drawing a box is a
 * real gesture. `text` is still absent: labels are edited in the inspector, and
 * a tool for that would be the same lie.
 *
 * Every tool is labelled in the toolbar rather than left as a bare glyph. A
 * square outline meaning "place a tile" is a thing you learn once and re-guess
 * every time after.
 */
export const EDITOR_TOOLS = {
  SELECT: "select",
  PAN: "pan",
  NODE: "node",
  GROUP: "group",
  EDGE: "edge",
} as const;

export type EditorTool = ObjectProperties<typeof EDITOR_TOOLS>;

/** Toolbar order, which is also the `1`–`5` shortcut order. */
export const TOOL_ORDER: EditorTool[] = [
  EDITOR_TOOLS.SELECT,
  EDITOR_TOOLS.PAN,
  EDITOR_TOOLS.NODE,
  EDITOR_TOOLS.GROUP,
  EDITOR_TOOLS.EDGE,
];

/** The word on the button. */
export const TOOL_LABELS: Record<EditorTool, string> = {
  [EDITOR_TOOLS.SELECT]: "Select",
  [EDITOR_TOOLS.PAN]: "Pan",
  [EDITOR_TOOLS.NODE]: "Place",
  [EDITOR_TOOLS.GROUP]: "Group",
  [EDITOR_TOOLS.EDGE]: "Connect",
};

/** The sentence in the tooltip, which says what the gesture actually is. */
export const TOOL_TITLES: Record<EditorTool, string> = {
  [EDITOR_TOOLS.SELECT]: "Select and drag tiles",
  [EDITOR_TOOLS.PAN]: "Drag to move around the canvas",
  [EDITOR_TOOLS.NODE]: "Click to place the chosen tile",
  [EDITOR_TOOLS.GROUP]: "Drag a box around what belongs together",
  [EDITOR_TOOLS.EDGE]: "Click a tile, then another, to connect them",
};

interface HintContext {
  /** Human name of the tile the palette has selected. */
  tileLabel: string;
  /** Set once an edge's source tile has been picked. */
  edgeFrom: string | null;
}

/** The one line under the toolbar. It always names the next gesture. */
export const toolHint = (tool: EditorTool, { tileLabel, edgeFrom }: HintContext): string => {
  switch (tool) {
    case EDITOR_TOOLS.SELECT:
      return "Drag a tile from the palette, or drag one here to move it. The JSON follows.";
    case EDITOR_TOOLS.PAN:
      return "Drag to move around. Scroll to zoom.";
    case EDITOR_TOOLS.NODE:
      return `Click anywhere to place a ${tileLabel} tile.`;
    case EDITOR_TOOLS.GROUP:
      return "Drag a box around the tiles that share a boundary. Name it in the inspector.";
    case EDITOR_TOOLS.EDGE:
      return edgeFrom ? "Now click the target tile." : "Click the source tile, then the target.";
  }
};

export const STAGE_CURSORS: Record<EditorTool, string> = {
  [EDITOR_TOOLS.SELECT]: "default",
  [EDITOR_TOOLS.PAN]: "grab",
  [EDITOR_TOOLS.NODE]: "crosshair",
  [EDITOR_TOOLS.GROUP]: "crosshair",
  [EDITOR_TOOLS.EDGE]: "crosshair",
};
