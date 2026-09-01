import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EXAMPLE_DIAGRAM_CONFIG, validateDiagramConfig } from "@diagram-tool/domain/schemas";
import { renderSVG } from "@diagram-tool/domain/render";
import { DiagramPreview } from "@/components/editor/diagram-preview";
import { JsonInput } from "@/components/editor/json-input";

export const Route = createFileRoute("/editor")({
  component: EditorPage,
});

interface EditorState {
  svg: string | null;
  title: string;
  errors: string[];
}

/**
 * Parses, validates and renders in one pass.
 *
 * Everything on the page is derived from the textarea's text, so the preview
 * can never disagree with what is written. Invalid JSON and an invalid config
 * are reported the same way — both are just "problems to fix".
 */
const buildState = (text: string): EditorState => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unparseable";
    return { svg: null, title: "diagram", errors: [`Invalid JSON — ${detail}`] };
  }

  const result = validateDiagramConfig(parsed);
  if (!result.ok) return { svg: null, title: "diagram", errors: result.errors };

  return { svg: renderSVG(result.config), title: result.config.title, errors: [] };
};

function EditorPage() {
  const [text, setText] = useState(() => JSON.stringify(EXAMPLE_DIAGRAM_CONFIG, null, 2));
  const { svg, title, errors } = useMemo(() => buildState(text), [text]);

  return (
    <div className="container mx-auto flex min-h-screen flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Diagram editor</h1>
        <p className="text-sm text-muted-foreground">
          Paste a <code className="font-mono">DiagramConfig</code> on the left. The preview and the
          PNG come from the same renderer, so what you see is what you export.
        </p>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-2">
        <JsonInput value={text} onChange={setText} errors={errors} />
        <DiagramPreview svg={svg} title={title} />
      </div>
    </div>
  );
}
