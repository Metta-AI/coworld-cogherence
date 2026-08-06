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
  // Match routes against the path WITHIN this instance: under the cogweb hub the page
  // is served at /<moduleId>/<instanceId>/…, so strip that prefix first (it is empty
  // at the standalone/coworld root). Without this, /feed and /cog/<id> never match
  // under the hub and the console always falls back to the global view — the symmetric
  // counterpart to liveFeedWsUrl hanging the ws off the same prefix.
  const path = loc.pathname.slice(instancePrefix(loc.pathname).length) || "/";
  // Coworld game-container client routes (GAME.md): the global viewer and a
  // per-slot fog-of-war view are LIVE; the replay viewer auto-plays and loops.
  if (path === "/client/global") return { view: "global", cogId: null, live: true };
  if (path === "/client/player") {
    const slot = Number(params.get("slot"));
    return { view: "cog", cogId: Number.isInteger(slot) && slot >= 0 ? `cog${slot}` : null, live: true };
  }
  if (path === "/client/replay") return { view: "global", cogId: null, live: false, replayLoop: true };
  const m = path.match(/^\/cog\/([^/]+)/);
  if (m) return { view: "cog", cogId: m[1]!, live };
  if (path.startsWith("/feed")) return { view: "feed", cogId: null, live };
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

/** The absolute, same-origin URL to navigate to a view, hung off the instance prefix
 *  so it stays under /<moduleId>/<instanceId>/ on the cogweb hub. viewHref alone is a
 *  ROOT-absolute path (/cog/<id>, /feed) — navigating to it under the hub escapes the
 *  prefix to the router root, whose first path segment isn't a module, so every
 *  Global/Feed/Cog link 404s. Prepending instancePrefix keeps it on this instance, and
 *  is a no-op at the standalone/coworld root. Always absolute because embedded previews
 *  block root-relative hrefs (see ViewSwitcher). */
export function navUrl(loc: { pathname: string; href: string }, view: View, cogId: string | null, live: boolean): string {
  return new URL(instancePrefix(loc.pathname) + viewHref(view, cogId, live), loc.href).href;
}

// cogherence is served at the instance ROOT in two of its three deployments —
// standalone (at "/") and the Coworld container (at "/", with the /client/* viewer
// shells) — but the cogweb hub serves every instance UNDER a
// /<moduleId>/<instanceId>/ prefix and routes its HTTP + websocket by that same
// prefix. So any host-absolute path the client builds (the live ws in particular)
// has to hang off whatever prefix the page is served under, or "/global/ws" hits
// the hub root — where no backend answers — and the console never connects.

// cogherence's own internal routes, as a suffix to strip off the page path to
// recover the serving prefix. The global view's route is the empty root, so a bare
// instance URL (the hub case) leaves the whole prefix intact.
const INTERNAL_ROUTE = /(?:\/client\/(?:global|player|replay)|\/cog\/[^/]+|\/feed)$/;

/** The prefix the page is served under: "" at the instance root (standalone +
 *  Coworld), or "/<moduleId>/<instanceId>" under the cogweb hub. */
export function instancePrefix(pathname: string): string {
  return pathname.replace(/\/+$/, "").replace(INTERNAL_ROUTE, "");
}

/** The feed WebSocket URL for the view the page is showing, hung off the instance
 *  prefix so the upgrade reaches the right instance under the hub and stays correct
 *  at the root. An https:// page must use wss:// (browsers block a mixed-content
 *  ws:// socket); local http dev uses ws://.
 *
 *  Two wire conventions: the @cogweb INSTANCE ws (the hub)
 *  is lenient and takes cogherence's per-view paths (`/global/ws`, `/cog/<id>/ws`);
 *  the Coworld HOST is strict and serves only `/global` (live + the per-slot agent
 *  view) and `/replay` (a recording), so the container's `/client/*` routes map there. */
export function liveFeedWsUrl(loc: { protocol: string; host: string; pathname: string }, view: View, cogId: string | null): string {
  const proto = loc.protocol === "https:" ? "wss" : "ws";
  const prefix = instancePrefix(loc.pathname);
  const coworld = loc.pathname.match(/\/client\/(global|player|replay)$/);
  if (coworld) return `${proto}://${loc.host}${prefix}${coworld[1] === "replay" ? "/replay" : "/global"}`;
  const endpoint = view === "cog" && cogId ? `/cog/${cogId}/ws` : "/global/ws";
  return `${proto}://${loc.host}${prefix}${endpoint}`;
}
