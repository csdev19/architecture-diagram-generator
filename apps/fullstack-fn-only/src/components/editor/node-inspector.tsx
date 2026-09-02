import type { ReactNode } from "react";
import { DIAGRAM_ICON_KEYS, DIAGRAM_LIMITS, TILE_VARIANTS } from "@diagram-tool/domain/constants";
import type { DiagramNode } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { EditorInput, EditorSelect, MicroLabel, MonoText } from "@/components/editor/editor-chrome";
import type { NodePatch } from "@/components/editor/use-diagram-editing";

/**
 * The panel for the selected tile.
 *
 * Every field writes straight through `updateNodeFields` into the editor's
 * text — there is no local draft state, so the panel cannot drift from the JSON
 * and typing here is indistinguishable from typing in the textarea.
 *
 * The text fields stop at the schema's own limit rather than letting an author
 * type past it and then explaining the error: in the textarea the limit is a
 * rule you can break and read about, in a labelled input it is the field's
 * length. The JSON stays the place where anything can be written.
 */

interface NodeInspectorProps {
  node: DiagramNode;
  /** How many tiles in the whole diagram are dark. Emphasis is a budget. */
  darkTileCount: number;
  onChange: (patch: NodePatch) => void;
}

/** Shown when a node swaps from an icon to an emoji and has none of its own. */
const FALLBACK_EMOJI = "📦";

const { TEXT_MAX } = DIAGRAM_LIMITS;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[12.5px] font-medium text-ed-text">{label}</span>
      {children}
      {hint ? <span className="block text-[11.5px] text-ed-text-3">{hint}</span> : null}
    </div>
  );
}

export function NodeInspector({ node, darkTileCount, onChange }: NodeInspectorProps) {
  const isDark = node.tile === TILE_VARIANTS.DARK;

  const handleMarkChange = (value: string) => {
    if (value === "") {
      // Back to an emoji. Seeding one keeps the config valid rather than
      // dropping the author into an error they did not ask for.
      onChange({ iconKey: undefined, emoji: node.emoji ?? FALLBACK_EMOJI });
      return;
    }
    onChange({ iconKey: value as DiagramNode["iconKey"], emoji: undefined });
  };

  /** A coordinate the config can hold. A half-typed `-` is not a number yet. */
  const handleCoordinate = (axis: "x" | "y", raw: string) => {
    const value = Number(raw);
    if (raw === "" || Number.isNaN(value)) return;
    onChange({ [axis]: value });
  };

  return (
    <section aria-label={`Node ${node.id}`} className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{node.id}</MonoText>
        <MicroLabel>Node</MicroLabel>
      </header>

      <Field label="Name" hint={`${TEXT_MAX} characters max — the schema limit`}>
        <EditorInput
          id="node-name"
          aria-label="Name"
          value={node.name}
          maxLength={TEXT_MAX}
          onChange={(event) => onChange({ name: event.target.value.slice(0, TEXT_MAX) })}
        />
      </Field>

      <Field label="Sub">
        <EditorInput
          id="node-sub"
          aria-label="Sub"
          value={node.sub}
          maxLength={TEXT_MAX}
          placeholder="http server"
          onChange={(event) => onChange({ sub: event.target.value.slice(0, TEXT_MAX) })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="x">
          <EditorInput
            id="node-x"
            aria-label="x"
            type="number"
            value={node.x}
            onChange={(event) => handleCoordinate("x", event.target.value)}
          />
        </Field>
        <Field label="y">
          <EditorInput
            id="node-y"
            aria-label="y"
            type="number"
            value={node.y}
            onChange={(event) => handleCoordinate("y", event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Tile"
        hint={`${darkTileCount} dark ${darkTileCount === 1 ? "tile" : "tiles"} in this diagram — keep it to two or three.`}
      >
        <div
          role="group"
          aria-label="Tile"
          className="flex gap-1 rounded-[8px] border border-ed-border bg-ed-field p-1"
        >
          {[
            { value: TILE_VARIANTS.LIGHT, label: "light" },
            { value: TILE_VARIANTS.DARK, label: "dark — emphasis" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={node.tile === option.value}
              onClick={() => onChange({ tile: option.value })}
              className={cn(
                "flex-1 rounded-[6px] px-2 py-1.5 text-[12.5px] font-medium",
                "transition-colors duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                node.tile === option.value
                  ? "bg-ed-surface text-ed-text shadow-[var(--ed-shadow-md)]"
                  : "text-ed-text-2 hover:text-ed-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="space-y-2 rounded-[12px] border border-ed-border p-3">
        <MonoText className="block text-[12px] text-ed-text">
          {node.iconKey ? `iconKey: "${node.iconKey}"` : `emoji: ${node.emoji ?? ""}`}
        </MonoText>

        <label htmlFor="node-mark" className="sr-only">
          Mark
        </label>
        <EditorSelect
          id="node-mark"
          className="h-8"
          value={node.iconKey ?? ""}
          onChange={(event) => handleMarkChange(event.target.value)}
        >
          <option value="">Emoji</option>
          {DIAGRAM_ICON_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </EditorSelect>

        {node.iconKey ? null : (
          <>
            <label htmlFor="node-emoji" className="sr-only">
              Emoji
            </label>
            <EditorInput
              id="node-emoji"
              className="h-8"
              placeholder="Emoji"
              value={node.emoji ?? ""}
              onChange={(event) => onChange({ emoji: event.target.value })}
            />
          </>
        )}

        <p className="text-[11.5px] text-ed-text-3">
          {isDark
            ? "Dark tiles draw every mark in white — the shape still names the technology."
            : "A brand mark keeps its own colour unless it would vanish on white."}
        </p>
      </div>
    </section>
  );
}
