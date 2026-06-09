// The live badge doubles as the operator console: clicking it opens a dropdown to
// pause/resume the turn loop or reset the game from turn 1. Modeled on ViewSwitcher
// (button + outside-click-dismissed menu). Only rendered when connected to a live game.
import React, { useEffect, useRef, useState } from "react";

export function LiveMenu({ paused }: { paused: boolean }): React.ReactElement {
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

  const post = (path: string): void => {
    void fetch(path, { method: "POST" });
    setOpen(false);
  };

  return (
    <div className="live-menu" ref={ref} data-testid="live-menu">
      <button
        type="button"
        className={`conn conn-live live-menu-button ${paused ? "is-paused" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="game controls"
        onClick={() => setOpen((o) => !o)}
      >
        {paused ? "❚❚ paused" : "● live"} <span className="lm-caret">▾</span>
      </button>
      {open && (
        <div className="lm-menu" role="menu">
          <button
            type="button"
            className="lm-row"
            role="menuitem"
            data-testid="lm-pause"
            onClick={() => post(paused ? "/resume" : "/pause")}
          >
            {paused ? "▶  Resume game" : "❚❚  Pause game"}
          </button>
          <div className="lm-divider" />
          <button type="button" className="lm-row lm-danger" role="menuitem" data-testid="lm-reset" onClick={() => post("/reset")}>
            ↻  Reset game
          </button>
        </div>
      )}
    </div>
  );
}
