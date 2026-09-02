import { useMemo, useState } from "react";
import { EXAMPLE_DIAGRAM_CONFIG, validateDiagramConfig } from "@diagram-tool/domain/schemas";
import type { DiagramConfig } from "@diagram-tool/domain/schemas";
import { renderSVG } from "@diagram-tool/domain/render";
import { DiagramPreview } from "@/components/editor/diagram-preview";
import { JsonInput } from "@/components/editor/json-input";
import { useDiagramEditing } from "@/components/editor/use-diagram-editing";

/**
 * The editor, as a component rather than a route body.
 *
 * Keeping it out of `routes/editor.tsx` means its tests can live beside it
 * without the file-based router mistaking a `__tests__` directory for a route,
 * and it keeps the route file to what a route file should be: wiring.
 */

interface EditorState {
  svg: string | null;
  title: string;
  errors: string[];
  /** `null` whenever the text does not parse or does not validate. */
  config: DiagramConfig | null;
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
    return { svg: null, title: "diagram", errors: [`Invalid JSON — ${detail}`], config: null };
  }

  const result = validateDiagramConfig(parsed);
  if (!result.ok) {
    return { svg: null, title: "diagram", errors: result.errors, config: null };
  }

  return {
    svg: renderSVG(result.config),
    title: result.config.title,
    errors: [],
    config: result.config,
  };
};

export function EditorPage() {
  const [text, setText] = useState(() => JSON.stringify(EXAMPLE_DIAGRAM_CONFIG, null, 2));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { svg, title, errors, config } = useMemo(() => buildState(text), [text]);
  const edit = useDiagramEditing(setText);

  // A node that has been renamed away or deleted must not stay selected.
  const selectedNode = config?.nodes.find((node) => node.id === selectedNodeId) ?? null;

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
        <DiagramPreview
          svg={svg}
          title={title}
          config={config}
          onNodeMove={edit.moveNode}
          onNodeRestore={edit.setNodePosition}
          selectedNodeId={selectedNode?.id ?? null}
          onSelectNode={setSelectedNodeId}
        />
      </div>
    </div>
  );
}
