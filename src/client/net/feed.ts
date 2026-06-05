// Live feed: connect a ServerMessage socket and apply frames to a mutable store,
// notifying on each change. The store's snapshots feed the SAME renderers the
// replay viewer uses, so live and replay share one render path. Invalid inbound
// frames are dropped (validated at this boundary).
import { serverMessageSchema, type ServerMessage, type ServerStatus } from "../../shared/protocol";
import type { GameSnapshot } from "../../shared/snapshot";
import type { TurnEvent } from "../../shared/engine/log";
import type { Message } from "../../shared/messages";

/** An actPrompt frame: what a Cog's model saw + decided this turn. */
export type ActPromptFrame = Extract<ServerMessage, { type: "actPrompt" }>;

export interface FeedStore {
  snapshots: GameSnapshot[];
  events: TurnEvent[];
  status: ServerStatus | null;
  actPrompts: Record<string, ActPromptFrame[]>;
  messages: Message[];
}

/** Minimal socket surface (a fake is injected in tests; real one wraps WebSocket). */
export interface LiveSocket {
  onMessage(fn: (data: string) => void): void;
  close(): void;
}

/** Apply one ServerMessage to the store. Shared by the live feed and replay load
 *  so a recorded game and a live game populate every panel identically. */
export function applyFrame(store: FeedStore, m: ServerMessage): void {
  if (m.type === "snapshot") store.snapshots.push(m.snapshot);
  else if (m.type === "event") store.events.push(m.event);
  else if (m.type === "serverStatus") store.status = m.status;
  else if (m.type === "actPrompt") {
    const list = (store.actPrompts[m.cogId] ??= []);
    list.push(m);
    if (list.length > 20) list.shift();
  } else if (m.type === "message") store.messages.push(m.message);
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
    applyFrame(store, parsed.data);
    onChange();
  });
  return () => sock.close();
}
