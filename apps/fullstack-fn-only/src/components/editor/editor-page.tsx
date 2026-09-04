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
import { GroupInspector } from "@/components/editor/group-inspector";
import {
  onlyId,
  sameSelection,
  selectionOf,
  toggled,
  type MaybeSelection,
} from "@/components/editor/selection";
import {
  descendantNodeIds,
  groupBounds,
  isInsideGroup,
  outermostGroup,
  parentGroup,
} from "@/components/editor/group-tree";
import { REFUSAL_MESSAGES, groupRefusal } from "@/components/editor/edits/group-edits";
import type { Point } from "@/components/editor/pointer-geometry";
import { SIDE_PANEL_TABS, SIDE_PANEL_WIDTH, SidePanel } from "@/components/editor/side-panel";
import type { SidePanelTab } from "@/components/editor/side-panel";
import {
  PALETTE_TILES,
  findPaletteTile,
  markOf,
  uniqueNodeId,
} from "@/components/editor/tile-catalog";
import type { PaletteTile } from "@/components/editor/tile-catalog";
import { TILE_PALETTE_WIDTH, TilePalette } from "@/components/editor/tile-palette";
import { snapToGrid } from "@/components/editor/edits/edit-document";
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
  const [selection, setSelection] = useState<MaybeSelection>(null);
  /**
   * The group the pointer is working inside.
   *
   * A click selects the outermost group an element belongs to, which is what
   * makes a group feel like one object. Entering one is how you get back to
   * the elements: from then on a click inside it reaches the child rather than
   * the whole. Escape leaves again.
   */
  const [entered, setEntered] = useState<string | null>(null);
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

  /** The one element an inspector edits, or `null` when several are picked. */
  const selectedId = onlyId(selection);

  const selectedNode =
    selection?.kind === "node" && selectedId
      ? (shown?.diagram.nodes.find((node) => node.id === selectedId) ?? null)
      : null;
  const selectedBoundary =
    selection?.kind === "boundary" && selectedId
      ? (shown?.diagram.boundaries.find((boundary) => boundary.id === selectedId) ?? null)
      : null;
  const selectedGroup =
    selection?.kind === "group" && selectedId
      ? (shown?.document.content.groups.find((group) => group.id === selectedId) ?? null)
      : null;
  /** The dashed rectangle around a selected group, drawn only as chrome. */
  const groupOutline =
    shown && selection?.kind === "group" && selectedId
      ? groupBounds(shown.document.content, shown.diagram, selectedId)
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
  const handleSelect = (next: MaybeSelection) => {
    if (next && !sameSelection(next, selection)) {
      setPanelOpen(true);
      setTab(SIDE_PANEL_TABS.INSPECTOR);
    }

    // Leaving whatever was entered, unless the new selection is still inside
    // it: a click on the outside world is how you get back out of a group.
    if (next && entered && !next.ids.every((id) => isInside(entered, id))) setEntered(null);
    if (!next) setEntered(null);

    setSelection(next);
  };

  const isInside = (groupId: string, id: string): boolean =>
    Boolean(shown && (id === groupId || isInsideGroup(shown.document.content, groupId, id)));

  /**
   * What a press on an element selects.
   *
   * The outermost group it belongs to, so a group reads as one object — unless
   * that group has been entered, in which case the press reaches the child of
   * it on the way down. Exactly what Figma, tldraw and Excalidraw do, and the
   * reason entering a group is a gesture at all.
   */
  const resolveSelection = (kind: "node" | "boundary", id: string): MaybeSelection => {
    if (!shown) return selectionOf(kind, id);
    const { content } = shown.document;

    if (entered && isInside(entered, id)) {
      let current = id;
      let parent = parentGroup(content, current);

      while (parent && parent.id !== entered) {
        current = parent.id;
        parent = parentGroup(content, current);
      }

      return current === id ? selectionOf(kind, id) : selectionOf("group", current);
    }

    const outermost = outermostGroup(content, id);
    return outermost ? selectionOf("group", outermost.id) : selectionOf(kind, id);
  };

  const handleToggleSelect = (kind: "node" | "boundary", id: string) => {
    setSelection((current) => toggled(current, kind, id));
    setPanelOpen(true);
    setTab(SIDE_PANEL_TABS.INSPECTOR);
  };

  /** Steps inside the group an element belongs to, and picks the element. */
  const handleEnterGroup = (kind: "node" | "boundary", id: string) => {
    if (!shown) return;

    const parent = parentGroup(shown.document.content, id);
    if (!parent) return;

    setEntered(parent.id);
    handleSelect(selectionOf(kind, id));
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

  /** Where every node in the selection was when the gesture began. */
  const dragOriginRef = useRef<Map<string, Point>>(new Map());

  const handleGestureStart = () => {
    gestureTextRef.current = text;

    const nodes = shown?.diagram.nodes ?? [];
    dragOriginRef.current = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  };

  /**
   * Moves everything in the selection by one delta.
   *
   * Measured from where the nodes were when the gesture began rather than from
   * where they are now, so a drag never accumulates its own rounding. The
   * *delta* is snapped, not the positions: rounding each member to the grid
   * separately moves them by different amounts and shears the group apart.
   */
  const handleSelectionMove = (dx: number, dy: number) => {
    if (!shown || !selection) return;

    const ids =
      selection.kind === "group"
        ? selection.ids.flatMap((id) => descendantNodeIds(shown.document.content, id))
        : selection.ids;

    const stepX = snapToGrid(dx);
    const stepY = snapToGrid(dy);

    const points: Record<string, Point> = {};
    for (const id of ids) {
      const origin = dragOriginRef.current.get(id);
      if (origin) points[id] = { x: origin.x + stepX, y: origin.y + stepY };
    }

    edit.moveNodes(points);
  };

  /** Groups what is selected, or says why it cannot. */
  const handleGroup = () => {
    if (!shown || !selection || selection.ids.length < 2) {
      toast.error(REFUSAL_MESSAGES["not-enough"]);
      return;
    }

    const refusal = groupRefusal(text, selection.ids);
    if (refusal) {
      toast.error(refusal === "unparseable" ? "Fix the JSON first." : REFUSAL_MESSAGES[refusal]);
      return;
    }

    const id = uniqueNodeId(
      "group",
      shown.document.content.groups.map((group) => group.id),
    );

    edit.createGroup(id, selection.ids);
    handleSelect(selectionOf("group", id));
  };

  /** Dissolves the selected group, leaving everything exactly where it is. */
  const handleUngroup = () => {
    if (selection?.kind !== "group") return;

    for (const id of selection.ids) edit.ungroup(id);
    setSelection(null);
    setEntered(null);
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
        ...markOf(placed),
      },
      point,
    );

    setSelection(selectionOf("node", id));
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

    for (const id of selection.ids) {
      // Deleting a group deletes the relation, not the things it held: those
      // are still in the diagram, they have just stopped travelling together.
      if (selection.kind === "node") edit.removeNode(id);
      else if (selection.kind === "boundary") edit.removeBoundary(id);
      else edit.ungroup(id);
    }

    setSelection(null);
    setEntered(null);
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

    const taken = [
      ...shown.diagram.boundaries.map((boundary) => boundary.id),
      ...shown.document.content.groups.map((group) => group.id),
    ];
    const id = uniqueNodeId("boundary", taken);

    edit.addBoundary(
      { id, label: "BOUNDARY", tone: BOUNDARY_TONES.NEUTRAL, padding: BOUNDARY_PADDINGS.NORMAL },
      box,
    );

    /**
     * Drawing a box says "these belong together".
     *
     * The tiles whose centres fall inside it, plus the boundary itself, become
     * a group — so the rectangle that appears afterwards is the derived one and
     * may snap tighter or looser on release. That is what ⌘G does everywhere
     * else. A box drawn around nothing has no members to derive from, so it
     * stays the placed rectangle it was drawn as: the decorative boundary.
     */
    const enclosed = shown.diagram.nodes
      .filter(
        (node) =>
          node.x >= box.x && node.x <= box.x + box.w && node.y >= box.y && node.y <= box.y + box.h,
      )
      .map((node) => node.id);

    changeTool(EDITOR_TOOLS.SELECT);

    if (enclosed.length === 0) {
      handleSelect(selectionOf("boundary", id));
      return;
    }

    const groupId = uniqueNodeId("group", taken);
    edit.createGroup(groupId, [id, ...enclosed]);
    handleSelect(selectionOf("group", groupId));
  };

  // `1`–`6` pick a tool, Escape backs out of whatever is armed, and Delete
  // removes the selected tile. Suppressed inside fields, and whenever a
  // modifier is held, so a browser shortcut still means what it always did.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) handleUngroup();
        else handleGroup();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        setEdgeFrom(null);
        setEntered(null);
        setSelection(null);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selection) return;
        event.preventDefault();

        handleDeleteSelected();
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
  }, [selection, entered, edit, text, shown]);

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
        resolveSelection={resolveSelection}
        onToggleSelect={handleToggleSelect}
        onEnterGroup={handleEnterGroup}
        groupOutline={groupOutline}
        onSelectionMove={handleSelectionMove}
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
          ) : selectedGroup && shown ? (
            <GroupInspector
              group={selectedGroup}
              content={shown.document.content}
              onUngroup={handleUngroup}
              onRemoveMember={(id) => edit.removeMember(selectedGroup.id, id)}
            />
          ) : selection && selection.ids.length > 1 ? (
            <section aria-label="Selection" className="space-y-3 pb-2">
              <p className="text-[13px] text-ed-text">
                {selection.ids.length} selected. Press ⌘G to group them.
              </p>
              <p className="text-[12.5px] text-ed-text-3">
                A group keeps things together: they move as one, and auto-layout places them side by
                side.
              </p>
            </section>
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
