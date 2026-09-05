import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@diagram-tool/web-ui";
import {
  DIAGRAM_REPOSITORY_PROMPTS,
  DIAGRAM_SKETCH_PROMPT,
  REPOSITORY_PROMPT_ORDER,
  REPOSITORY_PROMPT_SHAPES,
} from "@diagram-tool/domain/render";
import type { RepositoryPromptShape } from "@diagram-tool/domain/render";
import type { ObjectProperties } from "@diagram-tool/domain/types";
import { EditorButton, MicroLabel } from "@/components/editor/editor-chrome";
import { TabBody, tabForKey } from "@/components/editor/side-panel";

/**
 * The prompts, and the round trips they belong to.
 *
 * This panel is the whole AI feature until a server exists: the editor cannot
 * call a model, but a person already has one open in another tab — or a coding
 * agent open in their repository. Handing them the exact contract the validator
 * enforces turns "draw me this" into a document this editor can open, with no
 * API key, no upload and no backend.
 *
 * Two sources, behind two tabs. A repository is the input most people have at
 * hand, so it comes first; the whiteboard photo is the exception. The project
 * prompt then comes in three shapes, because "the architecture of this repo" is
 * three different drawings — the request path, the whole stack, the stack by
 * layer — and the selector explains each one so nobody has to try all three.
 *
 * It shows the steps rather than only offering a button. A menu item that
 * silently copies eight kilobytes teaches nobody what to do with them, and the
 * half of the loop people miss is the return leg: the JSON goes back into the
 * JSON tab.
 *
 * Every text is read-only and comes straight from the domain. Editing it here
 * would let a prompt drift from the schema that judges its output, which is the
 * exact failure the derived guidelines exist to prevent.
 */

/** Long enough to read the confirmation, short enough to offer a second copy. */
const HOW_LONG_COPIED_STICKS = 1500;

const PROMPT_SOURCES = {
  PROJECT: "project",
  IMAGE: "image",
} as const;

type PromptSource = ObjectProperties<typeof PROMPT_SOURCES>;

const SOURCE_ORDER: PromptSource[] = [PROMPT_SOURCES.PROJECT, PROMPT_SOURCES.IMAGE];

const SOURCE_LABELS: Record<PromptSource, string> = {
  [PROMPT_SOURCES.PROJECT]: "Project",
  [PROMPT_SOURCES.IMAGE]: "Image",
};

const PROJECT_STEPS = [
  "Pick the shape below and copy the prompt.",
  "Open your repository in Claude Code, Codex, Cursor or any coding agent, and paste it. The agent reads manifests, deploy config and entrypoints — not your business logic, and never your secrets.",
  "Paste the JSON it returns into the JSON tab. The diagram draws itself.",
];

const IMAGE_STEPS = [
  "Copy the prompt below.",
  "Paste it into Claude, ChatGPT or any model that reads images, and attach a picture of your sketch — a photo of a whiteboard, a drawing on paper, a screenshot of a diagram.",
  "Paste the JSON it returns into the JSON tab. The diagram draws itself.",
];

