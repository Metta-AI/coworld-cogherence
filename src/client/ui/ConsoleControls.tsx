// ConsoleControls — the right-hand operator strip for the unified GameTopBar's
// `trailing` slot (carried over from the old AppHeader): the elapsed-game clock,
// the live operator menu (pause/resume · new game · add cog), and the live/paused
// /replay badge. Control rides the @cogweb wire: each menu item sends a
// ClientMessage on the live socket (the bespoke HTTP routes are gone).
import React, { useEffect, useRef, useState } from "react";
import type { ClientMessage } from "@cogweb/protocol";
import type { ServerStatus } from "../../shared/protocol";

/** A 500ms ticking wall-clock so the elapsed-game readout stays current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return now;
}
const pad = (n: number): string => String(n).padStart(2, "0");
const hhmmss = (s: number): string => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/** Live operator/table controls: arm/disarm the auto-advance clock, start a fresh
 *  game, or seat another cog — a small dropdown beside the live badge. `paused`
 *  reflects the auto-advance clock being off (the @cogweb equivalent of paused). */
function OperatorMenu({ paused, send }: { paused: boolean; send: (m: ClientMessage) => void }): React.ReactElement {
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
  const item = (label: string, tip: string, onClick: () => void): React.ReactElement => (
    <button
      type="button"
      className="vs-row"
      data-tip={tip}
      onClick={() => {
        onClick();
        setOpen(false);
      }}
      style={{ borderLeftColor: "transparent", textAlign: "left", width: "100%" }}
    >
      {label}
    </button>
  );
  return (
    <div className="view-switcher" ref={ref} data-testid="operator-menu">
      <button
        type="button"
        className="vs-button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="operator controls"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="vs-current" style={{ fontSize: 14, lineHeight: 1 }}>
          ⚙
        </span>
      </button>
      {open && (
        <div className="vs-menu" role="menu" style={{ right: 0 }}>
          {item(paused ? "▶ Resume" : "❚❚ Pause", "arm / disarm the auto-advance clock", () => send({ type: "setAutoAdvance", on: paused }))}
          {item("↻ New game", "restart from turn 1 (keeps the roster)", () => send({ type: "reset" }))}
          {item("＋ Add cog", "open a new seat for a bot or player", () => send({ type: "addSeat" }))}
        </div>
      )}
    </div>
  );
}

export function ConsoleControls({
  status,
  connected,
  live,
  paused,
  send,
}: {
  status: ServerStatus | null;
  connected: boolean;
  live: boolean;
  paused: boolean;
  send: (m: ClientMessage) => void;
}): React.ReactElement {
  const now = useNow();
  const elapsedAnchor = paused ? status?.pausedAt ?? now : now;
  const gameSecs =
    connected && status?.startedAt != null
      ? Math.max(0, Math.floor((elapsedAnchor - status.startedAt - (status.pausedAccumMs ?? 0)) / 1000))
      : null;

  return (
    <>
      {gameSecs !== null && (
        <span className="cg-clock" data-tip="elapsed game time">
          <em>game</em>
          <b>{hhmmss(gameSecs)}</b>
        </span>
      )}
      {live && connected && <OperatorMenu paused={paused} send={send} />}
      {connected ? (
        <span className={`conn conn-live ${paused ? "is-paused" : ""}`} data-testid="live-badge">
          {paused ? "❚❚ paused" : "● live"}
        </span>
      ) : (
        <span className="cg-live cg-replay">▷ REPLAY</span>
      )}
    </>
  );
}
