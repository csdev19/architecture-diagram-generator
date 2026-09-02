import { Input, Label } from "@diagram-tool/web-ui";
import { DIAGRAM_ICON_KEYS, TILE_VARIANTS } from "@diagram-tool/domain/constants";
import type { DiagramNode } from "@diagram-tool/domain/schemas";
import type { NodePatch } from "@/components/editor/use-diagram-editing";

/**
 * The panel for the selected tile.
 *
 * Every field writes straight through `updateNodeFields` into the editor's
 * text — there is no local draft state, so the panel cannot drift from the JSON
 * and typing here is indistinguishable from typing in the textarea. Edits that
 * break validation are written anyway and reported in the usual error list.
 *
 * The enum fields are native `<select>`s rather than the design system's
 * portal-based one: this is a dense panel of small controls, and a native
 * select keeps keyboard behaviour, label association and screen-reader
 * semantics for free.
 */

interface NodeInspectorProps {
  node: DiagramNode;
  onChange: (patch: NodePatch) => void;
  onClose: () => void;
}

/** Shown when a node swaps from an icon to an emoji and has none of its own. */
const FALLBACK_EMOJI = "📦";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function NodeInspector({ node, onChange, onClose }: NodeInspectorProps) {
  const markValue = node.iconKey ?? "";

  const handleMarkChange = (value: string) => {
    if (value === "") {
      // Back to an emoji. Seeding one keeps the config valid rather than
      // dropping the author into an error they did not ask for.
      onChange({ iconKey: undefined, emoji: node.emoji ?? FALLBACK_EMOJI });
      return;
    }
    onChange({ iconKey: value as DiagramNode["iconKey"], emoji: undefined });
  };

  return (
    <section aria-label={`Node ${node.id}`} className="rounded-lg border p-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Selected node <code className="font-mono text-xs">{node.id}</code>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Deselect
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="node-name" className="text-xs">
            Name
          </Label>
          <Input
            id="node-name"
            value={node.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="node-sub" className="text-xs">
            Sublabel
          </Label>
          <Input
            id="node-sub"
            value={node.sub}
            onChange={(event) => onChange({ sub: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="node-mark" className="text-xs">
            Mark
          </Label>
          <select
            id="node-mark"
            className={selectClass}
            value={markValue}
            onChange={(event) => handleMarkChange(event.target.value)}
          >
            <option value="">Emoji</option>
            {DIAGRAM_ICON_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {node.iconKey ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="node-emoji" className="text-xs">
              Emoji
            </Label>
            <Input
              id="node-emoji"
              value={node.emoji ?? ""}
              onChange={(event) => onChange({ emoji: event.target.value })}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="node-tile" className="text-xs">
            Tile
          </Label>
          <select
            id="node-tile"
            className={selectClass}
            value={node.tile}
            onChange={(event) => onChange({ tile: event.target.value as DiagramNode["tile"] })}
          >
            {Object.values(TILE_VARIANTS).map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
