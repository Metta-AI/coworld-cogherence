// The express app: a small operator API (health + public/redacted state JSON) and
// static serving of the built client (dist/) with SPA fallbacks. The live feed
// itself goes over websockets (see websocket.ts); these routes are for probes,
// tooling, and serving the bundle.
import express from "express";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot } from "./redact";
import type { GameRunner } from "./game-runner";
import type { ActPromptHub } from "./act-prompt-hub";
import type { SteeringStore } from "./steering-store";

/** Inbound operator steering patch (validated at the boundary; invalid → 400). */
const steeringPatchSchema = z.object({ persona: z.string().optional(), paused: z.boolean().optional() }).strict();

export function createApp(runner: GameRunner, hub?: ActPromptHub, steering?: SteeringStore): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.type("text/plain").send("ok"));
  app.get("/global.json", (_req, res) => res.json(toSnapshot(runner.state)));
  app.get("/cog/:id/state.json", (req, res) => res.json(buildCogSnapshot(toSnapshot(runner.state), req.params.id)));
  app.get("/cog/:id/act-prompts", (req, res) => res.json(hub?.list(req.params.id) ?? []));

  // Operator steering (Phase D): read + edit a cog's persona / paused flag live.
  app.get("/cog/:id/steering", (req, res) => res.json(steering?.get(req.params.id) ?? { persona: "", paused: false }));
  app.post("/cog/:id/steering", (req, res) => {
    if (!steering) return res.status(404).json({ error: "steering unavailable" });
    const parsed = steeringPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid steering patch" });
    return res.json(steering.update(req.params.id, parsed.data));
  });

  const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
  app.use(express.static(dist));
  // SPA fallback for client routes (the built index.html drives view selection).
  app.get(["/", "/cog/:id", "/feed"], (_req, res) => res.sendFile(resolve(dist, "index.html")));

  return app;
}
