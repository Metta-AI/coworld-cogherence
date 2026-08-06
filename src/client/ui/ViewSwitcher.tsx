// The dashboard view menu (polis-style dropdown): a button showing the current
// view, opening a menu of Global · Feed · one row per Cog (accent-dotted). Picking
// a row navigates (full reload → reconnect to that view's ws), preserving ?live.
import React, { useEffect, useRef, useState } from "react";
import { navUrl, type View } from "./nav";
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const activeCog = view === "cog" ? cogs.find((c) => c.id === cogId) : undefined;
  const label = view === "global" ? "Global" : view === "feed" ? "Feed" : activeCog ? cogName(activeCog.index) : "Cog";
  const labelColor = activeCog ? cogColor(activeCog.index) : "var(--text)";

  const row = (active: boolean, accent: string, name: string, href: string): React.ReactElement => (
    <a
      key={name}
      // href is the absolute same-origin URL from navUrl: it both hangs off the
      // instance prefix (so the link stays on this instance under the cogweb hub
      // instead of 404ing at the router root) and is absolute because embedded
      // previews (e.g. Claude Code's pane) block root-relative hrefs from navigating.
      href={href}
      className={`vs-row ${active ? "is-active" : ""}`}
      style={{ borderLeftColor: active ? accent : "transparent", ...(active ? { color: accent } : {}) }}
    >
      <span className="vs-dot" style={{ background: accent }} />
      {name}
    </a>
  );

  return (
    <div className="view-switcher" ref={ref} data-testid="view-switcher">
      <button
        type="button"
        className="vs-button"
        style={{ color: labelColor }}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="switch view"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="vs-current">{label}</span>
        <span className="vs-caret">▾</span>
      </button>
      {open && (
        <div className="vs-menu" role="menu">
          {row(view === "global", "var(--text)", "Global", navUrl(window.location, "global", null, live))}
          {row(view === "feed", "var(--accent)", "Feed", navUrl(window.location, "feed", null, live))}
          <div className="vs-divider" />
          {cogs.map((c) =>
            row(view === "cog" && cogId === c.id, cogColor(c.index), cogName(c.index), navUrl(window.location, "cog", c.id, live)),
          )}
        </div>
      )}
    </div>
  );
}
