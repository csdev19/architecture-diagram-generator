import { useState } from "react";
import { Button } from "@diagram-tool/web-ui";
import { downloadSvg, downloadSvgAsPng } from "@/lib/export-png";

interface DiagramPreviewProps {
  svg: string | null;
  title: string;
}

/**
 * The preview pane.
 *
 * The SVG is injected as markup rather than rebuilt as a React tree on purpose:
 * one renderer, shared with the server, is what guarantees the exported PNG
 * matches what is on screen. The markup is not attacker-controlled — it comes
 * from our own renderer, from a schema-validated config, with every
 * interpolated string XML-escaped.
 */
export function DiagramPreview({ svg, title }: DiagramPreviewProps) {
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPng = async () => {
    if (!svg) return;
    setExportError(null);
    try {
      await downloadSvgAsPng(svg, `${title}.png`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Preview</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!svg}
            onClick={() => svg && downloadSvg(svg, `${title}.svg`)}
          >
            Download SVG
          </Button>
          <Button size="sm" disabled={!svg} onClick={handleExportPng}>
            Export PNG (2x)
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-4">
        {svg ? (
          <div
            className="max-w-full [&>svg]:h-auto [&>svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Fix the problems on the left to see the diagram.
          </p>
        )}
      </div>

      {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}
    </div>
  );
}
