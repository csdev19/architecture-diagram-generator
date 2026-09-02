import { useRef } from "react";
import { Button } from "@diagram-tool/web-ui";
import { downloadConfig } from "@/lib/export-png";

/**
 * Opening and saving a diagram, as files.
 *
 * The config *is* the diagram: a saved `.json` reopens byte-identical, which a
 * PNG cannot. Until there is a server to mint ids against, the filesystem is
 * the persistence layer — and it is honest about it, rather than pretending
 * with browser storage the author cannot find, back up or send to anyone.
 *
 * Saving deliberately works even while the config is invalid. Work in progress
 * is exactly what you most want to keep.
 */

interface ConfigFileControlsProps {
  text: string;
  title: string;
  onLoad: (text: string) => void;
  onArrange: () => void;
  /** Layout needs a config that validates, so the button waits for one. */
  canArrange: boolean;
}

export function ConfigFileControls({
  text,
  title,
  onLoad,
  onArrange,
  canArrange,
}: ConfigFileControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    onLoad(await file.text());
    // Cleared so re-opening the same file still fires a change event.
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        // Named so it cannot be confused with the textarea's own
        // "Diagram config (JSON)" label, by a reader or by a test.
        aria-label="Open a saved diagram file"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button size="sm" variant="outline" disabled={!canArrange} onClick={onArrange}>
        Arrange
      </Button>
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
        Open…
      </Button>
      <Button size="sm" variant="outline" onClick={() => downloadConfig(text, `${title}.json`)}>
        Save JSON
      </Button>
    </div>
  );
}
