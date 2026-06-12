// Thin browser-WebSocket wrapper yielding raw ServerMessage strings to the feed.
// Reconnection lives in connectLiveFeed — this just surfaces the close event
// (a failed connect fires close too, so retry covers a server still booting).
import type { LiveSocket } from "./feed";

export function makeWorldSocket(url: string): LiveSocket {
  const ws = new WebSocket(url);
  return {
    onMessage(fn) {
      ws.addEventListener("message", (e) => fn(String((e as MessageEvent).data)));
    },
    onClose(fn) {
      ws.addEventListener("close", fn);
    },
    close() {
      ws.close();
    },
  };
}
