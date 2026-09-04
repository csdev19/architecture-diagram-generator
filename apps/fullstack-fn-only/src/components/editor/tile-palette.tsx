import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@diagram-tool/web-ui";
import { EditorInput, MicroLabel } from "@/components/editor/editor-chrome";
import {
  BRAND_TILE_COUNT,
  matchesQuery,
  PALETTE_TILES,
  TILE_DRAG_MIME,
  type PaletteTile,
} from "@/components/editor/tile-catalog";

/**
 * The tile palette.
 *
 * Cards rather than a row of monograms: `D`, `BA`, `CF` on their own tell an
 * author nothing, and the thing they are about to place is a tile — so the
 * palette shows the tile, in miniature, with the mark the renderer would draw.
 *
 * The thumbnail is the one place in the chrome that uses the sheet's colours:
 * it is a picture of the diagram, not a control, so it stays white with the
 * renderer's border in both chrome themes. That is the style boundary working,
 * not an oversight.
 */

interface TilePaletteProps {
  selectedKey: string;
  onSelect: (key: string) => void;
}

/** Floating card, so the stage runs underneath it rather than beside it. */
export const TILE_PALETTE_WIDTH = 272;

/** Literals, not `--ed-*`: this is the diagram's light tile, drawn small. */
const THUMBNAIL_STYLE = { backgroundColor: "#ffffff", borderColor: "#e2e8f0" };

function TileThumbnail({ tile }: { tile: PaletteTile }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border"
      style={THUMBNAIL_STYLE}
    >
      {tile.kind === "icon" ? (
        <svg viewBox="0 0 24 24" className="size-[22px]" role="presentation">
          <path d={tile.path} fill={tile.fill} />
        </svg>
      ) : tile.kind === "initials" ? (
        <span className="text-[15px] leading-none font-bold" style={{ color: tile.fill }}>
          {tile.initials}
        </span>
      ) : (
        <span className="text-[19px] leading-none">{tile.emoji}</span>
      )}
    </span>
  );
}

function TileCard({
  tile,
  selected,
  onSelect,
}: {
  tile: PaletteTile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      // Dragging is the primary gesture — pick the tile up, drop it where it
      // goes. Clicking still works, for a keyboard or a trackpad someone would
      // rather not drag on, and arms the same tile for the next click.
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(TILE_DRAG_MIME, tile.key);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "flex w-full cursor-grab items-center gap-3 rounded-[12px] border p-2 text-left",
        "transition-colors duration-[140ms] outline-none active:cursor-grabbing",
        "focus-visible:shadow-[var(--ed-focus-ring)] focus-visible:border-ed-accent",
        selected
          ? "border-ed-border-strong bg-ed-surface-2"
          : "border-ed-border hover:bg-ed-surface-hover",
      )}
    >
      <TileThumbnail tile={tile} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ed-text">{tile.label}</span>
        <span className="block truncate font-mono text-[10.5px] text-ed-text-3">
          {tile.kind === "icon" ? `iconKey: "${tile.iconKey}"` : tile.kind}
        </span>
      </span>
    </button>
  );
}

export function TilePalette({ selectedKey, onSelect }: TilePaletteProps) {
  const [query, setQuery] = useState("");

  const { brands, emojis, customs, total } = useMemo(() => {
    const visible = PALETTE_TILES.filter((tile) => matchesQuery(tile, query));
    return {
      brands: visible.filter((tile) => tile.kind === "icon"),
      emojis: visible.filter((tile) => tile.kind === "emoji"),
      customs: visible.filter((tile) => tile.kind === "initials"),
      total: visible.length,
    };
  }, [query]);

  return (
    <aside
      aria-label="Tiles"
      style={{ width: TILE_PALETTE_WIDTH }}
      className={cn(
        "absolute top-[64px] bottom-[68px] left-3 z-30 flex flex-col",
        "overflow-hidden rounded-[12px] border border-ed-border bg-ed-surface",
        "shadow-[var(--ed-shadow-md)]",
      )}
    >
      <div className="space-y-2.5 border-b border-ed-border px-4 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          {/*
            Named for what it does, not for what it holds. This panel is the
            only way a tile gets onto the sheet — the toolbar has no button for
            it — so its heading has to say that rather than label a category.
          */}
          <h2 className="text-[13px] font-semibold tracking-[-0.006em] text-ed-text">Add a tile</h2>
          <span className="shrink-0 font-mono text-[11px] text-ed-text-3">
            {total} of {PALETTE_TILES.length}
          </span>
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-ed-text-3"
          />
          <EditorInput
            type="search"
            aria-label="Search a technology"
            placeholder="Search a technology"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
          />
        </div>

        <p className="text-[12.5px] text-ed-text-2">
          Drag one onto the canvas, or click it and then click where it goes.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {total === 0 ? (
          <p className="text-[12.5px] text-ed-text-2">
            No tile matches that. Only {BRAND_TILE_COUNT} brand logos exist — anything else is a
            monogram or an emoji.
          </p>
        ) : null}

        {brands.map((tile) => (
          <TileCard
            key={tile.key}
            tile={tile}
            selected={tile.key === selectedKey}
            onSelect={() => onSelect(tile.key)}
          />
        ))}

        {emojis.length > 0 ? (
          <div className="flex items-center gap-2 pt-3 pb-1">
            <MicroLabel>Emoji fallback</MicroLabel>
            <span className="h-px flex-1 bg-ed-border" />
          </div>
        ) : null}

        {emojis.map((tile) => (
          <TileCard
            key={tile.key}
            tile={tile}
            selected={tile.key === selectedKey}
            onSelect={() => onSelect(tile.key)}
          />
        ))}

        {customs.length > 0 ? (
          <div className="flex items-center gap-2 pt-3 pb-1">
            <MicroLabel>No logo for it</MicroLabel>
            <span className="h-px flex-1 bg-ed-border" />
          </div>
        ) : null}

        {customs.map((tile) => (
          <TileCard
            key={tile.key}
            tile={tile}
            selected={tile.key === selectedKey}
            onSelect={() => onSelect(tile.key)}
          />
        ))}
      </div>
    </aside>
  );
}
