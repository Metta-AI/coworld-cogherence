// Pre-game lobby (live mode, before play starts): shows who's seated, lets
// anyone add a bot or join by name, and start the game once at least one cog is
// seated. Mirrors agricogla's lobby. Renders as a full-screen overlay over the
// (empty) board; the WS status drives the roster live.
import React, { useState } from "react";
import type { ServerStatus } from "../../shared/protocol";
import { cogColor } from "../colors";
import { Brand } from "../cg/atoms";

export function Lobby({
  status,
  onAddBot,
  onJoin,
  onStart,
  onRemove,
}: {
  status: ServerStatus;
  onAddBot: () => void;
  onJoin: (name: string) => void;
  onStart: () => void;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const roster = status.roster ?? [];
  const max = status.maxCogs ?? 6;
  const full = roster.length >= max;
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const joinUrl = typeof window !== "undefined" ? window.location.origin + "/" : "/";
  const copyJoin = (): void => {
    navigator.clipboard?.writeText(joinUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const join = (): void => {
    const n = name.trim();
    if (n) onJoin(n);
  };

  return (
    <div
      data-testid="lobby-overlay"
      style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(6,6,14,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 20px" }}
    >
      <Brand />
      <div className="cg-panel" style={{ width: 460, maxWidth: "94vw", maxHeight: "86vh", overflowY: "auto", padding: 0 }}>
        <div className="cg-panel-head" style={{ padding: "12px 16px", display: "flex", alignItems: "center" }}>
          <span className="cg-panel-title" style={{ fontSize: 15, flex: 1 }}>Lobby</span>
          <span className="cg-mono" style={{ fontSize: 11, color: "var(--muted)" }} data-testid="lobby-count">
            {roster.length}/{max}
          </span>
        </div>
        <div className="cg-panel-body" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {roster.map((r, i) => (
              <div
                key={r.id}
                data-testid="lobby-seat"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--panel-2)", borderLeft: `3px solid ${cogColor(i)}` }}
              >
                <span style={{ width: 11, height: 11, borderRadius: 3, background: cogColor(i), boxShadow: `0 0 8px ${cogColor(i)}`, flex: "none" }} />
                <span style={{ flex: 1, fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{r.name}</span>
                <span className="cg-mono" style={{ fontSize: 9, letterSpacing: "0.1em", color: r.bot ? "var(--heart)" : "var(--cyan, #5ad7ff)" }}>
                  {r.bot ? "BOT" : "HUMAN"}
                </span>
                <button
                  type="button"
                  aria-label={`remove ${r.name}`}
                  data-tip="remove from lobby"
                  onClick={() => onRemove(r.id)}
                  style={{ flex: "none", width: 20, height: 20, borderRadius: 6, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
            {roster.length === 0 && (
              <div className="cg-mono" style={{ fontSize: 12, color: "var(--muted)", padding: "8px 2px" }}>
                Empty table — add a bot or join to seat the first cog.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") join(); }}
              placeholder="your name"
              maxLength={24}
              data-testid="lobby-name"
              style={{ flex: 1, fontFamily: "var(--f-ui)", fontSize: 13, padding: "9px 11px", borderRadius: 8, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="button"
              data-testid="lobby-join"
              onClick={join}
              disabled={full || !name.trim()}
              style={{ padding: "9px 16px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", cursor: full || !name.trim() ? "default" : "pointer", opacity: full || !name.trim() ? 0.5 : 1 }}
            >
              Join
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="lobby-add-bot"
              onClick={onAddBot}
              disabled={full}
              style={{ flex: 1, padding: "10px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", cursor: full ? "default" : "pointer", opacity: full ? 0.5 : 1 }}
            >
              ＋ Add bot
            </button>
            <button
              type="button"
              data-testid="lobby-start"
              onClick={onStart}
              disabled={roster.length === 0}
              style={{ flex: 1, padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 8, border: "1px solid var(--heart)", background: roster.length === 0 ? "var(--panel-2)" : "var(--heart)", color: roster.length === 0 ? "var(--muted)" : "#1a0a12", cursor: roster.length === 0 ? "default" : "pointer", opacity: roster.length === 0 ? 0.5 : 1 }}
            >
              Start game ▶
            </button>
          </div>

          <button
            type="button"
            onClick={copyJoin}
            data-tip="click to copy"
            style={{ fontFamily: "var(--f-mono, monospace)", fontSize: 11, color: "var(--muted)", background: "none", border: "none", borderTop: "1px solid var(--border)", paddingTop: 11, textAlign: "left", cursor: "pointer", width: "100%" }}
          >
            Others join at <span style={{ color: "var(--cyan, #5ad7ff)", textDecoration: "underline" }}>{joinUrl}</span>
            {copied ? <span style={{ color: "var(--live, #4ade80)" }}> · copied!</span> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
