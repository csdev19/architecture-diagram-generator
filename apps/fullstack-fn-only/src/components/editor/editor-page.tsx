import { useMemo, useState } from "react";
import { EXAMPLE_DIAGRAM_CONFIG, validateDiagramConfig } from "@diagram-tool/domain/schemas";
import type { DiagramConfig } from "@diagram-tool/domain/schemas";
import { renderSVG } from "@diagram-tool/domain/render";
import { ConfigFileControls } from "@/components/editor/config-file-controls";
import { DiagramPreview } from "@/components/editor/diagram-preview";
import { EdgeTools } from "@/components/editor/edge-tools";
import { JsonInput } from "@/components/editor/json-input";
import { NodeInspector } from "@/components/editor/node-inspector";
import { facingSides } from "@/components/editor/pointer-geometry";
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
  const [edgeArmed, setEdgeArmed] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  const { svg, title, errors, config } = useMemo(() => buildState(text), [text]);
  const edit = useDiagramEditing(setText);

  // A node that was renamed away or deleted must not stay selected: the
  // inspector would be editing something the config no longer contains.
  const selectedNode = config?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const disarm = () => {
    setEdgeArmed(false);
    setPendingFrom(null);
  };

  /**
   * A tile press means "select this" normally, and "pick an endpoint" while the
   * add-edge gesture is armed. Two clicks complete the edge; the anchor sides
   * come from where the two nodes actually sit, and stay editable afterwards.
   */
  const handleSelectNode = (id: string | null) => {
    if (!edgeArmed) {
      setSelectedNodeId(id);
      return;
    }

    // A press on empty canvas is not an endpoint; it leaves the gesture armed.
    if (!id || !config) return;

    if (!pendingFrom) {
      setPendingFrom(id);
      return;
    }

    // The schema rejects an edge from a node to itself, so a second press on
    // the same tile is treated as a correction rather than a commit.
    if (id === pendingFrom) return;

    const source = config.nodes.find((node) => node.id === pendingFrom);
    const target = config.nodes.find((node) => node.id === id);
    if (source && target) {
      edit.addEdge({ from: source.id, to: target.id, ...facingSides(source, target) });
    }

    disarm();
  };

  return (
    <div className="container mx-auto flex min-h-screen flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Diagram editor</h1>
          <p className="text-sm text-muted-foreground">
            Edit the <code className="font-mono">DiagramConfig</code> on the left, or drag tiles on
            the preview. The text is the source of truth either way, and the PNG comes from the same
            renderer — so what you see is what you export.
          </p>
        </div>
        <ConfigFileControls
          text={text}
          title={title}
          canArrange={Boolean(config)}
          onArrange={edit.arrangeNodes}
          onLoad={(loaded) => {
            setText(loaded);
            setSelectedNodeId(null);
            disarm();
          }}
        />
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-2">
        <JsonInput value={text} onChange={setText} errors={errors} />
        <DiagramPreview
          svg={svg}
          title={title}
          config={config}
          // Dragging is off while the add-edge gesture is armed: the same press
          // cannot mean both "pick this endpoint" and "start moving this".
          onNodeMove={edgeArmed ? undefined : edit.moveNode}
          onNodeRestore={edit.setNodePosition}
          selectedNodeId={selectedNode?.id ?? null}
          onSelectNode={handleSelectNode}
        />
      </div>

      {config ? (
        <div className="grid gap-4 md:grid-cols-2">
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onChange={(patch) => edit.updateNodeFields(selectedNode.id, patch)}
              onClose={() => setSelectedNodeId(null)}
            />
          ) : (
            <p className="self-start rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Click a tile on the preview to edit it.
            </p>
          )}

          <EdgeTools
            edges={config.edges}
            armed={edgeArmed}
            pendingFrom={pendingFrom}
            onArm={() => setEdgeArmed(true)}
            onCancel={disarm}
            onUpdate={edit.updateEdgeFields}
            onRemove={edit.removeEdge}
          />
        </div>
      ) : null}
    </div>
  );
}
