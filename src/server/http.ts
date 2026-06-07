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
import type { ReplayRecorder } from "./replay-recorder";

/** Inbound operator steering patch (validated at the boundary; invalid → 400). */
const steeringPatchSchema = z.object({ persona: z.string().optional(), paused: z.boolean().optional() }).strict();

export function createApp(
  runner: GameRunner,
  hub?: ActPromptHub,
  steering?: SteeringStore,
  recorder?: ReplayRecorder,
  opts: { defaultLive?: boolean } = {},
): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

  // The live server replays ITS OWN recorded game: open the dashboard without
  // ?live to re-watch the game just played. Falls through to the bundled file
  // (the build-time scripted game) until the live recorder has captured a frame.
  app.get("/replay.json", (_req, res, next) => {
    if (recorder && !recorder.isEmpty) return res.json(recorder.doc());
    return next();
  });
  app.get("/global.json", (_req, res) => res.json(toSnapshot(runner.state)));
  app.get("/cog/:id/state.json", (req, res) => res.json(buildCogSnapshot(toSnapshot(runner.state), req.params.id)));
  app.get("/cog/:id/act-prompts", (req, res) => res.json(hub?.list(req.params.id) ?? []));

  // Operator: restart the live game from turn 1 (keeps personas/pauses).
  app.post("/reset", (_req, res) => {
    runner.reset();
    res.json({ ok: true });
  });

  // Operator steering (Phase D): read + edit a cog's persona / paused flag live.
  app.get("/cog/:id/steering", (req, res) => res.json(steering?.get(req.params.id) ?? { persona: "", paused: false }));
  app.post("/cog/:id/steering", (req, res) => {
    if (!steering) return res.status(404).json({ error: "steering unavailable" });
    const parsed = steeringPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid steering patch" });
    return res.json(steering.update(req.params.id, parsed.data));
  });

  const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
  // index:false so "/" falls through to the SPA handler below (which may redirect
  // to ?live) instead of express.static serving index.html and shadowing it.
  app.use(express.static(dist, { index: false }));
  // SPA fallback for client routes (the built index.html drives view selection).
  // On a live server, default the bare routes to the LIVE view (add ?live) so
  // opening the URL watches the running game instead of the static recording —
  // live mode also lets you scrub buffered history, so nothing is lost.
  app.get(["/", "/cog/:id", "/feed"], (req, res) => {
    if (opts.defaultLive && req.query.live === undefined) return res.redirect(`${req.path}?live`);
    res.sendFile(resolve(dist, "index.html"));
  });

  return app;
}
