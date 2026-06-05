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

interface Client {
  ws: WebSocket;
  cogId: CogId | null; // null = global (full) view
}

const send = (ws: WebSocket, m: ServerMessage): void => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};

export function attachWebsockets(http: HttpServer, runner: GameRunner): { close: () => void } {
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

  return {
    close: () => {
      unsub();
      for (const c of clients) c.ws.close();
      wss.close();
    },
  };
}
