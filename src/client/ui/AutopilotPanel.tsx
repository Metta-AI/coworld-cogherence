// Autopilot control for one Cog (live mode only): an enable toggle (off =
// benched, commits nothing) and a guidance/persona textarea prepended to the
// Cog's prompt next turn. Reads the current state on mount and POSTs edits to
// the live server. When the board is scrubbed off the latest turn the panel is
// read-only: it shows the CURRENT configuration (steering history isn't
// recorded per turn) without allowing edits.
import React, { useEffect, useState } from "react";

type Saved = "idle" | "saving" | "saved";

export function AutopilotPanel({ cogId, atLatest = true }: { cogId: string; atLatest?: boolean }): React.ReactElement {
  const [persona, setPersona] = useState("");
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState<Saved>("idle");

  useEffect(() => {
    let live = true;
    void fetch(`/cog/${cogId}/steering`)
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean }) => {
        if (!live) return;
        setPersona(s.persona);
        setPaused(s.paused);
      });
    return () => {
      live = false;
    };
  }, [cogId]);

  const post = (patch: { persona?: string; paused?: boolean }): void => {
    setSaved("saving");
    void fetch(`/cog/${cogId}/steering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean }) => {
        setPersona(s.persona);
        setPaused(s.paused);
        setSaved("saved");
      });
  };

  if (!atLatest) {
    return (
      <div className="panel steering" data-testid="autopilot">
        <h2>Autopilot</h2>
        <div className="cg-mono" style={{ fontSize: 10.5, color: paused ? "var(--exploit)" : "var(--coherence)" }}>
          {paused ? "○ disabled — benched" : "● enabled"}
        </div>
        <div className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "pre-wrap", marginTop: 6 }}>
          {persona || "no guidance set"}
        </div>
        <div className="cg-mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
          viewing a past turn — jump to the latest to steer
        </div>
      </div>
    );
  }

  return (
    <div className="panel steering" data-testid="autopilot">
      <h2>Autopilot</h2>
      <label className={`steer-toggle ${paused ? "is-paused" : ""}`}>
        <input type="checkbox" checked={!paused} onChange={(e) => post({ paused: !e.target.checked })} />
        <span>Enabled</span>
      </label>
      <textarea
        className="steer-persona"
        data-testid="steer-persona"
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        placeholder="Guidance / persona — e.g. “play aggressively and betray Bob”. Prepended to this Cog's prompt next turn."
        rows={3}
      />
      <div className="steer-actions">
        <button type="button" onClick={() => post({ persona })}>
          Send Guidance
        </button>
        <span className="steer-status">{saved === "saved" ? "✓ sent" : saved === "saving" ? "sending…" : ""}</span>
      </div>
    </div>
  );
}
