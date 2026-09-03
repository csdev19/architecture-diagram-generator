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
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
