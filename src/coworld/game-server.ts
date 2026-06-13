// The Coworld GAME runnable: a long-running container that hosts one Cogherence
// episode for external player containers. It satisfies the Coworld game contract
// (GAME.md) — config from COGAME_CONFIG_URI, the required HTTP/WS routes, results
// to COGAME_RESULTS_URI and replay bytes to COGAME_SAVE_REPLAY_URI — while reusing
// the engine, redaction, message bus, replay recorder, and dashboard unchanged.
// Players are external: each player slot is a RemotePlayerAgent the GameRunner
// drives exactly like an in-process agent. In replay mode (COGAME_LOAD_REPLAY_URI)
// it serves only the replay surface.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { GameRunner } from "../server/game-runner";
import { ReplayRecorder } from "../server/replay-recorder";
import { MessageBus } from "../server/message-bus";
import { buildCogSnapshot, redactEventFor } from "../server/redact";
import { toSnapshot } from "../shared/snapshot";
import { messageVisibleToCog } from "../shared/messages";
import { scoreGame } from "../shared/engine/game";
import type { ServerMessage } from "../shared/protocol";
import { gameConfigSchema } from "./config";
import { readJson, writeData, artifactMethod } from "./io";
import { RemotePlayerAgent } from "./remote-player";
import type { CoworldResults, GameToPlayer } from "./protocol";

const env = process.env;
const HOST = env.COGAME_HOST ?? "0.0.0.0";
const PORT = Number(env.COGAME_PORT ?? "8080");
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const INDEX = resolve(DIST, "index.html");
/** Client routes served the SPA shell (must be 200, no redirect — runner preflight). */
const CLIENT_ROUTES = ["/", "/feed", "/cog/:id", "/client/global", "/client/player", "/client/replay"];

const sendJson = (ws: WebSocket, m: unknown): void => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};

async function main(): Promise<void> {
  if (env.COGAME_LOAD_REPLAY_URI) return startReplay(env.COGAME_LOAD_REPLAY_URI);
  return startGame();
}

