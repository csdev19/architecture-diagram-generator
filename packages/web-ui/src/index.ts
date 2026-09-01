// Export all components
export * from "./components/accordion";
export * from "./components/button";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/dropdown-menu";
export * from "./components/input";
export * from "./components/label";
export * from "./components/markdown-content";
export * from "./components/skeleton";
export * from "./components/sonner";
export * from "./components/table";
export * from "./components/textarea";
export * from "./components/test-component";
export * from "./components/alert";
export * from "./components/badge";
export * from "./components/select";
export * from "./components/dialog";
export * from "./components/alert-dialog";

// Export utilities
export * from "./lib/utils";
export * from "./lib/normalize-markdown";

// No stylesheet is imported here on purpose. One Tailwind build per app, owned
// by the app: consumers pull the theme with `@import "@diagram-tool/web-ui/styles.css"`
// (the export points at src/styles.css, compiled by the app's own Tailwind).
// Importing it here made `vite-plugin-lib-inject-css` ship a second utilities
// layer inside dist, which loads after the app's and silently wins the cascade —
// app-only responsive classes (`md:grid-cols-2`) then collapse in production
// builds while working in dev.
