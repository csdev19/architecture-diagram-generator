import { CANVAS_TONES, CANVAS_TONE_INFO, ICON_STYLES } from "@diagram-tool/domain/constants";
import type { CanvasTone, IconStyle } from "@diagram-tool/domain/constants";
import type { ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { MicroLabel, MonoText } from "@/components/editor/editor-chrome";

/**
 * The inspector with nothing selected: the diagram itself.
 *
 * Two controls, both about the drawing rather than the chrome: the paper tone
 * and how the brand marks are coloured. Both export with the diagram, which is
 * why they live in the diagram and not in a theme.
 */

interface DiagramPanelProps {
  diagram: ResolvedDiagram;
  onBackgroundChange: (tone: CanvasTone) => void;
  onIconStyleChange: (style: IconStyle) => void;
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

const ICON_STYLE_ORDER: IconStyle[] = [ICON_STYLES.COLOR, ICON_STYLES.MONO];

const ICON_STYLE_LABELS: Record<IconStyle, string> = {
  [ICON_STYLES.COLOR]: "Colour",
  [ICON_STYLES.MONO]: "Mono",
};

export function DiagramPanel({
  diagram,
  onBackgroundChange,
  onIconStyleChange,
}: DiagramPanelProps) {
  const current = diagram.background ?? CANVAS_TONES.GREY;
  const iconStyle = diagram.iconStyle ?? ICON_STYLES.COLOR;

  return (
    <section aria-label="Diagram" className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{diagram.title}</MonoText>
        <MicroLabel>Diagram</MicroLabel>
      </header>

      <div className="space-y-1.5">
        <span className="block text-[12.5px] font-medium text-ed-text">Paper</span>

        <div role="group" aria-label="Paper" className="flex gap-2">
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

      <div className="space-y-1.5">
        <span className="block text-[12.5px] font-medium text-ed-text">Marks</span>

        <div role="group" aria-label="Marks" className="flex gap-2">
          {ICON_STYLE_ORDER.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={style === iconStyle}
              onClick={() => onIconStyleChange(style)}
              className={cn(
                "rounded-[8px] border px-3 py-1.5 text-[12.5px] font-medium",
                "transition-shadow duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                style === iconStyle
                  ? "border-ed-accent text-ed-text shadow-[0_0_0_2px_var(--ed-accent)]"
                  : "border-ed-border text-ed-text-2 hover:bg-ed-surface-hover",
              )}
            >
              {ICON_STYLE_LABELS[style]}
            </button>
          ))}
        </div>

        <span className="block text-[11.5px] text-ed-text-3">
          {iconStyle === ICON_STYLES.MONO
            ? "Every logo as a silhouette: black on paper, white on a dark tile."
            : "Logos in their own colours where they read; silhouettes where they would not."}
        </span>
      </div>

      <p className="text-[13px] text-ed-text-2">
        Click a tile on the canvas to edit it. Drag to move; the JSON follows.
      </p>
    </section>
  );
}
