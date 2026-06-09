// The living mind — a luminous hex lattice. Pointy-top axial hexes (matching
// hex-layout.ts). Three modes:
//   coherence — glow intensity = coherence, hue = owning Cog; neutral is dim.
//   mineral   — fill = mineral hue by density; owner shown as a ring.
//   ownership — flat territory map; coherence printed on strong tiles.
// Reveal overlays: flips (white capture rings), exploited (orange husk flash).
// A focus `highlight` dims everyone but one Cog; hovering a tile reports it.
// Navigation: scroll wheel zooms toward the cursor (1×–8×, via the viewBox),
// dragging pans while zoomed, double-click resets to fit.
import React, { useEffect, useRef, useState } from "react";
import type { GameSnapshot, TileSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor } from "./colors";
import { MINERAL_COLOR, tileKey } from "./cg/derive";

/** A viewBox rectangle in SVG user units. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const MAX_ZOOM = 8;
const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Axial neighbor direction across edge i (between corners i and i+1) of a
 *  pointy-top hex whose corner i sits at angle 60°·i − 30°: edge midpoints face
 *  0°, 60°, … 300° in screen space → E, SE, SW, W, NW, NE. */
const EDGE_DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export type LatticeMode = "coherence" | "mineral" | "ownership";

const SIZE = 26;
const BASE = import.meta.env.BASE_URL;
// Each tile carries a luminous neon-glass mineral gem (its deposit), sized by
// density — the at-a-glance resource indicator. In mineral mode the fill already
// encodes the mineral, so the gem is omitted there.
const mineralIcon = (m: string): string => `${BASE}icons/transparent/mineral-${m.toLowerCase()}.png`;
const gemSize = (density: number): number => SIZE * (0.34 + (Math.min(3, density) - 1) * 0.33);
const corners = (cx: number, cy: number): string => polygonPoints(hexCorners(cx, cy, SIZE));
/** A hex's corners pulled `f` of the way toward its center — the inner fortress sheen. */
const innerCorners = (cx: number, cy: number, f: number): string =>
  polygonPoints(hexCorners(cx, cy, SIZE).map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f })));

