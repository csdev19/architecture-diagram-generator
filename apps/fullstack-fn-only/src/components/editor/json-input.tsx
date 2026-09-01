import { Label, Textarea } from "@diagram-tool/web-ui";

interface JsonInputProps {
  value: string;
  onChange: (value: string) => void;
  errors: string[];
}

/**
 * The authoring pane: the raw `DiagramConfig` JSON, with whatever is wrong with
 * it listed underneath. Errors are shown all at once rather than one at a time,
 * because that is how the schema reports them and how they are fastest to fix.
 */
export function JsonInput({ value, onChange, errors }: JsonInputProps) {
  const errorListId = "diagram-config-errors";
  const hasErrors = errors.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Label htmlFor="diagram-config" className="text-sm font-medium">
        Diagram config (JSON)
      </Label>

      <Textarea
        id="diagram-config"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorListId : undefined}
        className="min-h-[420px] flex-1 resize-none font-mono text-xs leading-relaxed"
      />

      {hasErrors ? (
        <div
          id={errorListId}
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="mb-1.5 text-sm font-medium text-destructive">
            {errors.length} {errors.length === 1 ? "problem" : "problems"} to fix
          </p>
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error} className="font-mono text-xs leading-relaxed text-muted-foreground">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Valid — the preview is up to date.</p>
      )}
    </div>
  );
}
