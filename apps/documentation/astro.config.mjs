// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

// https://astro.build/config
export default defineConfig({
  integrations: [
    mermaid(),
    starlight({
      title: "Diagram Tool",
      lastUpdated: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/csdev19/architecture-diagram-generator",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [{ slug: "index" }],
        },
        {
          label: "Briefings",
          items: [
            { slug: "briefings" },
            { slug: "briefings/pitch" },
            { slug: "briefings/roadmap" },
            { slug: "briefings/ai-briefing" },
            { slug: "briefings/stack" },
            { slug: "briefings/design-brief" },
          ],
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
        {
          label: "Authentication",
          items: [
            { slug: "authentication" },
            { slug: "authentication/overview" },
            { slug: "authentication/implementation" },
            { slug: "authentication/quick-reference" },
          ],
        },
        {
          label: "Backend",
          autogenerate: { directory: "backend" },
        },
        {
          label: "Frontend",
          autogenerate: { directory: "frontend" },
        },
        {
          label: "Features",
          items: [
            {
              label: "Diagram Tool",
              autogenerate: { directory: "features/diagram-tool" },
            },
            { slug: "convex" },
            {
              label: "Convex",
              autogenerate: { directory: "features/convex" },
            },
          ],
        },
        {
          label: "Guides",
          items: [
            { slug: "application-layer" },
            { slug: "constants-pattern" },
            { slug: "domain-architecture-patterns" },
            { slug: "environment-variables" },
            { slug: "fullstack-tanstack-elysia" },
            { slug: "infrastructure-naming" },
            { slug: "mobile-app" },
            { slug: "schemas-implementation" },
            { slug: "web-ui-package" },
          ],
        },
        {
          label: "Backlog",
          autogenerate: { directory: "backlog" },
        },
        {
          label: "Changelog",
          autogenerate: { directory: "changelog" },
        },
      ],
    }),
  ],
});
