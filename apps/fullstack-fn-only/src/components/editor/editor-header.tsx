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
 *
 * The left pill holds nothing that grows. It used to carry the document's name
 * and its node and edge counts, and a pill that grows with its document reaches
 * the centred toolbar and covers the tools — at an ordinary window width, not an
 * extreme one. The name is in the inspector, where it can also be edited, and
 * the edge count is on the Edges tab.
 */

const pill = cn(
  "absolute top-3 z-40 flex items-center gap-1.5 rounded-[12px] p-1.5",
  "border border-ed-border bg-ed-surface shadow-[var(--ed-shadow-md)]",
);

interface EditorHeaderProps {
  paletteOpen: boolean;
  onTogglePalette: () => void;
  theme: ChromeTheme;
  onToggleTheme: () => void;
  canArrange: boolean;
  onArrange: () => void;
  onOpenFile: () => void;
  onDownloadSvg: () => void;
  /** `true` leaves the paper and the grid out, for pasting onto something else. */
  onExportPng: (transparent: boolean) => void;
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
              onSelect: () => onExportPng(false),
              disabled: !canExport,
            },
            {
              label: "Export PNG 2× (transparent)",
              icon: ImageIcon,
              onSelect: () => onExportPng(true),
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
