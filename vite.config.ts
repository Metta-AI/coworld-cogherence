import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Resolve each shared workspace package to its source entry, so Vite builds the
// @cogweb/* packages straight from packages/<pkg>/src without a publish/build
// step. The pnpm workspace symlinks suffice for the GAME's own @cogweb imports, but a
// cross-package import INSIDE cogweb source (e.g. @cogweb/ui's useFeedStore importing
// @cogweb/protocol) resolves from that package's location and finds no node_modules in
// a fresh deploy worktree — so alias every @cogweb/* explicitly. The `/(.*)` form MUST
// precede the bare alias (Vite matches string finds by prefix).
const pkg = (name: string): string => resolve(__dirname, `packages/${name}/src`);
const cogwebAlias = (name: string): { find: string | RegExp; replacement: string }[] => [
  { find: new RegExp(`^@cogweb/${name}/(.*)$`), replacement: `${pkg(name)}/$1` },
  { find: `@cogweb/${name}`, replacement: `${pkg(name)}/index.ts` },
];

// cogweb source also pulls in third-party deps (`import "zod"` / `"react"`) that can't
// find cogherence's node_modules by walking up from a sibling package dir. Pin them to
// cogherence's own install so the web build resolves them even in a fresh deploy
// worktree, where the sibling cogweb packages have no node_modules of their own.
const sharedDep = (name: string): { find: RegExp; replacement: string }[] => [
  { find: new RegExp(`^${name}/(.*)$`), replacement: resolve(__dirname, `node_modules/${name}/$1`) },
  { find: new RegExp(`^${name}$`), replacement: resolve(__dirname, `node_modules/${name}`) },
];

// Vite config for the spectator client. Multi-entry per-cog views arrive in phase 3.
export default defineConfig(() => ({
  // RELATIVE asset paths: under the cogweb hub the client is served at
  // /<moduleId>/<instanceId>/, so absolute "/assets/…" would 404 at the router root.
  // Relative "./assets/…" resolves under the prefix (and the hub canonicalizes the
  // bare instance URL to a trailing slash). The standalone + Coworld servers, which
  // serve at the root and DO use nested SPA routes (/cog/:id), inject a
  // `<base href="/">` so those relative URLs still resolve to the root there.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [
      ...cogwebAlias("protocol"),
      ...cogwebAlias("core"),
      ...cogwebAlias("coworld"),
      ...cogwebAlias("llm"),
      ...cogwebAlias("ui"),
      ...sharedDep("zod"),
      ...sharedDep("react"),
      ...sharedDep("react-dom"),
      ...sharedDep("express"),
      ...sharedDep("ws"),
      ...sharedDep("@aws-sdk/client-bedrock-runtime"),
    ],
  },
  // Two SPA shells: the global broadcast console (index.html) and the per-agent
  // console (index-agent.html). Both are emitted so a built bundle (`npm run
  // build`) can serve `/` and the coworld host's `/client/player` agent view.
  build: {
    outDir: "dist",
    // Inline every imported asset as a data URI: path-served art 404s under the
    // Observatory proxy / static replay bundle prefixes, but a data URI renders
    // everywhere (LEAGUE.md §4 — the coguire/agricogla pattern).
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        agent: resolve(__dirname, "index-agent.html"),
      },
    },
  },
}));
