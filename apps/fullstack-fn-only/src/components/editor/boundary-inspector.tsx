import type { ReactNode } from "react";
import { DIAGRAM_LIMITS, BOUNDARY_TONES, BOUNDARY_TONE_INFO } from "@diagram-tool/domain/constants";
import type { BoundaryTone } from "@diagram-tool/domain/constants";
import type { DiagramBoundary } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { EditorInput, MicroLabel, MonoText } from "@/components/editor/editor-chrome";
import type { BoundaryPatch } from "@/components/editor/use-diagram-editing";

/**
 * The panel for the selected boundary.
 *
 * `tone` is the field that matters and the one that is easiest to get wrong, so
 * it is not a dropdown of colour names: each choice says what it *means*, and
 * the swatch beside it is the consequence. A boundary is a perimeter in the
 * system being drawn — a cloud, a runtime, a monorepo — and the palette follows
 * from that, never the other way round.
 */

interface BoundaryInspectorProps {
  boundary: DiagramBoundary;
  onChange: (patch: BoundaryPatch) => void;
}

const { TEXT_MAX } = DIAGRAM_LIMITS;

/** What each tone is *for*. The hex is the renderer's business. */
const TONE_MEANINGS: Record<BoundaryTone, string> = {
  [BOUNDARY_TONES.ORANGE]: "Cloud or runtime",
  [BOUNDARY_TONES.BLUE]: "Tooling, monorepo, build",
  [BOUNDARY_TONES.GREEN]: "External services and data",
  [BOUNDARY_TONES.NEUTRAL]: "Anything else",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[12.5px] font-medium text-ed-text">{label}</span>
      {children}
      {hint ? <span className="block text-[11.5px] text-ed-text-3">{hint}</span> : null}
    </div>
  );
}

export function BoundaryInspector({ boundary, onChange }: BoundaryInspectorProps) {
  /** A half-typed number is not a coordinate yet. */
  const handleNumber = (field: "x" | "y" | "w" | "h", raw: string) => {
    const value = Number(raw);
    if (raw === "" || Number.isNaN(value)) return;
    onChange({ [field]: value });
  };

  return (
    <section aria-label={`Boundary ${boundary.id}`} className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{boundary.id}</MonoText>
        <MicroLabel>Boundary</MicroLabel>
      </header>

      <Field label="Label" hint={`${TEXT_MAX} characters max. Short and upper case reads best.`}>
        <EditorInput
          aria-label="Label"
          value={boundary.label}
          maxLength={TEXT_MAX}
          onChange={(event) => onChange({ label: event.target.value.slice(0, TEXT_MAX) })}
        />
      </Field>

      <Field label="Icon">
        <EditorInput
          aria-label="Icon"
          value={boundary.icon}
          placeholder="Optional emoji"
          onChange={(event) => onChange({ icon: event.target.value })}
        />
      </Field>

      <Field label="Tone" hint="Pick what the boundary is. The renderer picks the colour.">
        <div role="boundary" aria-label="Tone" className="space-y-1">
          {Object.values(BOUNDARY_TONES).map((tone) => (
            <button
              key={tone}
              type="button"
              aria-pressed={boundary.tone === tone}
              onClick={() => onChange({ tone })}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] border px-2 py-1.5 text-left",
                "text-[12.5px] transition-colors duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                boundary.tone === tone
                  ? "border-ed-border-strong bg-ed-surface-2 text-ed-text"
                  : "border-ed-border text-ed-text-2 hover:bg-ed-surface-hover",
              )}
            >
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-[5px] border"
                style={{
                  backgroundColor: BOUNDARY_TONE_INFO[tone].fill,
                  borderColor: BOUNDARY_TONE_INFO[tone].border,
                }}
              />
              {TONE_MEANINGS[tone]}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="x">
          <EditorInput
            aria-label="Boundary x"
            type="number"
            value={boundary.x}
            onChange={(event) => handleNumber("x", event.target.value)}
          />
        </Field>
        <Field label="y">
          <EditorInput
            aria-label="Boundary y"
            type="number"
            value={boundary.y}
            onChange={(event) => handleNumber("y", event.target.value)}
          />
        </Field>
        <Field label="width">
          <EditorInput
            aria-label="Boundary width"
            type="number"
            value={boundary.w}
            onChange={(event) => handleNumber("w", event.target.value)}
          />
        </Field>
        <Field label="height">
          <EditorInput
            aria-label="Boundary height"
            type="number"
            value={boundary.h}
            onChange={(event) => handleNumber("h", event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-2 rounded-[12px] border border-ed-border p-3">
        {[
          {
            key: "filled" as const,
            label: "Filled",
            hint: "Off draws the border only — how a nested boundary is made.",
            value: boundary.filled,
          },
          {
            key: "dashed" as const,
            label: "Dashed border",
            hint: "For a boundary that is logical rather than physical.",
            value: boundary.dashed,
          },
        ].map((option) => (
          <label key={option.key} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={option.value}
              onChange={(event) => onChange({ [option.key]: event.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--ed-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ed-text">{option.label}</span>
              <span className="block text-[11.5px] text-ed-text-3">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
