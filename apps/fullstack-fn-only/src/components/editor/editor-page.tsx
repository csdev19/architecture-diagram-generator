import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EXAMPLE_DIAGRAM_DOCUMENT, validateDiagramDocument } from "@diagram-tool/domain/schemas";
import type { DiagramDocument, ResolvedDiagram } from "@diagram-tool/domain/schemas";
import { facingSides, renderSVG, resolveDiagram } from "@diagram-tool/domain/render";
import { BOUNDARY_PADDINGS, BOUNDARY_TONES, TILE_VARIANTS } from "@diagram-tool/domain/constants";
import type { BoundaryPadding } from "@diagram-tool/domain/constants";
import { downloadConfig, downloadSvg, downloadSvgAsPng } from "@/lib/export-png";
import { DiagramPanel } from "@/components/editor/diagram-panel";
import { DiagramStage } from "@/components/editor/diagram-stage";
import { EdgeTools } from "@/components/editor/edge-tools";
import { EditorHeader } from "@/components/editor/editor-header";
import { BoundaryInspector } from "@/components/editor/boundary-inspector";
import { EDITOR_TOOLS, TOOL_ORDER } from "@/components/editor/editor-tools";
import type { EditorTool } from "@/components/editor/editor-tools";
import { JsonPanel } from "@/components/editor/json-panel";
import { NodeInspector } from "@/components/editor/node-inspector";
import type { Selection } from "@/components/editor/selection";
import type { Point } from "@/components/editor/pointer-geometry";
import { SIDE_PANEL_TABS, SIDE_PANEL_WIDTH, SidePanel } from "@/components/editor/side-panel";
import type { SidePanelTab } from "@/components/editor/side-panel";
import { PALETTE_TILES, findPaletteTile, uniqueNodeId } from "@/components/editor/tile-catalog";
import type { PaletteTile } from "@/components/editor/tile-catalog";
import { TILE_PALETTE_WIDTH, TilePalette } from "@/components/editor/tile-palette";
import { useDiagramEditing } from "@/components/editor/use-diagram-editing";
import { useChromeTheme } from "@/components/editor/use-chrome-theme";

/**
 * The editor, as a component rather than a route body.
 *
 * Keeping it out of `routes/editor.tsx` means its tests can live beside it
 * without the file-based router mistaking a `__tests__` directory for a route,
 * and it keeps the route file to what a route file should be: wiring.
 *
 * The canvas owns the screen — literally: the stage spans the window and every
 * other surface floats over it. Nothing is a column, because a column takes its
 * width away from the diagram permanently, whether or not anyone is reading it.
 * The palette and the JSON panel both close, and closing one hands the space
 * straight back: `insets` tells Fit what is actually covered.
 */

interface ParsedState {
  errors: string[];
  /** `null` whenever the text does not parse, or does not validate. */
  shown: ShownState | null;
}

/**
 * What the editor is looking at: one text, and the two views of it.
 *
 * The document is what the author wrote — where padding and membership live.
 * The diagram is what resolution made of it — where coordinates live. Both are
 * derived from the same string on every keystroke, so neither is a second
 * source of truth; they are the same truth answering different questions.
 */
interface ShownState {
  document: DiagramDocument;
  diagram: ResolvedDiagram;
  /** The text that produced them, which is what Revert goes back to. */
  text: string;
}

/**
 * Parses and validates in one pass.
 *
 * Everything on the page is derived from the textarea's text, so the canvas can
 * never disagree with what is written. Invalid JSON and an invalid document are
 * reported the same way — both are just "problems to fix".
 *
 * Rendering is not done here: the stage draws the part of the world it is
 * looking at, and an export draws the frame the diagram implies. Same renderer,
 * two framings, neither of them worth holding on to between edits.
 */
const buildState = (text: string): ParsedState => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unparseable";
    return { errors: [`Invalid JSON — ${detail}`], shown: null };
  }

  const result = validateDiagramDocument(parsed);
  return result.ok
    ? {
        errors: [],
        shown: { document: result.document, diagram: resolveDiagram(result.document), text },
      }
    : { errors: result.errors, shown: null };
};

/** How tightly a boundary hugs what it frames, as its author wrote it. */
const paddingOf = (shown: ShownState | null, id: string): BoundaryPadding =>
  shown?.document.content.boundaries.find((boundary) => boundary.id === id)?.padding ??
  BOUNDARY_PADDINGS.NORMAL;

