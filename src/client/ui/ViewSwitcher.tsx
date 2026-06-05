// The dashboard nav: Global · Feed · one tab per Cog. Tabs are links (navigating
// reloads the page and reconnects to that view's ws endpoint).
import React from "react";
import { viewHref, type View } from "./nav";
import { cogColor, cogName } from "../colors";

export function ViewSwitcher({
  view,
  cogId,
  live,
  cogs,
}: {
  view: View;
  cogId: string | null;
  live: boolean;
  cogs: { id: string; index: number }[];
}): React.ReactElement {
  return (
    <nav className="view-switcher" data-testid="view-switcher">
      <a className={`tab ${view === "global" ? "tab-active" : ""}`} href={viewHref("global", null, live)}>
        Global
      </a>
      <a className={`tab ${view === "feed" ? "tab-active" : ""}`} href={viewHref("feed", null, live)}>
        Feed
      </a>
      <span className="tab-sep" />
      {cogs.map((c) => (
        <a
          key={c.id}
          className={`tab tab-cog ${view === "cog" && cogId === c.id ? "tab-active" : ""}`}
          href={viewHref("cog", c.id, live)}
        >
          <span className="tab-swatch" style={{ background: cogColor(c.index) }} />
          {cogName(c.index)}
        </a>
      ))}
    </nav>
  );
}
