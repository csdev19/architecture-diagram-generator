import { useCallback, useEffect, useState } from "react";

/**
 * Light or dark for the editor's chrome — and only the chrome.
 *
 * The diagram sheet does not participate. Its colours are hex literals in
 * `@diagram-tool/domain` because they are written into SVG attributes and have
 * to survive rasterisation to PNG where no stylesheet exists, so the sheet
 * stays light whichever way this goes. A "dark diagram" would be a different
 * renderer, not a theme.
 *
 * The app shell forces `.dark` on `<html>` for its own pages; the editor reads
 * `data-chrome` on its own root instead, which is why this is a separate
 * preference rather than a hook into the app's theme.
 */

export type ChromeTheme = "light" | "dark";

const STORAGE_KEY = "diagram-editor-chrome";

const isChromeTheme = (value: unknown): value is ChromeTheme =>
  value === "light" || value === "dark";

export const useChromeTheme = () => {
  // Always light for the first paint. Reading storage during render would make
  // the server's HTML and the client's first render disagree, and React
  // resolves that by throwing the markup away.
  const [theme, setTheme] = useState<ChromeTheme>("light");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isChromeTheme(stored)) setTheme(stored);
    } catch {
      // Storage can be denied outright (private mode, blocked cookies). The
      // editor works without remembering, so there is nothing to report.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // As above: the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
};