async function startGame(): Promise<void> {
  const configUri = env.COGAME_CONFIG_URI;
  if (!configUri) throw new Error("COGAME_CONFIG_URI is required");
  const config = gameConfigSchema.parse(await readJson(configUri));
  const n = config.tokens.length;
  const names = config.players.map((p) => p.name);
  const ids = Array.from({ length: n }, (_, i) => `cog${i}`);

  const agents = ids.map((id, slot) => new RemotePlayerAgent({ id, slot, backstopMs: config.deadline_ms + 5_000 }));
  const bus = new MessageBus();
  const runner = new GameRunner({
    seed: config.seed,
    agents,
    maxTurns: config.max_turns,
    deadlineMs: config.deadline_ms,
    minTurnMs: 0,
    bus,
    names,
    negotiateRounds: config.negotiate_rounds,
  });
  const recorder = new ReplayRecorder(runner, { seed: config.seed, agents: names, turns: config.max_turns }, { bus });

  // --- HTTP: health, client SPA + assets, live state probes ----------------
  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/replay.json", (_req, res) =>
    recorder.isEmpty ? res.status(404).json({ error: "no replay yet" }) : res.json(recorder.doc()),
  );
  app.get("/global.json", (_req, res) => res.json(toSnapshot(runner.state)));
  app.get("/cog/:id/state.json", (req, res) => res.json(buildCogSnapshot(toSnapshot(runner.state), req.params.id)));
  app.use(express.static(DIST));
  app.get(CLIENT_ROUTES, (_req, res) => res.sendFile(INDEX));

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // --- start coordination: begin when every slot connects, or on timeout ----
  const connected = new Set<number>();
  let started = false;
  const startEpisode = (): void => {
    if (started) return;
    started = true;
    void runEpisode();
  };
  const runEpisode = async (): Promise<void> => {
    await runner.run();
    const { winner } = scoreGame(runner.state);
    const scores = ids.map((id) => runner.state.cogs[id]?.hearts ?? 0);
    const winnerSlot = winner ? ids.indexOf(winner) : -1;
    const results: CoworldResults = {
      scores,
      winner: winnerSlot >= 0 ? winnerSlot : null,
      turns: Math.max(0, runner.state.turn - 1),
    };
    await writeData(env.COGAME_RESULTS_URI ?? "", JSON.stringify(results), { method: artifactMethod(env.COGAME_RESULTS_METHOD) });
    await writeData(env.COGAME_SAVE_REPLAY_URI ?? "", JSON.stringify(recorder.doc()), { method: artifactMethod(env.COGAME_SAVE_REPLAY_METHOD) });
    for (const a of agents) a.final(results);
    console.log(`episode complete: turns=${results.turns} scores=${JSON.stringify(results.scores)} winner=slot ${results.winner}`);
    setTimeout(() => process.exit(0), 500); // let `final` flush, then signal the runner we're done
  };

  // --- WS: /player (policy), /global + /cog/:id/ws (viewers) -----------------
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const cog = path.match(/^\/cog\/([^/]+)\/ws$/);
    if (path === "/player") {
      wss.handleUpgrade(req, socket, head, (ws) => handlePlayer(ws, url.searchParams));
    } else if (path === "/global" || path === "/global/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => serveViewer(ws, null));
    } else if (cog) {
      wss.handleUpgrade(req, socket, head, (ws) => serveViewer(ws, cog[1]!));
    } else {
      socket.destroy();
    }
  });

  function handlePlayer(ws: WebSocket, q: URLSearchParams): void {
    const slot = Number(q.get("slot"));
    const token = q.get("token") ?? "";
    // Bad/out-of-range slot or wrong token: close 1008 promptly (the runner's
    // preflight fails if a bad-token socket merely hangs).
    if (!Number.isInteger(slot) || slot < 0 || slot >= n || config.tokens[slot] !== token) {
      ws.close(1008, "invalid slot or token");
      return;
    }
    const hello: GameToPlayer & { type: "hello" } = {
      type: "hello",
      slot,
      you: ids[slot]!,
      name: names[slot]!,
      players: ids.map((id, i) => ({ slot: i, id, name: names[i]! })),
      seed: config.seed,
      maxTurns: config.max_turns,
    };
    agents[slot]!.attach({ send: (t) => sendRaw(ws, t) }, hello);
    ws.on("message", (d) => agents[slot]!.deliver(d.toString()));
    ws.on("close", () => agents[slot]!.detach());
    connected.add(slot);
    console.log(`player slot ${slot} connected (${connected.size}/${n})`);
    if (connected.size === n) startEpisode();
  }

  function serveViewer(ws: WebSocket, cogId: string | null): void {
    for (const f of recorder.framesView()) backfillFrame(ws, f, cogId);
    sendJson(ws, { type: "serverStatus", status: runner.currentStatus() });
    const unsub = runner.onUpdate((msg) => {
      if (cogId && msg.type === "snapshot") sendJson(ws, { type: "snapshot", snapshot: buildCogSnapshot(msg.snapshot, cogId) });
      else if (cogId && msg.type === "event") {
        const e = redactEventFor(msg.event, cogId);
        if (e) sendJson(ws, { ...msg, event: e });
      } else sendJson(ws, msg);
    });
    const unsubBus = bus.onPost((m) => {
      if (!cogId || messageVisibleToCog(m, cogId)) sendJson(ws, { type: "message", message: m });
    });
    ws.on("close", () => {
      unsub();
      unsubBus();
    });
  }

  await new Promise<void>((r) => server.listen(PORT, HOST, r));
  console.log(`Cogherence Coworld game — ${n} slots, ${config.max_turns} turns, listening on ${HOST}:${PORT}`);
  setTimeout(startEpisode, config.player_connect_timeout_seconds * 1000);
}

/** Replay mode: serve only the replay surface from the loaded replay envelope. */
async function startReplay(loadUri: string): Promise<void> {
  const replay = await readJson(loadUri);
  const app = express();
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/replay.json", (_req, res) => res.json(replay));
  app.use(express.static(DIST));
  app.get(CLIENT_ROUTES, (_req, res) => res.sendFile(INDEX));
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/replay" || path === "/global" || path === "/global/ws" || /^\/cog\/[^/]+\/ws$/.test(path)) {
      // The runner's replay check reads one message; the browser client fetches
      // /replay.json. Emit the envelope on connect to satisfy both.
      wss.handleUpgrade(req, socket, head, (ws) => sendJson(ws, { type: "replay", replay }));
    } else socket.destroy();
  });
  await new Promise<void>((r) => server.listen(PORT, HOST, r));
  console.log(`Cogherence Coworld replay — listening on ${HOST}:${PORT}`);
}

/** Project one recorded frame for a connecting viewer (redact per cog). */
function backfillFrame(ws: WebSocket, f: ServerMessage, cogId: string | null): void {
  if (f.type === "serverStatus") return;
  if (f.type === "snapshot") {
    sendJson(ws, cogId ? { type: "snapshot", snapshot: buildCogSnapshot(f.snapshot, cogId), backfill: true } : { ...f, backfill: true });
  } else if (f.type === "message") {
    if (!cogId || messageVisibleToCog(f.message, cogId)) sendJson(ws, f);
  } else if (f.type === "event" && cogId) {
    const e = redactEventFor(f.event, cogId);
    if (e) sendJson(ws, { ...f, event: e });
  } else {
    sendJson(ws, f);
  }
}

const sendRaw = (ws: WebSocket, text: string): void => {
  if (ws.readyState === ws.OPEN) ws.send(text);
};

void main();
