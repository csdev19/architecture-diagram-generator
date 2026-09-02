import { Button, Input, Label } from "@diagram-tool/web-ui";
import { ANCHOR_SIDES, EDGE_STYLES } from "@diagram-tool/domain/constants";
import type { DiagramEdge } from "@diagram-tool/domain/schemas";
import type { EdgePatch } from "@/components/editor/use-diagram-editing";

/**
 * Adding, editing and removing edges.
 *
 * Edges have no id, so everything here addresses them by position — which is
 * also why removal renumbers the rows underneath it. That is the config's own
 * model rather than a shortcut: an edge is a relation between two node ids, not
 * an entity.
 *
 * Adding is a two-click gesture on the canvas rather than a pair of dropdowns:
 * picking tiles is how you think about a diagram, and it lets the anchor sides
 * be inferred from where the nodes actually sit.
 */

interface EdgeToolsProps {
  edges: DiagramEdge[];
  /** The source tile already picked, while the two-click gesture is armed. */
  pendingFrom: string | null;
  armed: boolean;
  onArm: () => void;
  onCancel: () => void;
  onUpdate: (index: number, patch: EdgePatch) => void;
  onRemove: (index: number) => void;
}

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function EdgeTools({
  edges,
  pendingFrom,
  armed,
  onArm,
  onCancel,
  onUpdate,
  onRemove,
}: EdgeToolsProps) {
  return (
    <section aria-label="Edges" className="rounded-lg border p-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Edges</h2>
        {armed ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onArm}>
            Add edge
          </Button>
        )}
      </header>

      {armed ? (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          {pendingFrom
            ? `From ${pendingFrom} — now click the target tile.`
            : "Click the source tile on the preview."}
        </p>
      ) : null}

      {edges.length === 0 ? (
        <p className="text-xs text-muted-foreground">No edges yet.</p>
      ) : (
        <ul className="space-y-2">
          {edges.map((edge, index) => (
            // Edges are positional and two of them may be identical in every
            // field, so the index genuinely is the identity here.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="flex flex-wrap items-end gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {edge.from} → {edge.to}
              </span>

              <div className="space-y-1">
                <Label htmlFor={`edge-${index}-label`} className="text-xs">
                  Label {index + 1}
                </Label>
                <Input
                  id={`edge-${index}-label`}
                  value={edge.label ?? ""}
                  className="h-8 w-28 text-xs"
                  onChange={(event) => onUpdate(index, { label: event.target.value || undefined })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`edge-${index}-style`} className="text-xs">
                  Style {index + 1}
                </Label>
                <select
                  id={`edge-${index}-style`}
                  className={selectClass}
                  value={edge.style}
                  onChange={(event) =>
                    onUpdate(index, { style: event.target.value as DiagramEdge["style"] })
                  }
                >
                  {Object.values(EDGE_STYLES).map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`edge-${index}-out`} className="text-xs">
                  Out {index + 1}
                </Label>
                <select
                  id={`edge-${index}-out`}
                  className={selectClass}
                  value={edge.out}
                  onChange={(event) =>
                    onUpdate(index, { out: event.target.value as DiagramEdge["out"] })
                  }
                >
                  {Object.values(ANCHOR_SIDES).map((side) => (
                    <option key={side} value={side}>
                      {side}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`edge-${index}-inn`} className="text-xs">
                  In {index + 1}
                </Label>
                <select
                  id={`edge-${index}-inn`}
                  className={selectClass}
                  value={edge.inn}
                  onChange={(event) =>
                    onUpdate(index, { inn: event.target.value as DiagramEdge["inn"] })
                  }
                >
                  {Object.values(ANCHOR_SIDES).map((side) => (
                    <option key={side} value={side}>
                      {side}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                size="sm"
                variant="outline"
                aria-label={`Remove edge ${edge.from} to ${edge.to}`}
                onClick={() => onRemove(index)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
