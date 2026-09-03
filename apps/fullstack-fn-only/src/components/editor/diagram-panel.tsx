import { CANVAS_TONES, CANVAS_TONE_INFO } from "@diagram-tool/domain/constants";
import type { CanvasTone } from "@diagram-tool/domain/constants";
import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { MicroLabel, MonoText } from "@/components/editor/editor-chrome";

/**
 * The inspector with nothing selected: the diagram itself.
 *
 * One control so far, and the one that needed a home — the paper tone. It is
 * part of the drawing, not of the chrome: it exports with the diagram, which is
 * why it lives in the config and not in a theme.
 */

interface DiagramPanelProps {
  config: ResolvedDiagram;
  onBackgroundChange: (tone: CanvasTone) => void;
}

/** The order they read in, plainest first. */
const TONE_ORDER: CanvasTone[] = [
  CANVAS_TONES.WHITE,
  CANVAS_TONES.GREY,
  CANVAS_TONES.BLUE,
  CANVAS_TONES.CREAM,
  CANVAS_TONES.BLUSH,
];

const TONE_LABELS: Record<CanvasTone, string> = {
  [CANVAS_TONES.WHITE]: "White",
  [CANVAS_TONES.GREY]: "Grey",
  [CANVAS_TONES.BLUE]: "Blueprint",
  [CANVAS_TONES.CREAM]: "Legal pad",
  [CANVAS_TONES.BLUSH]: "Blush",
};

export function DiagramPanel({ config, onBackgroundChange }: DiagramPanelProps) {
  const current = config.background ?? CANVAS_TONES.GREY;

  return (
    <section aria-label="Diagram" className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{config.title}</MonoText>
        <MicroLabel>Diagram</MicroLabel>
      </header>

      <div className="space-y-1.5">
        <span className="block text-[12.5px] font-medium text-ed-text">Paper</span>

        <div role="boundary" aria-label="Paper" className="flex gap-2">
          {TONE_ORDER.map((tone) => (
            <button
              key={tone}
              type="button"
              aria-pressed={tone === current}
              aria-label={TONE_LABELS[tone]}
              title={TONE_LABELS[tone]}
              onClick={() => onBackgroundChange(tone)}
              // The swatch is the paper itself, so it carries the renderer's
              // literal rather than a chrome token — the same boundary the
              // palette thumbnails keep.
              style={{ backgroundColor: CANVAS_TONE_INFO[tone] }}
              className={cn(
                "size-9 rounded-[8px] border transition-shadow duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                tone === current
                  ? "border-ed-accent shadow-[0_0_0_2px_var(--ed-accent)]"
                  : "border-ed-border",
              )}
            />
          ))}
        </div>

        <span className="block text-[11.5px] text-ed-text-3">
          {TONE_LABELS[current]}. The paper exports with the diagram.
        </span>
      </div>

      <p className="text-[13px] text-ed-text-2">
        Click a tile on the canvas to edit it. Drag to move; the JSON follows.
      </p>
    </section>
  );
}
