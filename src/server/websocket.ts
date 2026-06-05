// Websocket fan-out: /global/ws gets full frames; /cog/:id/ws gets per-cog
// redacted snapshots. Head-first sync on connect (current snapshot + status) so
// the client renders immediately; the runner's onUpdate broadcasts thereafter.
// (Mid-game scrubber backfill is a later refinement.)
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { CogId } from "../shared/engine/types";
import type { ServerMessage } from "../shared/protocol";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot } from "./redact";
import type { GameRunner } from "./game-runner";
import type { ActPromptHub } from "./act-prompt-hub";
import type { MessageBus } from "./message-bus";
import { messageVisibleToCog } from "../shared/messages";

interface Client {
  ws: WebSocket;
  cogId: CogId | null; // null = global (full) view
}

const send = (ws: WebSocket, m: ServerMessage): void => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};

export function attachWebsockets(
  http: HttpServer,
  runner: GameRunner,
  hub?: ActPromptHub,
  bus?: MessageBus,
): { close: () => void } {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  http.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const m = path.match(/^\/cog\/([^/]+)\/ws$/);
    let cogId: CogId | null;
    if (path === "/global/ws") cogId = null;
    else if (m) cogId = m[1]!;
    else {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, cogId };
      clients.add(client);
      runner.setClientCount(clients.size);
      const head = toSnapshot(runner.state);
      send(ws, { type: "snapshot", snapshot: cogId ? buildCogSnapshot(head, cogId) : head });
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
