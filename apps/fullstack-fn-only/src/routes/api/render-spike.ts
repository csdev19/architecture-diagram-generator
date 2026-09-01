import { svgToPng } from "@/server/resvg";
import { renderSVG } from "@diagram-tool/domain/render";
import { EXAMPLE_DIAGRAM_CONFIG, diagramConfigSchema } from "@diagram-tool/domain/schemas";
import { createFileRoute } from "@tanstack/react-router";

/**
 * THROWAWAY. Proves resvg-wasm initialises and rasterises inside this Worker
 * under the Vite dev loop, which is the one unknown the API phase rests on.
 * Delete once `/api/render` exists.
 */
export const Route = createFileRoute("/api/render-spike")({
  server: {
    handlers: {
      GET: async () => {
        const svg = renderSVG(diagramConfigSchema.parse(EXAMPLE_DIAGRAM_CONFIG));
        const png = await svgToPng(svg);

        return new Response(png, {
          headers: { "content-type": "image/png", "cache-control": "no-store" },
        });
      },
    },
  },
});
