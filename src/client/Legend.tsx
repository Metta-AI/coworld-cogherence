// A key for the art icons: what each glyph means. Resources (the economy the
// HUD shows) and Actions (the three board verbs), so a spectator can read the
// game without prior knowledge.
import React from "react";
import { Icon, type IconName } from "./Icon";

const RESOURCES: ReadonlyArray<readonly [IconName, string]> = [
  ["heart", "Hearts — victory points"],
  ["energy", "Energy — currency"],
  ["coherence", "Coherence — the shared commons"],
];
const MINERALS: ReadonlyArray<IconName> = ["mineral-c", "mineral-o", "mineral-ge", "mineral-s"];
const ACTIONS: ReadonlyArray<readonly [IconName, string]> = [
  ["align", "Align — build / claim a tile"],
  ["exploit", "Exploit — scorched-earth cash-out"],
  ["deal", "Deal — trade / negotiate"],
];

export function Legend(): React.ReactElement {
  return (
    <div className="legend" data-testid="legend">
      <h2>Legend</h2>
      <div className="legend-group">
        <span className="legend-group-title">Resources</span>
        {RESOURCES.map(([name, label]) => (
          <span className="legend-item" key={name}>
            <Icon name={name} title={label} />
            {label}
          </span>
        ))}
        <span className="legend-item">
          {MINERALS.map((name) => (
            <Icon key={name} name={name} title={name} />
          ))}
          Minerals — C / O / Ge / S spell COGS
        </span>
      </div>
      <div className="legend-group">
        <span className="legend-group-title">Actions</span>
        {ACTIONS.map(([name, label]) => (
          <span className="legend-item" key={name}>
            <Icon name={name} title={label} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
