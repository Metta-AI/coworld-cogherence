// Websocket fan-out: /global/ws gets full frames; /cog/:id/ws gets per-cog
// redacted snapshots. On connect, the whole game so far is backfilled from the
// recorder (so the scrubber spans turn 1 → now); the runner's onUpdate broadcasts
// live frames thereafter. Without a recorder, falls back to a head-first sync.
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { CogId } from "../shared/engine/types";
import type { ServerMessage } from "../shared/protocol";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot } from "./redact";
import type { GameRunner } from "./game-runner";
import type { ActPromptHub } from "./act-prompt-hub";
import type { MessageBus } from "./message-bus";
import type { ReplayRecorder } from "./replay-recorder";
import { messageVisibleToCog } from "../shared/messages";

interface Client {
  ws: WebSocket;
  cogId: CogId | null; // null = global (full) view
}

const send = (ws: WebSocket, m: ServerMessage): void => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};

/** Project one recorded frame for a connecting client: redact snapshots and filter
 *  chat/transparency for a cog; pass everything through for the global view. Drops
 *  historical serverStatus frames (the current status is sent separately). */
function backfillFrame(ws: WebSocket, f: ServerMessage, cogId: CogId | null): void {
  if (f.type === "serverStatus") return;
  if (f.type === "snapshot") {
    send(ws, cogId ? { type: "snapshot", snapshot: buildCogSnapshot(f.snapshot, cogId), backfill: true } : { ...f, backfill: true });
  } else if (f.type === "message") {
    if (!cogId || messageVisibleToCog(f.message, cogId)) send(ws, f);
  } else if (f.type === "actPrompt") {
    if (!cogId || f.cogId === cogId) send(ws, f);
  } else {
    send(ws, f); // board events are public
  }
}

export function attachWebsockets(
  http: HttpServer,
  runner: GameRunner,
  hub?: ActPromptHub,
  bus?: MessageBus,
  recorder?: ReplayRecorder,
): { close: () => void } {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  http.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const m = path.match(/^\/cog\/([^/]+)\/ws$/);
    let cogId: CogId | null;
    if (path === "/global/ws") cogId = null;
    else if (m) cogId = m[1]!;
    else if (path === "/vite-hmr") return; // Vite HMR (dev) — vite's own upgrade listener owns this path
    else {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, cogId };
      clients.add(client);
      runner.setClientCount(clients.size);
      const history = recorder?.framesView() ?? [];
      if (history.length > 0) {
        // Full-history backfill: replay the whole game so far (projected per cog),
        // so the scrubber spans turn 1 → now and every turn's feed/ticker is present.
        for (const f of history) backfillFrame(ws, f, cogId);
      } else {
        // No recorder (tests / static): head-first sync + recent activity backfill.
        const head = toSnapshot(runner.state);
        send(ws, { type: "snapshot", snapshot: cogId ? buildCogSnapshot(head, cogId) : head });
        for (const { turn, event } of runner.recentEvents()) send(ws, { type: "event", event, turn });
        if (cogId) {
          for (const e of hub?.list(cogId) ?? [])
            send(ws, { type: "actPrompt", cogId: e.cogId, turn: e.turn, phase: e.phase, content: e.content });
          for (const m of bus?.visibleTo(cogId) ?? []) send(ws, { type: "message", message: m });
        } else {
          for (const id of hub?.cogs() ?? [])
            for (const e of hub!.list(id))
              send(ws, { type: "actPrompt", cogId: e.cogId, turn: e.turn, phase: e.phase, content: e.content });
          for (const m of bus?.recent() ?? []) send(ws, { type: "message", message: m });
        }
      }
      send(ws, { type: "serverStatus", status: runner.currentStatus() });
      ws.on("close", () => {
        clients.delete(client);
        runner.setClientCount(clients.size);
      });
    });
  });

  const unsub = runner.onUpdate((msg) => {
    for (const c of clients) {
      if (c.cogId && msg.type === "snapshot") {
        send(c.ws, { type: "snapshot", snapshot: buildCogSnapshot(msg.snapshot, c.cogId) });
      } else {
        send(c.ws, msg);
      }
    }
  });

  // Act-prompt transparency: fan each entry out to the operator (global) + the acting cog.
  const unsubHub =
    hub?.onRecord((e) => {
      const frame: ServerMessage = { type: "actPrompt", cogId: e.cogId, turn: e.turn, phase: e.phase, content: e.content };
      for (const c of clients) if (c.cogId === null || c.cogId === e.cogId) send(c.ws, frame);
    }) ?? (() => {});

  // Negotiation chat: public to everyone; DMs only to sender + recipient.
  const unsubBus =
    bus?.onPost((m) => {
      const frame: ServerMessage = { type: "message", message: m };
      for (const c of clients) if (c.cogId === null || messageVisibleToCog(m, c.cogId)) send(c.ws, frame);
    }) ?? (() => {});

  return {
    close: () => {
      unsub();
      unsubHub();
      unsubBus();
      for (const c of clients) c.ws.close();
      wss.close();
    },
  };
}
