// A small glowing line chart for a single series (hearts, energy, …) over turns.
import React from "react";

export function Sparkline({
  values,
  color,
  width = 150,
  height = 38,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}): React.ReactElement {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className="spark" viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--dim)">
          no history yet
        </text>
      </svg>
    );
  }
  const pad = 4;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i: number): number => pad + (i / (values.length - 1)) * (width - 2 * pad);
  const y = (v: number): number => height - pad - ((v - min) / span) * (height - 2 * pad);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]!);
  return (
    <svg width={width} height={height} className="spark" viewBox={`0 0 ${width} ${height}`}>
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  );
}
