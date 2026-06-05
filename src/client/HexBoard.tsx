// Renders a GameSnapshot as an SVG hex lattice: fill = cog color, opacity = coherence.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor } from "./colors";

const SIZE = 14;

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
        const opacity = idx === null ? 0.12 : 0.25 + 0.75 * (t.coherence / snapshot.coherenceMax);
        return (
          <polygon
            key={`${t.q},${t.r}`}
            points={polygonPoints(hexCorners(c.x, c.y, SIZE))}
            fill={fill}
            fillOpacity={opacity}
            stroke="#000"
            strokeWidth={0.5}
          >
            {showMinerals && <title>{`${t.mineral} d${t.density} coh${t.coherence}`}</title>}
          </polygon>
        );
      })}
    </svg>
  );
}
