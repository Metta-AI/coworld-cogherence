// The living mind — a luminous hex lattice. Pointy-top axial hexes (matching
// hex-layout.ts). Three modes:
//   coherence — glow intensity = coherence, hue = owning Cog; neutral is dim.
//   mineral   — fill = mineral hue by density; owner shown as a ring.
//   ownership — flat territory map; coherence printed on strong tiles.
// Reveal overlays: flips (white capture rings), exploited (orange husk flash).
// A focus `highlight` dims everyone but one Cog; clicking a tile selects it.
import React from "react";
import type { GameSnapshot, TileSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor } from "./colors";
import { MINERAL_COLOR, tileKey } from "./cg/derive";

export type LatticeMode = "coherence" | "mineral" | "ownership";

const SIZE = 26;
const BASE = import.meta.env.BASE_URL;
// Each tile carries a luminous neon-glass mineral gem (its deposit), sized by
// density — the at-a-glance resource indicator. In mineral mode the fill already
// encodes the mineral, so the gem is omitted there.
const mineralIcon = (m: string): string => `${BASE}icons/transparent/mineral-${m.toLowerCase()}.png`;
const gemSize = (density: number): number => SIZE * (0.52 + (Math.min(3, density) - 1) * 0.22);
const corners = (cx: number, cy: number): string => polygonPoints(hexCorners(cx, cy, SIZE));
/** A hex's corners pulled `f` of the way toward its center — the inner fortress sheen. */
const innerCorners = (cx: number, cy: number, f: number): string =>
  polygonPoints(hexCorners(cx, cy, SIZE).map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f })));

export function HexBoard({
  snapshot,
  mode = "coherence",
  selected = null,
  onSelect,
  flips = [],
  exploited = [],
  highlight = null,
  commonsRatio = 1,
}: {
  snapshot: GameSnapshot;
  mode?: LatticeMode;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  flips?: string[];
  exploited?: string[];
  /** Focus one Cog's territory (per-cog HUD): dim everyone else. */
  highlight?: string | null;
  /** 0..1 health of the Commons — scales the ambient core glow behind the lattice. */
  commonsRatio?: number;
}): React.ReactElement {
  const cohMax = snapshot.coherenceMax;
  const indexById = new Map(snapshot.cogs.map((c) => [c.id, c.index]));
  const colorOf = (id: string | null): string | null => (id != null ? cogColor(indexById.get(id) ?? 0) : null);

  const centers = snapshot.tiles.map((t) => axialToPixel(t.q, t.r, SIZE));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const pad = SIZE * 1.4;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const flipSet = new Set(flips);
  const expSet = new Set(exploited);

  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", overflow: "visible" }}
      onClick={() => onSelect?.(null)}
    >
      <defs>
        <radialGradient id="cg-core" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#3ce0c0" stopOpacity={0.1 + commonsRatio * 0.16} />
          <stop offset="55%" stopColor="#1a8f9e" stopOpacity={0.04} />
          <stop offset="100%" stopColor="#07070c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={w * 0.42} ry={h * 0.42} fill="url(#cg-core)" />

      {snapshot.tiles.map((t: TileSnapshot, i) => {
        const c = centers[i]!;
        const k = tileKey(t.q, t.r);
        const owner = t.alignment;
        const col = colorOf(owner);
        const f = Math.max(0, Math.min(1, t.coherence / cohMax));
        const dens = Math.min(3, t.density);
        const isSel = k === selected;

        let fill: string;
        let fillOp: number;
        let stroke: string;
        let strokeW = 1;
        let glow = 0;
        let glowCol = col ?? "#3ce0c0";
        let digit: number | null = null;
        let digitCol = "#06060c";

        if (mode === "mineral") {
          const mc = MINERAL_COLOR[t.mineral]!;
          fill = mc;
          fillOp = 0.14 + (dens / 3) * 0.5;
          stroke = owner ? col! : "#20202e";
          strokeW = owner ? 2 : 1;
          glow = dens * 1.2;
          glowCol = mc;
          if (dens === 0) {
            fill = "#15151f";
            fillOp = 1;
            glow = 0;
          }
        } else if (mode === "ownership") {
          if (owner) {
            fill = col!;
            fillOp = 0.82;
            stroke = "#07070c";
            strokeW = 1.4;
            if (t.coherence >= Math.ceil(cohMax * 0.4)) digit = t.coherence;
          } else {
            fill = "#14141e";
            fillOp = 1;
            stroke = "#1b1b28";
          }
        } else {
          // coherence
          if (owner) {
            fill = col!;
            fillOp = 0.1 + f * 0.82;
            stroke = col!;
            strokeW = 0.6 + f * 0.8;
            glow = f * 16;
            glowCol = col!;
            // The glow itself reads out coherence here, so no digit (most tiles max).
          } else {
            fill = "#13131d";
            fillOp = 1;
            stroke = "#1c1c29";
            strokeW = 1;
          }
        }
        if (highlight && owner !== highlight) {
          fillOp *= 0.34;
          glow *= 0.35;
          if (!owner) fillOp = 0.7;
        }

        const cn = corners(c.x, c.y);
        const filt = glow > 0 ? `drop-shadow(0 0 ${(2 + glow).toFixed(1)}px ${glowCol})` : "none";
        const sheen = mode === "coherence" && owner && t.coherence >= Math.ceil(cohMax * 0.6);
        return (
          <g
            key={k}
            className="cg-tile"
            data-tile={k}
            style={{ filter: filt, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(isSel ? null : k);
            }}
          >
            <polygon points={cn} fill={fill} fillOpacity={fillOp} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
            {sheen && (
              <polygon
                points={innerCorners(c.x, c.y, 0.55)}
                fill="#ffffff"
                fillOpacity={0.06 + f * 0.1}
                stroke="none"
              />
            )}
            {digit != null && (
              <text x={c.x} y={c.y + 4} textAnchor="middle" fontFamily="var(--f-mono)" fontSize="11" fontWeight="700" fill={digitCol} opacity="0.85">
                {digit}
              </text>
            )}
            {expSet.has(k) && (
              <g>
                <polygon points={cn} fill="none" stroke="#ff5a2c" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 8px #ff5a2c)" }} />
                <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize="15" fill="#ff5a2c">
                  ✺
                </text>
              </g>
            )}
            {flipSet.has(k) && (
              <polygon points={cn} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" style={{ filter: `drop-shadow(0 0 7px ${col ?? "#fff"})` }} />
            )}
            {isSel && <polygon points={cn} fill="none" stroke="#fff" strokeWidth="2.4" style={{ filter: "drop-shadow(0 0 6px #fff)" }} />}
          </g>
        );
      })}

      {/* Mineral gems — the per-tile resource indicator. A crisp top layer (no tile
          glow), shown in coherence mode where the fill encodes coherence not mineral. */}
      {mode === "coherence" &&
        snapshot.tiles.map((t, i) => {
          const k = tileKey(t.q, t.r);
          if (t.density <= 0 || expSet.has(k)) return null; // husks have no deposit; don't mask the exploit reveal
          const c = centers[i]!;
          const gz = gemSize(t.density);
          const dim = highlight && t.alignment !== highlight ? 0.45 : 0.92;
          return (
            <image
              key={`gem-${k}`}
              href={mineralIcon(t.mineral)}
              x={c.x - gz / 2}
              y={c.y - gz / 2}
              width={gz}
              height={gz}
              opacity={dim}
              preserveAspectRatio="xMidYMid meet"
              pointerEvents="none"
            />
          );
        })}
    </svg>
  );
}
