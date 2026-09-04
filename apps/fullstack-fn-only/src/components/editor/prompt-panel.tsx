import { useState } from "react";
import { DIAGRAM_SKETCH_PROMPT } from "@diagram-tool/domain/render";
import { EditorButton, MicroLabel } from "@/components/editor/editor-chrome";

/**
 * The prompt, and the round trip it belongs to.
 *
 * This panel is the whole AI feature until a server exists: the editor cannot
 * call a model, but a person already has one open in another tab. Handing them
 * the exact contract the validator enforces turns "draw me this" into a
 * document this editor can open — with no API key, no upload and no backend.
 *
 * It shows the steps rather than only offering a button. A menu item that
 * silently copies eight kilobytes teaches nobody what to do with them, and the
 * half of the loop people miss is the return leg: the JSON goes back into the
 * JSON tab.
 *
 * The text is read-only and comes straight from the domain. Editing it here
 * would let a prompt drift from the schema that judges its output, which is the
 * exact failure the derived guidelines exist to prevent.
 */

const STEPS = [
  "Copy the prompt below.",
  "Paste it into Claude, ChatGPT or any model that reads images, and attach a picture of your sketch — a photo of a whiteboard, a drawing on paper, a screenshot of a diagram.",
  "Paste the JSON it returns into the JSON tab. The diagram draws itself.",
];

export function PromptPanel() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(DIAGRAM_SKETCH_PROMPT);
      setCopied(true);
    } catch {
      // A denied clipboard is not worth an error state: the text is selectable.
    }
  };

  return (
    <section aria-label="Prompt" className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ed-text-2">
        This editor does not call a model — you do. The prompt below is the same contract this
        document is validated against, so what a model returns comes back already valid.
      </p>

      <ol className="space-y-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ed-text-2">
            <span
              aria-hidden
              className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border border-ed-border font-mono text-[10.5px] text-ed-text-3"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 pt-1">
        <MicroLabel>The prompt</MicroLabel>
        <span className="h-px flex-1 bg-ed-border" />
        <span className="shrink-0 font-mono text-[11px] text-ed-text-3">
          {DIAGRAM_SKETCH_PROMPT.length.toLocaleString()} chars
        </span>
      </div>

      {/*
        Capped rather than allowed to run: the steps above are the instructions,
        and the prompt itself is something to copy, not to read in a 420px column.
      */}
      <pre
        aria-label="Sketch prompt"
        className="max-h-[280px] overflow-auto rounded-[10px] border border-ed-border bg-ed-field p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ed-text-2"
      >
        {DIAGRAM_SKETCH_PROMPT}
      </pre>

      <div className="flex items-center gap-2">
        <EditorButton onClick={() => void handleCopy()}>
          {copied ? "Copied" : "Copy prompt"}
        </EditorButton>
      </div>
    </section>
  );
}