export function HexBoard({
  snapshot,
  mode = "coherence",
  onHoverTile,
  flips = [],
  exploited = [],
  highlight = null,
  commonsRatio = 1,
}: {
  snapshot: GameSnapshot;
  mode?: LatticeMode;
  /** Reports the tile under the cursor (with its client coordinates) on enter,
   *  and null when the cursor leaves the lattice — drives the hover inspector. */
  onHoverTile?: (key: string | null, at?: { x: number; y: number }) => void;
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

  // --- zoom + pan (viewBox navigation) ------------------------------------
  // `view` is the current viewBox while zoomed; null = fit the whole board.
  // Refs mirror the latest values for the natively-attached wheel listener
  // (React's root-delegated onWheel is passive, so preventDefault needs this).
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Box | null>(null);
  const base: Box = { x: minX, y: minY, w, h };
  const baseRef = useRef(base);
  baseRef.current = base;
  const viewRef = useRef(view);
  viewRef.current = view;
  const draggingRef = useRef(false);

  /** The on-screen scale (CSS px per SVG unit) of the current view, for converting
   *  pointer deltas; preserveAspectRatio="meet" letterboxes, hence the min(). */
  const screenScale = (rect: DOMRect, v: Box): number => Math.min(rect.width / v.w, rect.height / v.h) || 1;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const b = baseRef.current;
      const cur = viewRef.current ?? b;
      const f = Math.exp(-e.deltaY * 0.0015); // wheel/swipe down = zoom in
      const newW = clampN(cur.w * f, b.w / MAX_ZOOM, b.w);
      if (newW === cur.w) return;
      // Zoom toward the cursor: keep the SVG point under it fixed. Falls back to
      // the view's center when layout isn't measurable (degenerate rect).
      const rect = svg.getBoundingClientRect();
      let fx = 0.5;
      let fy = 0.5;
      if (rect.width && rect.height) {
        const s = screenScale(rect, cur);
        const padX = (rect.width - cur.w * s) / 2;
        const padY = (rect.height - cur.h * s) / 2;
        fx = clampN((e.clientX - rect.left - padX) / s / cur.w, 0, 1);
        fy = clampN((e.clientY - rect.top - padY) / s / cur.h, 0, 1);
      }
      const newH = cur.h * (newW / cur.w);
      const x = clampN(cur.x + fx * (cur.w - newW), b.x, b.x + b.w - newW);
      const y = clampN(cur.y + fy * (cur.h - newH), b.y, b.y + b.h - newH);
      setView(newW >= b.w ? null : { x, y, w: newW, h: newH });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const start = viewRef.current;
    if (e.button !== 0 || !start) return; // nothing to pan at full fit
    e.preventDefault();
    const b = baseRef.current;
    const s = screenScale(svgRef.current!.getBoundingClientRect(), start);
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent): void => {
      if (!draggingRef.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      if (!draggingRef.current) {
        draggingRef.current = true;
        document.body.style.cursor = "grabbing";
        onHoverTile?.(null); // the inspector hides while panning
      }
      setView({
        ...start,
        x: clampN(start.x - (ev.clientX - sx) / s, b.x, b.x + b.w - start.w),
        y: clampN(start.y - (ev.clientY - sy) / s, b.y, b.y + b.h - start.h),
      });
    };
    const up = (): void => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const vb = view ?? base;
  const flipSet = new Set(flips);
  const expSet = new Set(exploited);
  // Owner by hex key, for per-edge border classification in coherence mode.
  const ownerByKey = new Map(snapshot.tiles.map((t) => [tileKey(t.q, t.r), t.alignment]));

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", overflow: "visible", cursor: view ? "grab" : "default", touchAction: "none" }}
      onMouseLeave={() => onHoverTile?.(null)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setView(null)}
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
          // coherence — fill/glow encode the value; borders are drawn per edge below
          if (owner) {
            fill = col!;
            fillOp = 0.1 + f * 0.82;
            stroke = "none";
            strokeW = 0;
            glow = f * 16;
            glowCol = col!;
          } else {
            fill = "#13131d";
            fillOp = 1;
            stroke = "#1c1c29";
            strokeW = 1;
          }
        }

        // Per-edge territory borders (coherence mode): edges facing a different
        // owner / neutral / off-board draw a strong continuous line; edges shared
        // with a friendly tile draw a thin internal seam. (Per-hex outlines used to
        // scale with coherence, which left weak tiles with "missing" segments.)
        // Slightly inset so two rival borders on a shared edge sit side by side.
        let outerEdges = "";
        let innerEdges = "";
        if (mode === "coherence" && owner) {
          const pts = hexCorners(c.x, c.y, SIZE);
          for (let d = 0; d < 6; d++) {
            const [dq, dr] = EDGE_DIRS[d]!;
            const nOwner = ownerByKey.get(tileKey(t.q + dq, t.r + dr));
            const a = pts[d]!;
            const b = pts[(d + 1) % 6]!;
            const seg = `M${(c.x + (a.x - c.x) * 0.95).toFixed(1)},${(c.y + (a.y - c.y) * 0.95).toFixed(1)}L${(c.x + (b.x - c.x) * 0.95).toFixed(1)},${(c.y + (b.y - c.y) * 0.95).toFixed(1)}`;
            if (nOwner === owner) innerEdges += seg;
            else outerEdges += seg;
          }
        }

        let edgeDim = 1;
        if (highlight && owner !== highlight) {
          fillOp *= 0.34;
          glow *= 0.35;
          edgeDim = 0.35;
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
            style={{ filter: filt }}
            onMouseEnter={(e) => {
              if (!draggingRef.current) onHoverTile?.(k, { x: e.clientX, y: e.clientY });
            }}
          >
            <polygon points={cn} fill={fill} fillOpacity={fillOp} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
            {outerEdges && (
              <path d={outerEdges} fill="none" stroke={col!} strokeWidth={1.8} strokeLinecap="round" opacity={0.92 * edgeDim} />
            )}
            {innerEdges && (
              <path d={innerEdges} fill="none" stroke={col!} strokeWidth={0.6} strokeLinecap="round" opacity={0.3 * edgeDim} />
            )}
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
