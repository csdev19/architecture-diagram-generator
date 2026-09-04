import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@diagram-tool/web-ui";
import type { ObjectProperties } from "@diagram-tool/domain/types";

/**
 * The right panel, floating over the canvas.
 *
 * It collapses to nothing rather than opening as a modal: the whole point of
 * the JSON tab is watching the text change while you drag, which a dialog over
 * the canvas makes impossible. Width animates; the content inside keeps its
 * full width so nothing reflows on the way out.
 *
 * Floating rather than a column, so closing it gives the diagram the space
 * back instead of the stage merely re-flowing around a gap.
 */

export const SIDE_PANEL_TABS = {
  JSON: "json",
  PROMPT: "prompt",
  INSPECTOR: "inspector",
  EDGES: "edges",
} as const;

export type SidePanelTab = ObjectProperties<typeof SIDE_PANEL_TABS>;

/** Wide enough that a formatted config does not wrap at 11.5px mono. */
export const SIDE_PANEL_WIDTH = 420;

interface SidePanelProps {
  open: boolean;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  edgeCount: number;
  json: ReactNode;
  prompt: ReactNode;
  inspector: ReactNode;
  edges: ReactNode;
}

const TAB_LABELS: Record<SidePanelTab, string> = {
  [SIDE_PANEL_TABS.JSON]: "JSON",
  [SIDE_PANEL_TABS.PROMPT]: "Prompt",
  [SIDE_PANEL_TABS.INSPECTOR]: "Inspector",
  [SIDE_PANEL_TABS.EDGES]: "Edges",
};

const TAB_ORDER: SidePanelTab[] = [
  SIDE_PANEL_TABS.JSON,
  SIDE_PANEL_TABS.PROMPT,
  SIDE_PANEL_TABS.INSPECTOR,
  SIDE_PANEL_TABS.EDGES,
];

/**
 * One tab's contents, mounted whether or not it is showing.
 *
 * `display` is set inline rather than by a class so the hidden state cannot be
 * beaten by a layout utility on the same element — a `flex` class outranks the
 * user agent's rule for `[hidden]`, which is exactly the bug where a "hidden"
 * panel keeps taking up the panel.
 */
function TabBody({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div hidden={!active} style={{ display: active ? "flex" : "none" }} className={className}>
      {children}
    </div>
  );
}

/**
 * Arrow-key movement across the tabs.
 *
 * The tablist uses roving tabindex — one tab is reachable with Tab and the rest
 * carry `tabIndex={-1}` — which is the correct pattern and is only half of it.
 * Without arrow handling the inactive tabs are reachable by no key at all, so
 * every panel but the open one was mouse-only.
 */
const TAB_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function SidePanel({
  open,
  tab,
  onTabChange,
  edgeCount,
  json,
  prompt,
  inspector,
  edges,
}: SidePanelProps) {
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? TAB_ORDER[0] : TAB_ORDER[TAB_ORDER.length - 1];
      if (target) onTabChange(target);
      return;
    }

    const step = TAB_STEP[event.key];
    if (step === undefined) return;

    event.preventDefault();
    const from = TAB_ORDER.indexOf(tab);
    // Wraps, so the last tab's right arrow reaches the first rather than dying.
    const next = TAB_ORDER[(from + step + TAB_ORDER.length) % TAB_ORDER.length];
    if (next) onTabChange(next);
  };

  return (
    <div
      className={cn(
        "absolute top-[64px] right-3 bottom-3 z-30 overflow-hidden rounded-[12px] bg-ed-surface",
        "transition-[width] duration-200 ease-[cubic-bezier(.16,1,.3,1)]",
        // Dropped while collapsed so a zero-width panel does not leave a 2px
        // sliver of border and a shadow against the canvas.
        open ? "border border-ed-border shadow-[var(--ed-shadow-md)]" : "border-0 shadow-none",
      )}
      style={{ width: open ? SIDE_PANEL_WIDTH : 0 }}
      // Hidden from assistive tech when collapsed: the controls are still in
      // the DOM so the width can animate, but they are not reachable.
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex h-full flex-col" style={{ width: SIDE_PANEL_WIDTH }}>
        <div
          role="tablist"
          aria-label="Editor panels"
          className="flex gap-1 border-b border-ed-border px-4"
        >
          {TAB_ORDER.map((candidate) => {
            const active = candidate === tab;
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                id={`side-panel-tab-${candidate}`}
                aria-selected={active}
                aria-controls="side-panel-body"
                tabIndex={active ? 0 : -1}
                onClick={() => onTabChange(candidate)}
                onKeyDown={handleTabKey}
                className={cn(
                  "relative -mb-px px-2 py-3 text-[13px] font-medium",
                  "transition-colors duration-[140ms] outline-none",
                  "focus-visible:shadow-[var(--ed-focus-ring)] focus-visible:rounded-[6px]",
                  active ? "text-ed-text" : "text-ed-text-3 hover:text-ed-text-2",
                )}
              >
                {TAB_LABELS[candidate]}
                {candidate === SIDE_PANEL_TABS.EDGES ? (
                  <span className="ml-1.5 font-mono text-[11px] text-ed-text-3">{edgeCount}</span>
                ) : null}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ed-border-strong"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {/*
          Every body stays mounted, hidden rather than unmounted. The JSON
          textarea is the one control on the screen with a position in it — a
          scroll offset and a caret, usually parked on the node being edited —
          and remounting it on every tab press throws both away.
        */}
        <div
          role="tabpanel"
          id="side-panel-body"
          aria-labelledby={`side-panel-tab-${tab}`}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4"
        >
          <TabBody active={tab === SIDE_PANEL_TABS.JSON} className="min-h-0 flex-1 flex-col">
            {json}
          </TabBody>
          <TabBody active={tab === SIDE_PANEL_TABS.PROMPT} className="flex-col">
            {prompt}
          </TabBody>
          <TabBody active={tab === SIDE_PANEL_TABS.INSPECTOR} className="flex-col">
            {inspector}
          </TabBody>
          <TabBody active={tab === SIDE_PANEL_TABS.EDGES} className="flex-col">
            {edges}
          </TabBody>
        </div>
      </div>
    </div>
  );
}
