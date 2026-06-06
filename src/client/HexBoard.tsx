// Renders a GameSnapshot as an SVG hex lattice. Per tile: fill = owner color
// (neutral otherwise), brightness = coherence, and a luminous mineral gem icon
// sized by density (bigger gem = richer deposit). Hovering a tile shows a detail
// card: owner, coherence, mining, upkeep.
import React, { useRef, useState } from "react";
import type { GameSnapshot, TileSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor, cogName } from "./colors";

/** Hovered tile + the cursor position (relative to the board) to anchor the card. */
interface Hover {
  tile: TileSnapshot;
  x: number;
  y: number;
}

const SIZE = 14;
const UPKEEP_PER_TILE = 1;
const MINT_DIVISOR = 10;

// Each tile shows its mineral as a luminous gem icon (public/icons/transparent/),
// served from the absolute root (vite base is "/", so this works on nested routes).
// Richer deposits draw a bigger gem: ~45% larger per density level above 1.
const mineralIconSize = (density: number): number => SIZE * (1 + (density - 1) * 0.45);
const mineralIcon = (mineral: string): string => `/icons/transparent/mineral-${mineral.toLowerCase()}.png`;

const ownerIndex = (snapshot: GameSnapshot, id: string | null): number | null =>
  id == null ? null : snapshot.cogs.find((c) => c.id === id)?.index ?? null;

function TileTip({ tile, snapshot, x, y }: { tile: TileSnapshot; snapshot: GameSnapshot; x: number; y: number }): React.ReactElement {
  const idx = ownerIndex(snapshot, tile.alignment);
  const owner = idx === null ? "neutral" : cogName(idx);
  const mining = tile.alignment ? (tile.density * tile.coherence) / MINT_DIVISOR : 0;
  return (
    <div
      className="tile-tip"
      data-testid="tile-tip"
      style={{ left: x, top: y, ...(idx !== null ? { borderColor: cogColor(idx) } : {}) }}
    >
      <div className="tip-head">
        <span className="tip-coord">{`${tile.q},${tile.r}`}</span>
        <span className="tip-owner" style={idx !== null ? { color: cogColor(idx) } : undefined}>
          {owner}
        </span>
      </div>
      <dl className="tip-rows">
        <div>
          <dt>mineral</dt>
          <dd>{tile.mineral}</dd>
        </div>
        <div>
          <dt>coherence</dt>
          <dd>
            {tile.coherence}/{snapshot.coherenceMax}
          </dd>
        </div>
        <div>
          <dt>density</dt>
          <dd>{tile.density}</dd>
        </div>
        <div>
          <dt>mining</dt>
          <dd>{tile.alignment ? `${mining.toFixed(1)} ${tile.mineral}/turn` : "—"}</dd>
        </div>
        <div>
          <dt>upkeep</dt>
          <dd>{tile.alignment ? `${UPKEEP_PER_TILE} ⚡/turn` : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function HexBoard({
  snapshot,
  showMinerals = false,
}: {
  snapshot: GameSnapshot;
  showMinerals?: boolean;
}): React.ReactElement {
  const [hover, setHover] = useState<Hover | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const indexById = new Map(snapshot.cogs.map((c) => [c.id, c.index]));
  const centers = snapshot.tiles.map((t) => axialToPixel(t.q, t.r, SIZE));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const pad = SIZE * 2;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;

  // Anchor the detail card just off the cursor, flipping near the right/bottom edge.
  const showTip = (e: React.MouseEvent, tile: TileSnapshot): void => {
    const r = wrapRef.current?.getBoundingClientRect();
    const px = r ? e.clientX - r.left : 0;
    const py = r ? e.clientY - r.top : 0;
    const W = r?.width ?? 0;
    const H = r?.height ?? 0;
    const TIP_W = 176;
    const TIP_H = 132;
    const OFF = 16;
    const x = px + OFF + TIP_W > W ? Math.max(4, px - OFF - TIP_W) : px + OFF;
    const y = py + OFF + TIP_H > H ? Math.max(4, py - OFF - TIP_H) : py + OFF;
    setHover({ tile, x, y });
  };

  return (
    <div className="board-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} width="100%" style={{ background: "#0b0b12" }}>
        {snapshot.tiles.map((t, i) => {
          const c = centers[i]!;
          const idx = t.alignment != null ? indexById.get(t.alignment) ?? 0 : null;
          const fill = idx === null ? "var(--neutral)" : cogColor(idx);
          const f = Math.max(0, Math.min(1, t.coherence / snapshot.coherenceMax));
          const opacity = 0.2 + 0.8 * f;
          const hovered = hover?.tile === t;
          const isz = mineralIconSize(t.density); // bigger gem = richer deposit
          return (
            <g
              key={`${t.q},${t.r}`}
              onMouseEnter={(e) => showTip(e, t)}
              onMouseMove={(e) => showTip(e, t)}
              style={{ cursor: "pointer" }}
            >
              <polygon
                points={polygonPoints(hexCorners(c.x, c.y, SIZE))}
                fill={fill}
                fillOpacity={opacity}
                stroke={hovered ? "#fff" : "#000"}
                strokeWidth={hovered ? 1.4 : 0.5}
              >
                {showMinerals && <title>{`${t.mineral} d${t.density} coh${t.coherence}`}</title>}
              </polygon>
              <image
                className="tile-mineral"
                href={mineralIcon(t.mineral)}
                data-mineral={t.mineral}
                x={c.x - isz / 2}
                y={c.y - isz / 2}
                width={isz}
                height={isz}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      {hover && <TileTip tile={hover.tile} snapshot={snapshot} x={hover.x} y={hover.y} />}
    </div>
  );
}
