# Cogherence Coworld image — one image, two entrypoints:
#   game   → src/coworld/game-server.ts (the long-running game container; CMD)
#   player → src/coworld/player-main.ts  (the per-slot reference LLM player; manifest `run`)
# Always build for the cluster: docker build --platform=linux/amd64 ...
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build            # bundles the React dashboard into dist/ (served statically)

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    COGAME_HOST=0.0.0.0 \
    COGAME_PORT=8080
# Carry the (amd64) install + built client + TS sources; the entrypoints run via tsx.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/package.json /app/tsconfig.json ./
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "src/coworld/game-server.ts"]
