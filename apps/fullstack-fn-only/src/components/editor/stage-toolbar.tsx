import { ArrowRight, Frame, Hand, MousePointer2, Square, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@diagram-tool/web-ui";
import {
  EDITOR_TOOLS,
  TOOL_LABELS,
  TOOL_ORDER,
  TOOL_TITLES,
} from "@/components/editor/editor-tools";
import type { EditorTool } from "@/components/editor/editor-tools";

/**
 * The floating tool pill.
 *
 * It sits over the canvas rather than in a rail beside it: the canvas is the
 * screen, and every pixel a chrome column takes is a pixel of diagram nobody
 * sees.
 *
 * Every tool is written out. Icon-only toolbars work when the icons are
 * conventions people already carry — an arrow, a hand — and stop working the
 * moment they are not, which a square outline standing for "place a tile" is
 * not. The shortcut digit rides in the corner so the keyboard is discoverable
 * without a legend.
 */

const TOOL_ICONS: Record<EditorTool, LucideIcon> = {
  [EDITOR_TOOLS.SELECT]: MousePointer2,
  [EDITOR_TOOLS.PAN]: Hand,
  [EDITOR_TOOLS.NODE]: Square,
  [EDITOR_TOOLS.BOUNDARY]: Frame,
  [EDITOR_TOOLS.EDGE]: ArrowRight,
};

interface StageToolbarProps {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  /** `null` disables the bin: there is nothing selected to delete. */
  onDelete: (() => void) | null;
}

export function StageToolbar({ tool, onToolChange, onDelete }: StageToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className={cn(
        "pointer-events-auto absolute top-3 left-1/2 z-20 -translate-x-1/2",
        "flex items-center gap-0.5 rounded-[12px] border border-ed-border bg-ed-surface p-1.5",
        "shadow-[var(--ed-shadow-md)]",
      )}
    >
      {TOOL_ORDER.map((candidate, index) => {
        const Icon = TOOL_ICONS[candidate];
        const active = candidate === tool;

        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={active}
            title={`${TOOL_TITLES[candidate]}  (${index + 1})`}
            aria-label={`${TOOL_TITLES[candidate]} (${index + 1})`}
            onClick={() => onToolChange(candidate)}
            className={cn(
              "relative flex h-[34px] items-center gap-1.5 rounded-[8px] pr-3.5 pl-2.5",
              "text-[13px] font-medium transition-colors duration-[140ms] outline-none",
              "focus-visible:shadow-[var(--ed-focus-ring)]",
              active
                ? "bg-ed-accent text-ed-accent-fg"
                : "text-ed-text-2 hover:bg-ed-surface-hover hover:text-ed-text",
            )}
          >
            <Icon className="size-[16px]" strokeWidth={1.75} aria-hidden />
            {TOOL_LABELS[candidate]}
            <span
              aria-hidden
              className="absolute right-1 bottom-0.5 font-mono text-[9px] opacity-50"
            >
              {index + 1}
            </span>
          </button>
        );
      })}

      <span aria-hidden className="mx-1 h-[22px] w-px bg-ed-border" />

      <button
        type="button"
        title="Delete what is selected  (Delete)"
        aria-label="Delete what is selected"
        disabled={!onDelete}
        onClick={() => onDelete?.()}
        className={cn(
          "flex size-[34px] items-center justify-center rounded-[8px]",
          "transition-colors duration-[140ms] outline-none focus-visible:shadow-[var(--ed-focus-ring)]",
          onDelete
            ? "text-ed-danger hover:bg-ed-danger-quiet"
            : "cursor-not-allowed text-ed-text-3 opacity-60",
        )}
      >
        <Trash2 className="size-[16px]" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
