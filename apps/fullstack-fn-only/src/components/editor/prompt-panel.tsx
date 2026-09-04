import { useEffect, useState } from "react";
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

/** Long enough to read the confirmation, short enough to offer a second copy. */
const HOW_LONG_COPIED_STICKS = 1500;

const STEPS = [
  "Copy the prompt below.",
  "Paste it into Claude, ChatGPT or any model that reads images, and attach a picture of your sketch — a photo of a whiteboard, a drawing on paper, a screenshot of a diagram.",
  "Paste the JSON it returns into the JSON tab. The diagram draws itself.",
];

export function PromptPanel() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), HOW_LONG_COPIED_STICKS);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * The clipboard is checked rather than optional-chained.
   *
   * `navigator.clipboard?.writeText(...)` yields `undefined` where the API does
   * not exist — a plain-http origin, an old browser — and awaiting `undefined`
   * resolves, so the button reported success and the author pasted whatever
   * they had copied last. Handing over the prompt is this panel's only job, so
   * a copy that did not happen has to say so.
   */
  const handleCopy = async () => {
    setFailed(false);
    try {
      if (!navigator.clipboard) throw new Error("This browser exposes no clipboard");
      await navigator.clipboard.writeText(DIAGRAM_SKETCH_PROMPT);
      setCopied(true);
    } catch {
      setFailed(true);
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
      </div>

      {/*
        Capped rather than allowed to run: the steps above are the instructions,
        and the prompt itself is something to copy, not to read in a 420px column.
      */}
      {/*
        Focusable, and a region rather than a bare `pre`: the box scrolls about
        nine thousand characters behind twenty-five visible lines, and a `pre`
        maps to `role="generic"`, where a label is neither allowed nor announced.
      */}
      <pre
        tabIndex={0}
        role="region"
        aria-label="Sketch prompt"
        className="max-h-[280px] overflow-auto focus-visible:shadow-[var(--ed-focus-ring)] rounded-[10px] border border-ed-border bg-ed-field p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ed-text-2"
      >
        {DIAGRAM_SKETCH_PROMPT}
      </pre>

      <div className="flex items-center gap-2">
        <EditorButton onClick={() => void handleCopy()}>
          {copied ? "Copied" : "Copy prompt"}
        </EditorButton>
        {failed ? (
          <span role="alert" className="text-[11.5px] text-ed-text-2">
            Could not reach the clipboard — select the text above and copy it.
          </span>
        ) : null}
      </div>
    </section>
  );
}
