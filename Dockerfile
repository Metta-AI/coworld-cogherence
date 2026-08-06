# Coworld image for cogherence. `coworld/compose.yaml` builds this with
# `context: ..` (the repo root), so `COPY dist-server` / `COPY dist` pick up the
# pre-built, fully self-contained esbuild bundles: `npm run build:coworld`
# inlines the @cogweb/* workspace source AND third-party deps, and
# `npm run build:web` emits dist/. Build both on the host first, then run
# `coworld build`. No `node_modules` is needed at runtime.
#
# There is no CMD on purpose: the coworld dispatcher always launches the
# container with the manifest's per-runnable `run` (e.g.
# `node dist-server/coworld/game-cli.js` for the host, or a player entrypoint),
# so an image default would be dead code.
FROM node:20-slim
WORKDIR /app
COPY dist-server ./dist-server
COPY dist ./dist
ENV NODE_ENV=production
