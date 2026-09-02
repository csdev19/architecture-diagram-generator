import { X } from "lucide-react";
import { ANCHOR_SIDES, DIAGRAM_LIMITS, EDGE_STYLES } from "@diagram-tool/domain/constants";
import type { DiagramEdge } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import type { EdgePatch } from "@/components/editor/use-diagram-editing";

/**
 * The edges tab.
 *
 * Edges have no id, so everything here addresses them by position — which is
 * the config's own model rather than a shortcut: an edge is a relation between
 * two node ids, not an entity. Removing one therefore renumbers the rows below
 * it.
 *
 * Adding is a two-click gesture with the arrow tool rather than a pair of
 * dropdowns: picking tiles is how you think about a diagram, and it lets the
 * anchor sides be inferred from where the nodes actually sit. They stay
 * editable here for the routes the inference gets wrong.
 */

interface EdgeToolsProps {
  edges: DiagramEdge[];
  onUpdate: (index: number, patch: EdgePatch) => void;
  onRemove: (index: number) => void;
}

const rowControl = cn(
  "h-[30px] rounded-[6px] border border-ed-border bg-ed-field px-1.5",
  "font-mono text-[11.5px] text-ed-text transition-colors duration-[140ms]",
  "outline-none focus-visible:border-ed-accent focus-visible:shadow-[var(--ed-focus-ring)]",
);

export function EdgeTools({ edges, onUpdate, onRemove }: EdgeToolsProps) {
  if (edges.length === 0) {
    return (
      <p className="text-[13px] text-ed-text-2">
        No edges yet. Pick the arrow tool, click a source tile, then the target.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul>
        {edges.map((edge, index) => {
          const dashed = edge.style === EDGE_STYLES.DASHED;

          return (
            // Edges are positional and two of them may be identical in every
            // field, so the index genuinely is the identity here.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="space-y-1.5 border-b border-ed-border py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ed-text">
                  {edge.from} → {edge.to}
                </span>

                <button
                  type="button"
                  aria-label={`Edge ${index + 1} style`}
                  onClick={() =>
                    onUpdate(index, {
                      style: dashed ? EDGE_STYLES.SOLID : EDGE_STYLES.DASHED,
                    })
                  }
                  className={cn(
                    "h-[30px] w-16 rounded-[6px] border border-ed-border text-[11.5px]",
                    "transition-colors duration-[140ms] outline-none",
                    "hover:bg-ed-surface-hover focus-visible:shadow-[var(--ed-focus-ring)]",
                    dashed ? "text-ed-text-2" : "text-ed-text",
                  )}
                >
                  {edge.style}
                </button>

                <button
                  type="button"
                  aria-label={`Remove edge ${edge.from} to ${edge.to}`}
                  onClick={() => onRemove(index)}
                  className={cn(
                    "flex size-[30px] shrink-0 items-center justify-center rounded-[6px]",
                    "text-ed-text-3 transition-colors duration-[140ms] outline-none",
                    "hover:bg-ed-danger-quiet hover:text-ed-danger",
                    "focus-visible:shadow-[var(--ed-focus-ring)]",
                  )}
                >
                  <X className="size-[15px]" strokeWidth={1.75} aria-hidden />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  aria-label={`Label ${index + 1}`}
                  placeholder="label"
                  value={edge.label ?? ""}
                  maxLength={DIAGRAM_LIMITS.TEXT_MAX}
                  onChange={(event) =>
                    onUpdate(index, {
                      label: event.target.value.slice(0, DIAGRAM_LIMITS.TEXT_MAX) || undefined,
                    })
                  }
                  className={cn(rowControl, "min-w-0 flex-1 placeholder:text-ed-text-3")}
                />

                <select
                  aria-label={`Out ${index + 1}`}
                  value={edge.out}
                  onChange={(event) =>
                    onUpdate(index, { out: event.target.value as DiagramEdge["out"] })
                  }
                  className={rowControl}
                >
                  {Object.values(ANCHOR_SIDES).map((side) => (
                    <option key={side} value={side}>
                      out {side}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={`In ${index + 1}`}
                  value={edge.inn}
                  onChange={(event) =>
                    onUpdate(index, { inn: event.target.value as DiagramEdge["inn"] })
                  }
                  className={rowControl}
                >
                  {Object.values(ANCHOR_SIDES).map((side) => (
                    <option key={side} value={side}>
                      in {side}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[12.5px] text-ed-text-3">
        Draw a new edge with the arrow tool: click the source tile, then the target.
      </p>
    </div>
  );
}
