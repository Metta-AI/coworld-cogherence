// Cogherence neon-glass atoms: each Cog is a luminous hexagonal *sigil* (a mind,
// not a body), mineral *chips* spell COGS, a *wallet* derives energy from a COGS
// set, *verb tags* color the board verbs, plus the brand and the four-phase strip.
import React, { useState } from "react";
import { publishTileHighlight } from "./tile-highlight";
import type { Treasury, Phase } from "../../shared/engine/types";
import { Icon, type IconName } from "../Icon";
import { cogColor, cogName } from "../colors";
import { MINERALS, MINERAL_NAME, minClass, setsOf } from "./derive";

/** Free text with any raw engine ids (cog0, cog1…) rendered as that Cog's colored
 *  display name — agents speak in ids on the wire; spectators read names. */
export function CogText({ text }: { text: string }): React.ReactElement {
  const parts = text.split(/\bcog(\d+)\b/g); // alternates [plain, seat-index, plain, …]
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} style={{ color: cogColor(Number(p)), fontWeight: 600 }}>
            {cogName(Number(p))}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** A real neon-glass game icon (heart / energy / coherence / logo / verbs). */
export function CGIcon({ name, size = 16, title }: { name: IconName; size?: number; title?: string }): React.ReactElement {
  return <Icon name={name} size={size} data-tip={title} />;
}

/** A tile address as a hoverable pill — hovering highlights the tile on the
 *  lattice (via the tile-highlight channel). */
export function TilePill({ k }: { k: string }): React.ReactElement {
  return (
    <span
      className="cg-tilepill"
      onMouseEnter={() => publishTileHighlight([k])}
      onMouseLeave={() => publishTileHighlight([])}
    >
      {k}
    </span>
  );
}

/** The energy badge — a glowing blue circle with the bolt, sized like a mineral chip. */
export function EnergyChip(): React.ReactElement {
  return (
    <span className="cg-min energy" style={{ filter: "none" }}>
      {/* the icon art is light — brightness(0) stamps it black on the white chip */}
      <span style={{ display: "inline-flex", filter: "brightness(0)" }}>
        <CGIcon name="energy" size={14} />
      </span>
    </span>
  );
}

/** A mineral chip — a glowing rounded square stamped with its letter (C/O/Ge/S). */
export function Mineral({ m, label }: { m: string; label?: boolean }): React.ReactElement {
  return (
    <span data-tip={`${MINERAL_NAME[m]} — one of the four COGS minerals`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className={`cg-min ${minClass(m)}`}>{m}</span>
      {label && (
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          {MINERAL_NAME[m]}
        </span>
      )}
    </span>
  );
}

export function Wallet({ treasury, energy, upkeep, income, expected }: { treasury: Treasury; energy: number; upkeep?: number; income?: number; expected?: Record<string, number> }): React.ReactElement {
  const sets = setsOf(treasury);
  const delta = income != null ? income - (upkeep ?? 0) : null;
  const tipRow = (label: string, val: number, sign = false): string =>
    `${label.padEnd(12)}${`${sign && val >= 0 ? "+" : ""}${val}e`.padStart(6)}`;
  const energyTip = [
    tipRow("energy stored", energy),
    ...(sets > 0 ? [tipRow(`convertible: ${sets} set${sets > 1 ? "s" : ""} ×10e`, sets * 10)] : []),
    ...(income != null ? [tipRow("minted last", income, true)] : []),
    ...(upkeep != null && upkeep > 0 ? [tipRow("bills /turn", -upkeep, true)] : []),
    ...(delta != null ? [tipRow("net /turn", delta, true)] : []),
  ].join("\n");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {MINERALS.map((m) => (
        <span
          key={m}
          data-tip={
            expected != null
              ? `${(MINERAL_NAME[m] ?? m).padEnd(11)}${String(treasury[m]).padStart(6)}\n${"mint /turn".padEnd(11)}${`+${(expected[m] ?? 0).toFixed(1)}`.padStart(6)}`
              : `${MINERAL_NAME[m]} in treasury: ${treasury[m]}`
          }
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          <span className={`cg-min ${minClass(m)}`}>{m}</span>
          <span className="cg-mono" style={{ fontSize: 12, fontWeight: 600, color: treasury[m] ? "var(--text)" : "var(--muted-2)" }}>
            {treasury[m]}
          </span>
        </span>
      ))}
      <span data-tip={energyTip} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <EnergyChip />
        <span className="cg-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--energy)" }}>
          {energy}
        </span>
        {delta != null && (
          <span className="cg-mono" style={{ fontSize: 9.5, fontWeight: 700, color: delta >= 0 ? "var(--coherence)" : "var(--exploit)" }}>
            {delta >= 0 ? "+" : ""}{delta}
          </span>
        )}
      </span>
    </div>
  );
}

