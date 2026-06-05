// Renders a GameSnapshot as an SVG hex lattice. Per tile: fill = owner color
// (neutral otherwise), brightness = coherence, and a two-line label showing the
// mineral it provides + a 0–10 coherence score.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor } from "./colors";

const SIZE = 14;

/** Scale raw coherence (0..coherenceMax) onto a 0–10 display score. */
const cohScore = (coherence: number, max: number): number =>
  Math.round((Math.max(0, Math.min(max, coherence)) / max) * 10);

export function HexBoard({
  snapshot,
  showMinerals = false,
}: {
  snapshot: GameSnapshot;
  showMinerals?: boolean;
}): React.ReactElement {
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
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} width="100%" style={{ background: "#0b0b12" }}>
      {snapshot.tiles.map((t, i) => {
        const c = centers[i]!;
        const idx = t.alignment != null ? indexById.get(t.alignment) ?? 0 : null;
        const fill = idx === null ? "var(--neutral)" : cogColor(idx);
        // Lighter as coherence rises, darker as it falls — a clear margin-of-dominance cue.
        const f = Math.max(0, Math.min(1, t.coherence / snapshot.coherenceMax));
        const opacity = 0.2 + 0.8 * f;
        const score = cohScore(t.coherence, snapshot.coherenceMax);
        return (
          <g key={`${t.q},${t.r}`}>
            <polygon
              points={polygonPoints(hexCorners(c.x, c.y, SIZE))}
              fill={fill}
              fillOpacity={opacity}
              stroke="#000"
              strokeWidth={0.5}
            >
              {showMinerals && <title>{`${t.mineral} d${t.density} coh${t.coherence}`}</title>}
            </polygon>
            <text
              className="tile-mineral"
              x={c.x}
              y={c.y - SIZE * 0.18}
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
            <text
              className="tile-coherence"
              x={c.x}
              y={c.y + SIZE * 0.42}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={SIZE * 0.42}
              fill="#fff"
              fillOpacity={0.85}
              stroke="#000"
              strokeWidth={0.35}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
