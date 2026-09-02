import { useEffect, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { EditorButton } from "@/components/editor/editor-chrome";

/**
 * The JSON tab: the config itself, and everything wrong with it.
 *
 * The text is the editor's only state. There is no parsed config held beside
 * it, so this textarea is not a view of the diagram — it *is* the diagram, and
 * every drag on the stage arrives here as a rewrite.
 *
 * Errors are listed all at once, one per line, naming the offending value:
 * that is how the schema reports them and how they are fastest to fix. Invalid
 * text is never auto-corrected and never discarded.
 */

interface JsonPanelProps {
  value: string;
  onChange: (value: string) => void;
  errors: string[];
  /** The last text that validated. Revert goes back to it. */
  lastValidText: string | null;
}

const HOW_LONG_COPIED_STICKS = 1500;

export function JsonPanel({ value, onChange, errors, lastValidText }: JsonPanelProps) {
  const [copied, setCopied] = useState(false);
  const errorListId = "diagram-config-errors";
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), HOW_LONG_COPIED_STICKS);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * Reprints the config at two spaces. A no-op on text with a syntax error:
   * formatting is a convenience, and quietly rewriting text the author cannot
   * yet parse is the one thing it must not do.
   */
  const handleFormat = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
    } catch {
      // The parse error is already on screen; nothing to add.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
    } catch {
      // A denied clipboard is not worth an error state: the text is selectable.
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ed-text-2">
        The config is the diagram. This text is the only state — every drag rewrites it, and every
        edit here redraws the sheet.
      </p>

      <label htmlFor="diagram-config" className="sr-only">
        Diagram config (JSON)
      </label>
      <textarea
        id="diagram-config"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorListId : undefined}
        className={[
          "min-h-[220px] flex-1 resize-none rounded-[8px] border border-ed-border bg-ed-field p-3",
          "font-mono text-[11.5px] leading-[1.65] text-ed-text",
          "outline-none focus-visible:border-ed-accent focus-visible:shadow-[var(--ed-focus-ring)]",
        ].join(" ")}
      />

      {hasErrors ? (
        <p className="flex items-start gap-2 text-[13px] text-ed-danger">
          <TriangleAlert className="mt-px size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          {errors.length} {errors.length === 1 ? "problem" : "problems"} — the canvas shows the last
          valid config.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ed-positive">
          <Check className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          Valid — the canvas is up to date.
        </p>
      )}

      {hasErrors ? (
        <div
          id={errorListId}
          role="alert"
          className="max-h-[164px] overflow-y-auto rounded-[8px] bg-ed-danger-quiet p-3"
        >
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error} className="font-mono text-[11px] leading-relaxed text-ed-text-2">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <EditorButton onClick={handleFormat}>Format</EditorButton>
        <EditorButton onClick={() => void handleCopy()}>{copied ? "Copied" : "Copy"}</EditorButton>
        <EditorButton
          variant="ghost"
          className="ml-auto"
          disabled={lastValidText === null || lastValidText === value}
          onClick={() => lastValidText && onChange(lastValidText)}
        >
          Revert
        </EditorButton>
      </div>
    </div>
  );
}
