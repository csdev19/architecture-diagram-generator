import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Toaster } from "@diagram-tool/web-ui";

import appCss from "../index.css?url";

/**
 * The document, and nothing else.
 *
 * There is one route and it is the editor — a canvas application that owns the
 * whole viewport, sets its own header and runs its own chrome theme. So there
 * is no app shell here to speak of: no navbar to hide on some routes, no
 * session to resolve before rendering, no layout the editor has to opt out of.
 */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Diagram Editor" },
      {
        name: "description",
        content:
          "Architecture diagrams as data: describe the system, get a diagram you can drag, and export the SVG or PNG.",
      },
      // The tab strip and the browser chrome should not flash white at a tool
      // whose own chrome is dark.
      { name: "theme-color", content: "#0f172a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // SVG for everything modern, PNG for the platforms that still refuse it.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootDocument,
});

// Critical inline styles to prevent flash of unstyled content.
const criticalStyles = `
  html, body {
    background-color: oklch(14.5% 0 0);
    color: oklch(98.5% 0 0);
    margin: 0;
    padding: 0;
  }
`;

function RootDocument() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalStyles }} />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <div className="min-h-svh">
          <Outlet />
        </div>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
