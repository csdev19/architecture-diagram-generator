import { Minus, Plus } from "lucide-react";
import { cn } from "@diagram-tool/web-ui";

/** One press of `+` or `−`. A ratio rather than a step, so it feels even at any zoom. */
const ZOOM_STEP = 1.2;

interface ZoomBarProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onFit: () => void;
}

const stepButton = cn(
  "flex size-7 items-center justify-center rounded-[8px] text-ed-text-2",
  "transition-colors duration-[140ms] outline-none",
  "hover:bg-ed-surface-hover hover:text-ed-text focus-visible:shadow-[var(--ed-focus-ring)]",
);

/**
 * The zoom readout, bottom-left of the stage.
 *
 * The percentage is a button because it is the one number an author wants to
 * undo: pressing it goes back to 1:1, which is the only scale where the sheet
 * is the size it will export at.
 */
export function ZoomBar({ scale, onScaleChange, onFit }: ZoomBarProps) {
  const percent = Math.round(scale * 100);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-1 rounded-[12px] p-1.5",
        "border border-ed-border bg-ed-surface shadow-[var(--ed-shadow-md)]",
      )}
    >
      <button
        type="button"
        aria-label="Zoom out"
        className={stepButton}
        onClick={() => onScaleChange(scale / ZOOM_STEP)}
      >
        <Minus className="size-[15px]" strokeWidth={1.75} aria-hidden />
      </button>

      <button
        type="button"
        aria-label={`Zoom is ${percent} percent. Reset to 100 percent`}
        onClick={() => onScaleChange(1)}
        className={cn(
          "min-w-[52px] rounded-[8px] px-1 py-1 font-mono text-[12px] text-ed-text",
          "transition-colors duration-[140ms] outline-none",
          "hover:bg-ed-surface-hover focus-visible:shadow-[var(--ed-focus-ring)]",
        )}
      >
        {percent}%
      </button>

      <button
        type="button"
        aria-label="Zoom in"
        className={stepButton}
        onClick={() => onScaleChange(scale * ZOOM_STEP)}
      >
        <Plus className="size-[15px]" strokeWidth={1.75} aria-hidden />
      </button>

      <span aria-hidden className="mx-0.5 h-[18px] w-px bg-ed-border" />

      <button
        type="button"
        onClick={onFit}
        className={cn(
          "rounded-[8px] px-2 py-1 text-[13px] font-medium text-ed-text",
          "transition-colors duration-[140ms] outline-none",
          "hover:bg-ed-surface-hover focus-visible:shadow-[var(--ed-focus-ring)]",
        )}
      >
        Fit
      </button>
    </div>
  );
}
