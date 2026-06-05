// URL <-> view mapping for the dashboard. Views switch by navigation (the page
// reloads and reconnects to the right ws endpoint), so this stays a pure parser.
export type View = "global" | "feed" | "cog";

export interface DashLocation {
  view: View;
  cogId: string | null;
  live: boolean;
}

export function parseLocation(loc: { pathname: string; search: string }): DashLocation {
  const params = new URLSearchParams(loc.search);
  const live = params.has("live");
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
