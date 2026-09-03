import { useEffect, useRef, useState } from "react";
import {
  Braces,
  ChevronDown,
  Download,
  FileJson,
  FolderOpen,
  Image as ImageIcon,
  Moon,
  PanelLeft,
  Sun,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@diagram-tool/web-ui";
import { EditorButton } from "@/components/editor/editor-chrome";
import type { ChromeTheme } from "@/components/editor/use-chrome-theme";

/**
 * The header, as two pills floating over the canvas.
 *
 * Not a bar: a full-width header would take a strip of canvas across the whole
 * window to show two clusters of buttons that need a corner each. The stage
 * runs edge to edge underneath, and the toolbar sits centred between them on
 * the same row.
 *
 * Three controls on the right and no more: `Arrange`, `File` and the one
 * primary button on the screen. Everything file-shaped lives inside `File`
 * because opening a config only ever replaces the text in the textarea — it is
 * not a peer of "lay this diagram out".
 *
 * The two icon buttons on the left are view state, not document actions, which
 * is why they sit in the other pill.
 */

const pill = cn(
  "absolute top-3 z-40 flex items-center gap-1.5 rounded-[12px] p-1.5",
  "border border-ed-border bg-ed-surface shadow-[var(--ed-shadow-md)]",
);

interface EditorHeaderProps {
  title: string;
  nodeCount: number;
  edgeCount: number;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  theme: ChromeTheme;
  onToggleTheme: () => void;
  canArrange: boolean;
  onArrange: () => void;
  onOpenFile: () => void;
  onDownloadSvg: () => void;
  onExportPng: () => void;
  onSaveJson: () => void;
  canExport: boolean;
  jsonOpen: boolean;
  onToggleJson: () => void;
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
}

function FileMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} data-menu className="relative">
      <EditorButton
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        File
        <ChevronDown aria-hidden />
      </EditorButton>

      {open ? (
        <div
          role="menu"
          aria-label="File"
          className={cn(
            "absolute top-full right-0 z-50 mt-1.5 w-[216px] p-1",
            "rounded-[12px] border border-ed-border bg-ed-surface shadow-[var(--ed-shadow-md)]",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left",
                "text-[13px] text-ed-text transition-colors duration-[140ms] outline-none",
                "hover:bg-ed-surface-hover focus-visible:bg-ed-surface-hover",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              <item.icon
                className="size-[15px] shrink-0 text-ed-text-2"
                strokeWidth={1.75}
                aria-hidden
              />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const iconButton = cn(
  "flex size-8 items-center justify-center rounded-[8px] text-ed-text-2",
  "transition-colors duration-[140ms] outline-none",
  "hover:bg-ed-surface-hover hover:text-ed-text focus-visible:shadow-[var(--ed-focus-ring)]",
);

export function EditorHeader({
  title,
  nodeCount,
  edgeCount,
  paletteOpen,
  onTogglePalette,
  theme,
  onToggleTheme,
  canArrange,
  onArrange,
  onOpenFile,
  onDownloadSvg,
  onExportPng,
  onSaveJson,
  canExport,
  jsonOpen,
  onToggleJson,
}: EditorHeaderProps) {
  return (
    <header>
      <div className={cn(pill, "left-3")}>
        <button
          type="button"
          aria-pressed={paletteOpen}
          aria-label={paletteOpen ? "Hide the tile palette" : "Show the tile palette"}
          onClick={onTogglePalette}
          className={iconButton}
        >
          <PanelLeft className="size-[17px]" strokeWidth={1.75} aria-hidden />
        </button>

        <button
          type="button"
          aria-label={theme === "dark" ? "Use light chrome" : "Use dark chrome"}
          onClick={onToggleTheme}
          className={iconButton}
        >
          {theme === "dark" ? (
            <Sun className="size-[17px]" strokeWidth={1.75} aria-hidden />
          ) : (
            <Moon className="size-[17px]" strokeWidth={1.75} aria-hidden />
          )}
        </button>

        <h1 className="pl-1 text-[15px] font-semibold tracking-[-0.008em] text-ed-text">
          Diagram editor
        </h1>

        {/*
          The meta line and the byline are the first things to go on a narrow
          window: below this breakpoint the pill would grow into the centred
          toolbar.
        */}
        <p className="hidden min-w-0 truncate pr-1 font-mono text-[11px] text-ed-text-3 lg:block">
          {title} · {nodeCount} {nodeCount === 1 ? "node" : "nodes"} · {edgeCount}{" "}
          {edgeCount === 1 ? "edge" : "edges"}
        </p>

        {/*
          Attribution, not navigation: it sits after the meta line, at the same
          weight, so it reads as a signature rather than as a control competing
          with the two buttons on the left of this pill.
        */}
        <a
          href="https://cs19.dev"
          target="_blank"
          rel="noreferrer"
          className={cn(
            "hidden shrink-0 border-l border-ed-border py-0.5 pl-2 pr-1 lg:block",
            "font-mono text-[11px] text-ed-text-3",
            "rounded-[4px] hover:text-ed-text focus-visible:text-ed-text",
            "outline-none focus-visible:shadow-[var(--ed-focus-ring)]",
          )}
        >
          built by csdev
        </a>
      </div>

      <div className={cn(pill, "right-3")}>
        <EditorButton variant="ghost" disabled={!canArrange} onClick={onArrange}>
          <WandSparkles aria-hidden />
          Arrange
        </EditorButton>

        <FileMenu
          items={[
            { label: "Open a config…", icon: FolderOpen, onSelect: onOpenFile },
            { label: "Save JSON", icon: FileJson, onSelect: onSaveJson },
            {
              label: "Download SVG",
              icon: Download,
              onSelect: onDownloadSvg,
              disabled: !canExport,
            },
            {
              label: "Export PNG 2×",
              icon: ImageIcon,
              onSelect: onExportPng,
              disabled: !canExport,
            },
          ]}
        />

        <EditorButton variant="primary" onClick={onToggleJson}>
          <Braces aria-hidden />
          {jsonOpen ? "Hide JSON" : "Show JSON"}
        </EditorButton>
      </div>
    </header>
  );
}
