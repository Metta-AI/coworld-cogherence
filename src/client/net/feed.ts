// Live feed: connect a ServerMessage socket and apply frames to a mutable store,
// notifying on each change. The store's snapshots feed the SAME renderers the
// replay viewer uses, so live and replay share one render path. Invalid inbound
// frames are dropped (validated at this boundary).
import { serverMessageSchema, type ServerStatus } from "../../shared/protocol";
import type { GameSnapshot } from "../../shared/snapshot";
import type { TurnEvent } from "../../shared/engine/log";

export interface FeedStore {
  snapshots: GameSnapshot[];
  events: TurnEvent[];
  status: ServerStatus | null;
}

/** Minimal socket surface (a fake is injected in tests; real one wraps WebSocket). */
export interface LiveSocket {
  onMessage(fn: (data: string) => void): void;
  close(): void;
}

export function connectLiveFeed(store: FeedStore, makeSocket: () => LiveSocket, onChange: () => void): () => void {
  const sock = makeSocket();
  sock.onMessage((data) => {
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return; // drop unparseable inbound
    }
    const parsed = serverMessageSchema.safeParse(raw);
    if (!parsed.success) return; // drop invalid inbound
    const m = parsed.data;
    if (m.type === "snapshot") store.snapshots.push(m.snapshot);
    else if (m.type === "event") store.events.push(m.event);
    else if (m.type === "serverStatus") store.status = m.status;
    // actPrompt frames are handled in Phase B5 (PromptsPanel)
    onChange();
  });
  return () => sock.close();
}