/** A board-verb tag (align / exploit / transfer / bid …). */
export function VerbTag({ kind, children }: { kind: string; children: React.ReactNode }): React.ReactElement {
  return <span className={`cg-verb ${kind}`}>{children}</span>;
}

/** Copy text in any context: the async clipboard API needs HTTPS/localhost,
 *  and tailnet visitors arrive over plain HTTP — they get the textarea path. */
function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

/** The COGHERENCE wordmark — the gear-as-O lockup generated with nano-banana
 *  (see AGENTS.md), keyed to a transparent PNG so it drops onto the dark UI. */
export function Wordmark({ small = false }: { small?: boolean }): React.ReactElement {
  return (
    <img
      src={`${import.meta.env.BASE_URL}art/logo-wordmark.png`}
      alt="COGHERENCE"
      draggable={false}
      style={{ height: small ? 21 : 27, width: "auto", display: "block" }}
    />
  );
}

/** The brand: the gear-as-O COGHERENCE wordmark. CLICK copies the current
 *  view's PLAY LINK on the externally-reachable origin (/share-info — the
 *  Tailscale name when the server knows one, so the host doesn't hand out
 *  localhost) and flashes a "✓ copied" confirmation under the wordmark. */
export function Brand({ small = false }: { small?: boolean }): React.ReactElement {
  const [copied, setCopied] = useState<string | null>(null);
  const copyPlayLink = (): void => {
    void fetch("/share-info")
      .then((r) => r.json())
      .then((j: { origin: string | null }) => {
        const link = `${j.origin ?? window.location.origin}${window.location.pathname}`;
        copyText(link);
        setCopied(link);
        window.setTimeout(() => setCopied(null), 2200);
      });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="brand"
      data-tip="click to copy this view's shareable play link"
      onClick={copyPlayLink}
      onKeyDown={(e) => e.key === "Enter" && copyPlayLink()}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
    >
      <div>
        <Wordmark small={small} />
        {!small && copied && (
          <div className="cg-mono" style={{ fontSize: 9, color: "var(--coherence)", letterSpacing: "0.04em", marginTop: 1, whiteSpace: "nowrap" }}>
            ✓ copied {copied.replace(/^https?:\/\//, "")}
          </div>
        )}
      </div>
      {small && copied && (
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--coherence)", whiteSpace: "nowrap" }}>✓ copied</span>
      )}
    </div>
  );
}

const PHASES: { k: Phase; label: string }[] = [
  { k: "negotiate", label: "Negotiate" },
  { k: "commit", label: "Commit" },
  { k: "resolve", label: "Resolve" },
  { k: "auction", label: "Auction" },
  { k: "upkeep", label: "Upkeep" },
];
/** The four-phase strip with the current phase lit. */
export function PhaseStripCG({ phase, ready }: { phase: Phase; ready?: string }): React.ReactElement {
  const idx = PHASES.findIndex((p) => p.k === phase);
  return (
    <div className="cg-phases" data-testid="phase-strip">
      {PHASES.map((p, i) => (
        <div key={p.k} className={`cg-phase ${i < idx ? "done" : i === idx ? "current" : ""}`}>
          <span className="cg-phase-dot" />
          {p.label}
        </div>
      ))}
      {ready && (
        <span className="cg-mono" style={{ marginLeft: 10, fontSize: 9, color: "var(--muted)" }}>
          {ready}
        </span>
      )}
    </div>
  );
}
