// The express app: a small operator API (health + public/redacted state JSON) and
// client serving with SPA fallbacks — through Vite in middleware mode when a dev
// server is passed (source modules + HMR, no build step), or raw index.html
// otherwise (tests exercise the API only). The live feed itself goes over
// websockets (see websocket.ts); these routes are for probes, tooling, and
// serving the client.
import express from "express";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { toSnapshot } from "../shared/snapshot";
import { greedyAgent } from "../agents/stub";
import { OrderSchema } from "../shared/engine/orders";
import { steerableAgent } from "./steering-store";
import { buildCogSnapshot } from "./redact";
import type { GameRunner } from "./game-runner";
import type { ActPromptHub } from "./act-prompt-hub";
import type { SteeringStore } from "./steering-store";
import type { ReplayRecorder } from "./replay-recorder";

/** Inbound operator steering patch (validated at the boundary; invalid → 400).
 *  `pending` REPLACES the cog's queued operator orders wholesale. */
const steeringPatchSchema = z
  .object({
    persona: z.string().optional(),
    paused: z.boolean().optional(),
    pending: z.array(OrderSchema).optional(),
    standingBid: z.number().int().min(0).optional(),
  })
  .strict();

export function createApp(
  runner: GameRunner,
  hub?: ActPromptHub,
  steering?: SteeringStore,
  recorder?: ReplayRecorder,
  opts: { defaultLive?: boolean; vite?: ViteDevServer } = {},
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

  // Operator: pause / resume the live turn loop (parks at the next turn boundary).
  app.post("/pause", (_req, res) => {
    runner.setPaused(true);
    res.json({ ok: true });
  });
  app.post("/resume", (_req, res) => {
    runner.setPaused(false);
    res.json({ ok: true });
  });
  // Operator: raise the soft auto-stop by 10 turns and resume.
  app.post("/extend", (_req, res) => {
    res.json({ ok: true, turnLimit: runner.extendTurnLimit(10) });
  });

  // Operator: seat a new Cog mid-game (greedy stub) at a free corner. A full
  // board (6 seats / no free corner) is a 409 with the engine's reason.
  app.post("/cogs/add", (_req, res) => {
    try {
      res.json({ ok: true, id: runner.addCog((id) => (steering ? steerableAgent(greedyAgent(id), steering) : greedyAgent(id))) });
    } catch (e) {
      res.status(409).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Operator steering (Phase D): read + edit a cog's persona / paused flag live.
  app.get("/cog/:id/steering", (req, res) => res.json(steering?.get(req.params.id) ?? { persona: "", paused: false, pending: [], standingBid: 0 }));
  // Operator READY (manual mode): submit the queued orders for this Commit now.
  app.post("/cog/:id/ready", (req, res) => {
    if (!steering) return res.status(404).json({ error: "steering unavailable" });
    steering.markReady(req.params.id);
    return res.json({ ok: true });
  });
  app.post("/cog/:id/steering", (req, res) => {
    if (!steering) return res.status(404).json({ error: "steering unavailable" });
    const parsed = steeringPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid steering patch" });
    return res.json(steering.update(req.params.id, parsed.data));
  });

  // Client serving: Vite middleware transforms source modules on demand and
  // hot-swaps client edits into the open page — no build step, no server
  // restart, and the live game survives UI iteration. (Restarts are what left
  // the preview pane stranded on its non-retrying "Awaiting server…" screen.)
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (opts.vite) app.use(opts.vite.middlewares);
  // SPA fallback for client routes (index.html drives view selection). On a
  // live server, default the bare routes to the LIVE view (add ?live) so
  // opening the URL watches the running game instead of the static recording —
  // live mode also lets you scrub buffered history, so nothing is lost.
  app.get(["/", "/cog/:id", "/feed"], async (req, res) => {
    if (opts.defaultLive && req.query.live === undefined) return res.redirect(`${req.path}?live`);
    const raw = await readFile(resolve(root, "index.html"), "utf-8");
    res.type("html").send(opts.vite ? await opts.vite.transformIndexHtml(req.originalUrl, raw) : raw);
  });

  return app;
}
