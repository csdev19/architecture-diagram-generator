import type { ReactNode } from "react";
import { DIAGRAM_LIMITS, BOUNDARY_TONES, BOUNDARY_TONE_INFO } from "@diagram-tool/domain/constants";
import type { BoundaryTone } from "@diagram-tool/domain/constants";
import type { DiagramGroup } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { EditorInput, MicroLabel, MonoText } from "@/components/editor/editor-chrome";
import type { GroupPatch } from "@/components/editor/use-diagram-editing";

/**
 * The panel for the selected group.
 *
 * `tone` is the field that matters and the one that is easiest to get wrong, so
 * it is not a dropdown of colour names: each choice says what it *means*, and
 * the swatch beside it is the consequence. A group is a boundary in the system
 * being drawn — a cloud, a runtime, a monorepo — and the palette follows from
 * that, never the other way round.
 */

interface GroupInspectorProps {
  group: DiagramGroup;
  onChange: (patch: GroupPatch) => void;
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

export function GroupInspector({ group, onChange }: GroupInspectorProps) {
  /** A half-typed number is not a coordinate yet. */
  const handleNumber = (field: "x" | "y" | "w" | "h", raw: string) => {
    const value = Number(raw);
    if (raw === "" || Number.isNaN(value)) return;
    onChange({ [field]: value });
  };

  return (
    <section aria-label={`Group ${group.id}`} className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{group.id}</MonoText>
        <MicroLabel>Group</MicroLabel>
      </header>

      <Field label="Label" hint={`${TEXT_MAX} characters max. Short and upper case reads best.`}>
        <EditorInput
          aria-label="Label"
          value={group.label}
          maxLength={TEXT_MAX}
          onChange={(event) => onChange({ label: event.target.value.slice(0, TEXT_MAX) })}
        />
      </Field>

      <Field label="Icon">
        <EditorInput
          aria-label="Icon"
          value={group.icon}
          placeholder="Optional emoji"
          onChange={(event) => onChange({ icon: event.target.value })}
        />
      </Field>

      <Field label="Tone" hint="Pick what the boundary is. The renderer picks the colour.">
        <div role="group" aria-label="Tone" className="space-y-1">
          {Object.values(BOUNDARY_TONES).map((tone) => (
            <button
              key={tone}
              type="button"
              aria-pressed={group.tone === tone}
              onClick={() => onChange({ tone })}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] border px-2 py-1.5 text-left",
                "text-[12.5px] transition-colors duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                group.tone === tone
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
            aria-label="Group x"
            type="number"
            value={group.x}
            onChange={(event) => handleNumber("x", event.target.value)}
          />
        </Field>
        <Field label="y">
          <EditorInput
            aria-label="Group y"
            type="number"
            value={group.y}
            onChange={(event) => handleNumber("y", event.target.value)}
          />
        </Field>
        <Field label="width">
          <EditorInput
            aria-label="Group width"
            type="number"
            value={group.w}
            onChange={(event) => handleNumber("w", event.target.value)}
          />
        </Field>
        <Field label="height">
          <EditorInput
            aria-label="Group height"
            type="number"
            value={group.h}
            onChange={(event) => handleNumber("h", event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-2 rounded-[12px] border border-ed-border p-3">
        {[
          {
            key: "filled" as const,
            label: "Filled",
            hint: "Off draws the border only — how a nested group is made.",
            value: group.filled,
          },
          {
            key: "dashed" as const,
            label: "Dashed border",
            hint: "For a boundary that is logical rather than physical.",
            value: group.dashed,
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
