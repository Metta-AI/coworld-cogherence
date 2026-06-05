// Thin browser-WebSocket wrapper yielding raw ServerMessage strings to the feed.
// (Reconnect/backoff is a later refinement; the feed re-reads head-first on
// connect, so a fresh socket resyncs cleanly.)
import type { LiveSocket } from "./feed";

export function makeWorldSocket(url: string): LiveSocket {
  const ws = new WebSocket(url);
  return {
    onMessage(fn) {
      ws.addEventListener("message", (e) => fn(String((e as MessageEvent).data)));
    },
    close() {
      ws.close();
    },
  };
}
