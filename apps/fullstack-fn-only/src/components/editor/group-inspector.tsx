import { Ungroup, X } from "lucide-react";
import type { DiagramContent, DiagramGroup } from "@diagram-tool/domain/schemas";
import { cn } from "@diagram-tool/web-ui";
import { MicroLabel, MonoText } from "@/components/editor/editor-chrome";

/**
 * The panel for the selected group.
 *
 * A group has no fields worth editing — no tone, no label, no geometry. What it
 * has is members, so that is what the panel is: the list, and the two ways to
 * change it. Anything more would be inventing properties for a relation that
 * deliberately has none.
 */

interface GroupInspectorProps {
  group: DiagramGroup;
  content: DiagramContent;
  onUngroup: () => void;
  onRemoveMember: (id: string) => void;
}

/** What an id is, said the way the diagram says it. */
const describe = (content: DiagramContent, id: string): { name: string; kind: string } => {
  const node = content.nodes.find((candidate) => candidate.id === id);
  if (node) return { name: node.name, kind: "tile" };

  const boundary = content.boundaries.find((candidate) => candidate.id === id);
  if (boundary) return { name: boundary.label, kind: "boundary" };

  const group = content.groups.find((candidate) => candidate.id === id);
  if (group) return { name: group.id, kind: `group of ${group.members.length}` };

  return { name: id, kind: "missing" };
};

export function GroupInspector({ group, content, onUngroup, onRemoveMember }: GroupInspectorProps) {
  return (
    <section aria-label={`Group ${group.id}`} className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <MonoText className="text-[15px] font-medium text-ed-text">{group.id}</MonoText>
        <MicroLabel>Group</MicroLabel>
      </header>

      <p className="text-[12.5px] leading-relaxed text-ed-text-2">
        A group keeps these together: they move as one, and auto-layout places them side by side. It
        is never drawn — the box around them is a boundary, which is a member like any other.
      </p>

      <ul className="space-y-1">
        {group.members.map((id) => {
          const { name, kind } = describe(content, id);

          return (
            <li
              key={id}
              className="flex items-center gap-2 rounded-[8px] border border-ed-border px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ed-text">{name}</span>
              <MicroLabel>{kind}</MicroLabel>
              <button
                type="button"
                aria-label={`Remove ${name} from ${group.id}`}
                onClick={() => onRemoveMember(id)}
                className={cn(
                  "flex size-[26px] shrink-0 items-center justify-center rounded-[6px]",
                  "text-ed-text-3 transition-colors duration-[140ms] outline-none",
                  "hover:bg-ed-danger-quiet hover:text-ed-danger",
                  "focus-visible:shadow-[var(--ed-focus-ring)]",
                )}
              >
                <X className="size-[14px]" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onUngroup}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[8px] border border-ed-border",
          "px-2 py-1.5 text-[12.5px] text-ed-text transition-colors duration-[140ms]",
          "outline-none hover:bg-ed-surface-hover focus-visible:shadow-[var(--ed-focus-ring)]",
        )}
      >
        <Ungroup className="size-[15px]" strokeWidth={1.75} aria-hidden />
        Ungroup
      </button>
    </section>
  );
}
