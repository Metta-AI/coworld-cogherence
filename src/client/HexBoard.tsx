// Renders a GameSnapshot as an SVG hex lattice. Per tile: fill = owner color
// (neutral otherwise), brightness = coherence, and a mineral letter. Hovering a
// tile shows a detail card: owner, coherence, mining, upkeep.
import React, { useState } from "react";
import type { GameSnapshot, TileSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor, cogName } from "./colors";

const SIZE = 14;
const UPKEEP_PER_TILE = 1;
const MINT_DIVISOR = 10;
// Richer deposits read as raised tiles: each density level above 1 enlarges the
// hex and lifts it a few px; denser tiles are drawn last so they sit on top.
const DENSITY_SCALE = 0.08;
const DENSITY_LIFT = 1.7;

const ownerIndex = (snapshot: GameSnapshot, id: string | null): number | null =>
  id == null ? null : snapshot.cogs.find((c) => c.id === id)?.index ?? null;

function TileTip({ tile, snapshot }: { tile: TileSnapshot | null; snapshot: GameSnapshot }): React.ReactElement {
  if (!tile) {
    return (
      <div className="tile-tip tile-tip-empty" data-testid="tile-tip">
        hover a tile
      </div>
    );
  }
  const idx = ownerIndex(snapshot, tile.alignment);
  const owner = idx === null ? "neutral" : cogName(idx);
  const mining = tile.alignment ? (tile.density * tile.coherence) / MINT_DIVISOR : 0;
  return (
    <div className="tile-tip" data-testid="tile-tip" style={idx !== null ? { borderColor: cogColor(idx) } : undefined}>
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
  const [hover, setHover] = useState<TileSnapshot | null>(null);
  const indexById = new Map(snapshot.cogs.map((c) => [c.id, c.index]));
  const centers = snapshot.tiles.map((t) => axialToPixel(t.q, t.r, SIZE));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const pad = SIZE * 2;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;

  return (
    <div className="board-wrap" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} width="100%" style={{ background: "#0b0b12" }}>
        {/* Draw thin deposits first and rich ones last, so denser (raised) tiles sit on top. */}
        {[...snapshot.tiles]
          .sort((a, b) => a.density - b.density)
          .map((t) => {
            const base = axialToPixel(t.q, t.r, SIZE);
            const size = SIZE * (1 + (t.density - 1) * DENSITY_SCALE);
            const cy = base.y - (t.density - 1) * DENSITY_LIFT; // lift richer tiles up
            const idx = t.alignment != null ? indexById.get(t.alignment) ?? 0 : null;
            const fill = idx === null ? "var(--neutral)" : cogColor(idx);
            const f = Math.max(0, Math.min(1, t.coherence / snapshot.coherenceMax));
            const opacity = 0.2 + 0.8 * f;
            const hovered = hover === t;
            return (
              <g key={`${t.q},${t.r}`} onMouseEnter={() => setHover(t)} style={{ cursor: "pointer" }}>
                <polygon
                  points={polygonPoints(hexCorners(base.x, cy, size))}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={hovered ? "#fff" : "#000"}
                  strokeWidth={hovered ? 1.4 : 0.5}
                >
                  {showMinerals && <title>{`${t.mineral} d${t.density} coh${t.coherence}`}</title>}
                </polygon>
                <text
                  className="tile-mineral"
                  x={base.x}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={SIZE * 0.5}
                  fontWeight={700}
                  fill="#fff"
                  stroke="#000"
                  strokeWidth={0.4}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {t.mineral}
                </text>
              </g>
            );
          })}
      </svg>
      <TileTip tile={hover} snapshot={snapshot} />
    </div>
  );
}