export function PromptPanel() {
  const [source, setSource] = useState<PromptSource>(PROMPT_SOURCES.PROJECT);
  const [shape, setShape] = useState<RepositoryPromptShape>(REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW);

  const handleSourceKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabForKey(SOURCE_ORDER, source, event.key);
    if (next === undefined) return;
    event.preventDefault();
    setSource(next);
  };

  return (
    <section aria-label="Prompt" className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        role="tablist"
        aria-label="Prompt source"
        className="flex gap-1 rounded-[10px] border border-ed-border bg-ed-field p-1"
      >
        {SOURCE_ORDER.map((candidate) => {
          const active = candidate === source;
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              id={`prompt-source-tab-${candidate}`}
              aria-selected={active}
              aria-controls={`prompt-source-body-${candidate}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSource(candidate)}
              onKeyDown={handleSourceKey}
              className={cn(
                "flex-1 rounded-[7px] border border-transparent px-2 py-1.5 text-[12.5px] font-medium",
                "transition-colors duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                active
                  ? "border border-ed-border bg-ed-surface text-ed-text"
                  : "text-ed-text-3 hover:text-ed-text-2",
              )}
            >
              {SOURCE_LABELS[candidate]}
            </button>
          );
        })}
      </div>

      {/*
        Both recipes stay mounted, hidden rather than unmounted, so the shape a
        person picked and the scroll position of the prompt box survive a look
        at the other tab.
      */}
      <TabBody
        active={source === PROMPT_SOURCES.PROJECT}
        role="tabpanel"
        id={`prompt-source-body-${PROMPT_SOURCES.PROJECT}`}
        aria-labelledby={`prompt-source-tab-${PROMPT_SOURCES.PROJECT}`}
        className="min-h-0 flex-col gap-3"
      >
        <PromptRecipe
          intro="This editor does not call a model — you do. Everything happens on your machine: a coding agent reads your repository where it sits, and the only thing that leaves is the JSON you paste back here."
          steps={PROJECT_STEPS}
          promptLabel="Repository prompt"
          prompt={DIAGRAM_REPOSITORY_PROMPTS[shape].prompt}
        >
          <ShapeSelector shape={shape} onShapeChange={setShape} />
        </PromptRecipe>
      </TabBody>

      <TabBody
        active={source === PROMPT_SOURCES.IMAGE}
        role="tabpanel"
        id={`prompt-source-body-${PROMPT_SOURCES.IMAGE}`}
        aria-labelledby={`prompt-source-tab-${PROMPT_SOURCES.IMAGE}`}
        className="min-h-0 flex-col gap-3"
      >
        <PromptRecipe
          intro="This editor does not call a model — you do. The prompt below is the same contract this document is validated against, so what a model returns comes back already valid."
          steps={IMAGE_STEPS}
          promptLabel="Sketch prompt"
          prompt={DIAGRAM_SKETCH_PROMPT}
        />
      </TabBody>
    </section>
  );
}

/**
 * The three shapes a repository can be drawn as, as one choice.
 *
 * Radios rather than tabs: picking one swaps the text of the same prompt box
 * below, it does not open a different panel. The line under the group is the
 * chosen shape's own explanation, so the choice can be made by reading rather
 * than by copying all three and comparing.
 */
function ShapeSelector({
  shape,
  onShapeChange,
}: {
  shape: RepositoryPromptShape;
  onShapeChange: (shape: RepositoryPromptShape) => void;
}) {
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabForKey(REPOSITORY_PROMPT_ORDER, shape, event.key);
    if (next === undefined) return;
    event.preventDefault();
    onShapeChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 pt-1">
        <MicroLabel>Shape</MicroLabel>
        <span className="h-px flex-1 bg-ed-border" />
      </div>

      <div
        role="radiogroup"
        aria-label="Diagram shape"
        aria-describedby="prompt-shape-blurb"
        className="flex gap-1.5"
      >
        {REPOSITORY_PROMPT_ORDER.map((candidate) => {
          const active = candidate === shape;
          return (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onShapeChange(candidate)}
              onKeyDown={handleKey}
              className={cn(
                "flex-1 rounded-[8px] border px-2 py-1.5 text-[12.5px] font-medium",
                "transition-colors duration-[140ms] outline-none",
                "focus-visible:shadow-[var(--ed-focus-ring)]",
                active
                  ? "border-ed-border-strong bg-ed-surface text-ed-text"
                  : "border-ed-border text-ed-text-3 hover:bg-ed-surface-hover hover:text-ed-text-2",
              )}
            >
              {DIAGRAM_REPOSITORY_PROMPTS[candidate].label}
            </button>
          );
        })}
      </div>

      <p id="prompt-shape-blurb" className="text-[12px] leading-relaxed text-ed-text-2">
        {DIAGRAM_REPOSITORY_PROMPTS[shape].blurb}
      </p>
    </div>
  );
}

/**
 * One prompt with its instructions: what this is, the steps, the text, and a
 * button that puts it on the clipboard. Anything rendered between the steps and
 * the text — the shape selector — comes in as children.
 */
function PromptRecipe({
  intro,
  steps,
  promptLabel,
  prompt,
  children,
}: {
  intro: string;
  steps: string[];
  promptLabel: string;
  prompt: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), HOW_LONG_COPIED_STICKS);
    return () => clearTimeout(timer);
  }, [copied]);

  // A different prompt is not the one that was copied, so the button must not
  // keep saying it was.
  useEffect(() => {
    setCopied(false);
  }, [prompt]);

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
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ed-text-2">{intro}</p>

      <ol className="space-y-2">
        {steps.map((step, index) => (
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

      {children}

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
        aria-label={promptLabel}
        className="max-h-[280px] overflow-auto focus-visible:shadow-[var(--ed-focus-ring)] rounded-[10px] border border-ed-border bg-ed-field p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ed-text-2"
      >
        {prompt}
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
    </div>
  );
}
