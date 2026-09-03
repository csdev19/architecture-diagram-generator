import { createFileRoute } from "@tanstack/react-router";
import { EditorPage } from "@/components/editor/editor-page";

export const Route = createFileRoute("/")({
  component: EditorPage,
});