/** Whether a boundary belongs to a group, which decides how it is sized. */
const isGrouped = (shown: ShownState | null, id: string): boolean =>
  (shown?.document.content.groups ?? []).some((group) => group.members.includes(id));

/** A freshly placed tile's sublabel. A prompt to fill in, not a value. */
const PLACEHOLDER_SUB = "role";

/**
 * An id for an edge the user has just drawn.
 *
 * Derived from the endpoints, like the schema does, and suffixed when this pair
 * is already connected — the editor writes it down rather than leaving it
 * implicit, because it also has anchors to hang off that id.
 */
const uniqueEdgeId = (from: string, to: string, edges: ReadonlyArray<{ id: string }>): string =>
  uniqueNodeId(
    `${from}-${to}`,
    edges.map((edge) => edge.id),
  );

/** Gap between a floating panel and the edge of the window. */
const CHROME_GUTTER = 12;
/** Height the header pills, the toolbar and its hint occupy across the top. */
const CHROME_TOP_BAND = 100;
/** Height the zoom bar occupies at the bottom. */
const CHROME_BOTTOM_BAND = 64;

/** Keys the tool shortcuts must not steal from a field. */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function EditorPage() {
  const [text, setText] = useState(() => JSON.stringify(EXAMPLE_DIAGRAM_DOCUMENT, null, 2));
  const [tool, setTool] = useState<EditorTool>(EDITOR_TOOLS.SELECT);
  const [tileKey, setTileKey] = useState(() => PALETTE_TILES[0]?.key ?? "");
  const [selection, setSelection] = useState<Selection>(null);
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<SidePanelTab>(SIDE_PANEL_TABS.JSON);

  const fileRef = useRef<HTMLInputElement>(null);
  const { theme, toggle: toggleTheme } = useChromeTheme();

  const parsed = useMemo(() => buildState(text), [text]);

  /**
   * The last text that rendered, kept so a broken edit does not blank the
   * canvas mid-keystroke — half of authoring JSON is spent in states that do
   * not parse yet, and losing the picture at every one of them is the fastest
   * way to make the panel unusable.
   *
   * Written during render rather than in an effect on purpose: it is derived
   * purely from `text`, so writing it twice writes the same thing, and an
   * effect would leave the very first render with nothing to draw.
   */
  const lastGoodRef = useRef<ShownState | null>(null);
  if (parsed.shown) lastGoodRef.current = parsed.shown;
  const shown: ShownState | null = lastGoodRef.current;

  // Every gesture is bound to what is on screen: it pins the drawing before it
  // can re-flow, and knows the geometry a boundary had if its group dissolves.
  const edit = useDiagramEditing(setText, shown?.diagram ?? null);

  const selectedNode =
    selection?.kind === "node"
      ? (shown?.diagram.nodes.find((node) => node.id === selection.id) ?? null)
      : null;
  const selectedBoundary =
    selection?.kind === "boundary"
      ? (shown?.diagram.boundaries.find((boundary) => boundary.id === selection.id) ?? null)
      : null;
  const tile = findPaletteTile(tileKey);
  const tileLabel = tile?.label ?? "tile";

  const changeTool = (next: EditorTool) => {
    setTool(next);
    // A half-drawn edge belongs to the edge tool. Leaving it armed would make
    // the next click on a tile mean something the toolbar no longer says.
    if (next !== EDITOR_TOOLS.EDGE) setEdgeFrom(null);
  };

  /**
   * A press on the canvas selects what it hit and shows that thing's fields.
   *
   * Only when the selection actually changes, though: a drag re-selects the
   * thing under the pointer on every press, and switching tabs each time would
   * take away what the JSON tab exists for — watching the text rewrite itself
   * as the tile moves.
   */
  const handleSelect = (next: Selection) => {
    const changed = next?.kind !== selection?.kind || next?.id !== selection?.id;
    if (next && changed) {
      setPanelOpen(true);
      setTab(SIDE_PANEL_TABS.INSPECTOR);
    }
    setSelection(next);
  };

  /**
   * The text as it was when the current gesture began.
   *
   * Escape puts the whole of it back rather than just the position that moved:
   * a drag settles the layout of everything on screen before it touches
   * anything, and abandoning the gesture has to take that back too. Restoring
   * the text is also the only undo that cannot miss a detail — it is the same
   * single source of truth every edit went through on the way in.
   */
  const gestureTextRef = useRef<string | null>(null);

  const handleGestureStart = () => {
    gestureTextRef.current = text;
  };

  const handleGestureCancel = () => {
    const before = gestureTextRef.current;
    gestureTextRef.current = null;
    if (before !== null) setText(before);
  };

  /** Two presses complete an edge: source, then target. */
  const handlePickEdgeEnd = (id: string) => {
    if (!shown) return;

    if (!edgeFrom) {
      setEdgeFrom(id);
      return;
    }

    // The schema rejects an edge from a node to itself, so a second press on
    // the same tile is treated as a correction rather than a commit.
    if (id === edgeFrom) return;

    const source = shown.diagram.nodes.find((node) => node.id === edgeFrom);
    const target = shown.diagram.nodes.find((node) => node.id === id);
    if (source && target) {
      // The relation goes into content; the sides it leaves and arrives at are
      // a fact about where the two tiles happen to sit, so they go to layout.
      // Both are written even though resolution would derive the same pair —
      // the user drew this line between these tiles, and moving one of them
      // later should not silently re-route it.
      const edgeId = uniqueEdgeId(source.id, target.id, shown.diagram.edges);

      edit.addEdge({ id: edgeId, from: source.id, to: target.id });
      edit.setEdgeAnchors(edgeId, facingSides(source, target));
    }

    setEdgeFrom(null);
    setTool(EDITOR_TOOLS.SELECT);
    setPanelOpen(true);
    setTab(SIDE_PANEL_TABS.EDGES);
  };

  /** Puts a tile on the canvas at a world point. Nowhere is out of bounds. */
  const placeTile = (placed: PaletteTile | undefined, point: Point) => {
    if (!placed || !shown) return;

    const id = uniqueNodeId(
      placed.key,
      shown.diagram.nodes.map((node) => node.id),
    );

    edit.addNode(
      {
        id,
        name: placed.label,
        sub: PLACEHOLDER_SUB,
        ...(placed.kind === "icon" ? { iconKey: placed.iconKey } : { emoji: placed.emoji }),
      },
      point,
    );

    setSelection({ kind: "node", id });
  };

  /** The click-then-click path, which places whatever the palette has armed. */
  const handlePlaceTile = (point: Point) => placeTile(tile, point);

  /**
   * The drag path. The dropped card names its own tile, so dropping never
   * depends on what the palette happens to have selected.
   */
  const handleDropTile = (key: string, point: Point) => {
    setTileKey(key);
    placeTile(findPaletteTile(key), point);
  };

  const handleDeleteSelected = () => {
    if (!selection) return;

    if (selection.kind === "node") edit.removeNode(selection.id);
    else edit.removeBoundary(selection.id);

    setSelection(null);
  };

  /**
   * Commits a box drawn with the boundary tool.
   *
   * It lands neutral and named `BOUNDARY`, then opens in the inspector: the tone
   * is a claim about the system being drawn and the label is the author's
   * words, so neither is something a drag can guess.
   */
  const handleDrawBoundary = (box: { x: number; y: number; w: number; h: number }) => {
    if (!shown) return;

    const id = uniqueNodeId(
      "boundary",
      shown.diagram.boundaries.map((boundary) => boundary.id),
    );

    // Drawn boxes belong to no group yet, so this one carries its own
    // rectangle. Grouping what it encloses is a gesture of its own.
    edit.addBoundary(
      { id, label: "BOUNDARY", tone: BOUNDARY_TONES.NEUTRAL, padding: BOUNDARY_PADDINGS.NORMAL },
      box,
    );
    changeTool(EDITOR_TOOLS.SELECT);
    handleSelect({ kind: "boundary", id });
  };

  // `1`–`6` pick a tool, Escape backs out of whatever is armed, and Delete
  // removes the selected tile. Suppressed inside fields, and whenever a
  // modifier is held, so a browser shortcut still means what it always did.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        setEdgeFrom(null);
        setSelection(null);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selection) return;
        event.preventDefault();

        if (selection.kind === "node") edit.removeNode(selection.id);
        else edit.removeBoundary(selection.id);
        setSelection(null);
        return;
      }

      const index = Number(event.key) - 1;
      const next = TOOL_ORDER[index];
      if (next) changeTool(next);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // `changeTool` is recreated every render but closes over nothing that can
    // go stale; the pieces that can are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, edit]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setSelection(null);
    setEdgeFrom(null);
    // Cleared so re-opening the same file still fires a change event.
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleExportPng = async () => {
    if (!shown) return;
    try {
      await downloadSvgAsPng(renderSVG(shown.diagram), `${shown.diagram.title}@2x.png`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed");
    }
  };

  const darkTileCount =
    shown?.diagram.nodes.filter((node) => node.tile === TILE_VARIANTS.DARK).length ?? 0;

  // What the floating chrome is covering, so Fit frames the diagram in the part
  // of the canvas that is actually visible rather than in the whole window.
  const insets = {
    left: paletteOpen ? CHROME_GUTTER * 2 + TILE_PALETTE_WIDTH : 0,
    right: panelOpen ? CHROME_GUTTER * 2 + SIDE_PANEL_WIDTH : 0,
    top: CHROME_TOP_BAND,
    bottom: CHROME_BOTTOM_BAND,
  };

  return (
    <div
      className="diagram-editor relative h-svh overflow-hidden bg-ed-stage text-ed-text"
      data-chrome={theme}
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="Open a saved diagram file"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <EditorHeader
        title={shown?.diagram.title ?? "diagram"}
        nodeCount={shown?.diagram.nodes.length ?? 0}
        edgeCount={shown?.diagram.edges.length ?? 0}
        paletteOpen={paletteOpen}
        onTogglePalette={() => setPaletteOpen((open) => !open)}
        theme={theme}
        onToggleTheme={toggleTheme}
        canArrange={Boolean(parsed.shown)}
        onArrange={edit.arrangeNodes}
        onOpenFile={() => fileRef.current?.click()}
        onSaveJson={() => downloadConfig(text, `${shown?.diagram.title ?? "diagram"}.json`)}
        onDownloadSvg={() =>
          shown && downloadSvg(renderSVG(shown.diagram), `${shown.diagram.title}.svg`)
        }
        onExportPng={() => void handleExportPng()}
        canExport={Boolean(shown)}
        jsonOpen={panelOpen}
        onToggleJson={() => setPanelOpen((open) => !open)}
      />

      {paletteOpen ? (
        <TilePalette
          selectedKey={tileKey}
          onSelect={(key) => {
            setTileKey(key);
            // Choosing a tile is choosing what to place next, so the tool
            // follows: otherwise the next click on the sheet does nothing.
            changeTool(EDITOR_TOOLS.NODE);
          }}
        />
      ) : null}

      <DiagramStage
        diagram={shown?.diagram ?? null}
        tool={tool}
        onToolChange={changeTool}
        selection={selection}
        onSelect={handleSelect}
        edgeFrom={edgeFrom}
        onPickEdgeEnd={handlePickEdgeEnd}
        tileLabel={tileLabel}
        onPlaceTile={handlePlaceTile}
        onDropTile={handleDropTile}
        onNodeMove={edit.moveNode}
        onGestureStart={handleGestureStart}
        onGestureCancel={handleGestureCancel}
        onBoundaryMove={edit.moveBoundary}
        onDrawBoundary={handleDrawBoundary}
        onDeleteSelected={handleDeleteSelected}
        insets={insets}
      />

      <SidePanel
        open={panelOpen}
        tab={tab}
        onTabChange={setTab}
        edgeCount={shown?.diagram.edges.length ?? 0}
        json={
          <JsonPanel
            value={text}
            onChange={setText}
            errors={parsed.errors}
            lastValidText={shown?.text ?? null}
          />
        }
        inspector={
          selectedNode ? (
            <NodeInspector
              node={selectedNode}
              darkTileCount={darkTileCount}
              onChange={(patch) => edit.updateNodeFields(selectedNode.id, patch)}
            />
          ) : selectedBoundary ? (
            <BoundaryInspector
              boundary={selectedBoundary}
              padding={paddingOf(shown, selectedBoundary.id)}
              grouped={isGrouped(shown, selectedBoundary.id)}
              onChange={(patch) => edit.updateBoundaryFields(selectedBoundary.id, patch)}
              onGeometryChange={(rect) => edit.resizeBoundary(selectedBoundary.id, rect)}
            />
          ) : shown ? (
            <DiagramPanel diagram={shown.diagram} onBackgroundChange={edit.setBackground} />
          ) : null
        }
        edges={
          <EdgeTools
            edges={shown?.diagram.edges ?? []}
            onUpdate={edit.updateEdgeFields}
            onAnchors={edit.setEdgeAnchors}
            onRemove={edit.removeEdge}
          />
        }
      />
    </div>
  );
}
