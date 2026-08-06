import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve each shared @cogweb/* package to its sibling-source entry, so the
// Game-seam adapter (src/game/) and its tests compile against the live shared
// source with no publish/build step (mirrors cogsul's vitest config).
const pkg = (name: string) =>
  fileURLToPath(new URL(`packages/${name}/src/index.ts`, import.meta.url));
// `@cogweb/ui/styles.css` has no package `exports`; map the sub-path to the real
// file (it must precede the bare `@cogweb/ui` alias so the prefix match doesn't win).
const uiStyles = fileURLToPath(new URL("packages/ui/src/styles.css", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["src/client/**", "jsdom"]],
  },
  resolve: {
    alias: {
      "@cogweb/protocol": pkg("protocol"),
      "@cogweb/core": pkg("core"),
      "@cogweb/coworld": pkg("coworld"),
      "@cogweb/llm": pkg("llm"),
      "@cogweb/ui/styles.css": uiStyles,
      "@cogweb/ui": pkg("ui"),
    },
  },
});
