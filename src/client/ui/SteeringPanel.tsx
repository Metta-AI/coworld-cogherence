// Operator steering for one Cog (live mode only): a persona/directive textarea
// prepended to the Cog's prompt next turn, and a pause toggle that benches it.
// Reads the current steering on mount and POSTs edits to the live server.
import React, { useEffect, useState } from "react";

type Saved = "idle" | "saving" | "saved";

export function SteeringPanel({ cogId }: { cogId: string }): React.ReactElement {
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

  return (
    <div className="panel steering" data-testid="steering">
      <h2>Operator steering</h2>
      <label className={`steer-toggle ${paused ? "is-paused" : ""}`}>
        <input type="checkbox" checked={paused} onChange={(e) => post({ paused: e.target.checked })} />
        <span>{paused ? "Benched — commits nothing" : "Active"}</span>
      </label>
      <textarea
        className="steer-persona"
        data-testid="steer-persona"
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        placeholder="Persona / directive — e.g. “play aggressively and betray Bob”. Prepended to this Cog's prompt next turn."
        rows={3}
      />
      <div className="steer-actions">
        <button type="button" onClick={() => post({ persona })}>
          Apply persona
        </button>
        <span className="steer-status">{saved === "saved" ? "✓ applied" : saved === "saving" ? "saving…" : ""}</span>
      </div>
    </div>
  );
}
