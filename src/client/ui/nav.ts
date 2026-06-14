// URL <-> view mapping for the dashboard. Views switch by navigation (the page
// reloads and reconnects to the right ws endpoint), so this stays a pure parser.
export type View = "global" | "feed" | "cog";

export interface DashLocation {
  view: View;
  cogId: string | null;
  live: boolean;
  /** Replay viewer that auto-plays and loops (the Coworld `/client/replay` surface). */
  replayLoop?: boolean;
}

export function parseLocation(loc: { pathname: string; search: string }): DashLocation {
  const params = new URLSearchParams(loc.search);
  const live = params.has("live");
  // Coworld game-container client routes (GAME.md): the global viewer and a
  // per-slot fog-of-war view are LIVE; the replay viewer auto-plays and loops.
  if (loc.pathname === "/client/global") return { view: "global", cogId: null, live: true };
  if (loc.pathname === "/client/player") {
    const slot = Number(params.get("slot"));
    return { view: "cog", cogId: Number.isInteger(slot) && slot >= 0 ? `cog${slot}` : null, live: true };
  }
  if (loc.pathname === "/client/replay") return { view: "global", cogId: null, live: false, replayLoop: true };
  const m = loc.pathname.match(/^\/cog\/([^/]+)/);
  if (m) return { view: "cog", cogId: m[1]!, live };
  if (loc.pathname.startsWith("/feed")) return { view: "feed", cogId: null, live };
  const v = params.get("view");
  if (v === "feed") return { view: "feed", cogId: null, live };
  if (v === "cog" && params.get("cog")) return { view: "cog", cogId: params.get("cog"), live };
  return { view: "global", cogId: null, live };
}

export function viewHref(view: View, cogId: string | null, live: boolean): string {
  const q = live ? "?live" : "";
  if (view === "feed") return `/feed${q}`;
  if (view === "cog" && cogId) return `/cog/${cogId}${q}`;
  return `/${q}`;
}
