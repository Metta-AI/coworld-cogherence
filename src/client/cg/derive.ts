// Pure data helpers adapting the real GameSnapshot / event stream to the
// Cogherence neon-glass design-system panels. No React, no DOM.
//
// Frame alignment (see game-runner): a snapshot with turn T shows the board at the
// START of turn T — i.e. AFTER turn (T-1) resolved. So the events that PRODUCED the
// displayed board are stamped `turn = T-1`; the Resolve log / Auction / Orders all
// read `lastResolvedTurn(snapshot)`. Negotiation messages are stamped at their turn.
import type { GameSnapshot, TileSnapshot } from "../../shared/snapshot";
import type { TurnEvent } from "../../shared/engine/log";
import type { StampedEvent } from "../net/feed";

export const MINERALS = ["C", "O", "Ge", "S"] as const;
export type Mineral = (typeof MINERALS)[number];
export const MINERAL_NAME: Record<string, string> = { C: "Carbon", O: "Oxygen", Ge: "Germ", S: "Sulfur" };
export const MINERAL_COLOR: Record<string, string> = { C: "#b9f2ff", O: "#4d7cff", Ge: "#c061ff", S: "#ffc23c" };
/** The mineral's chip class (Ge keeps both letters lowercased). */
export const minClass = (m: string): string => (m === "Ge" ? "ge" : m.toLowerCase());

/** Resource / verb tones — mirror the CSS vars so derived markers stay in sync. */
export const TONE: Record<string, string> = {
  coherence: "#3ce0c0",
  energy: "#42d4f4",
  heart: "#ff4d9d",
  align: "#2ee6a0",
  exploit: "#ff5a2c",
  transfer: "#42d4f4",
  deal: "#ffc14d",
};

const DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
export const tileKey = (q: number, r: number): string => `${q},${r}`;
export const lastResolvedTurn = (snap: GameSnapshot): number => snap.turn - 1;

export type TileMap = Map<string, TileSnapshot>;
export function tileMap(snap: GameSnapshot): TileMap {
  const m: TileMap = new Map();
  for (const t of snap.tiles) m.set(tileKey(t.q, t.r), t);
  return m;
}
export function neighbors(q: number, r: number, map: TileMap): TileSnapshot[] {
  const out: TileSnapshot[] = [];
  for (const [dq, dr] of DIRS) {
    const n = map.get(tileKey(q + dq, r + dr));
    if (n) out.push(n);
  }
  return out;
}

export const setsOf = (t: { C: number; O: number; Ge: number; S: number }): number =>
  Math.min(t.C, t.O, t.Ge, t.S);

export interface Territory {
  tiles: number;
  fortresses: number;
  salients: number;
}
/** Per-cog territory shape: tiles held, fortresses (maxed coherence), and rotting
 *  salients (coherence>0 but minority-friendly neighbours, so they decay at Upkeep). */
export function territory(snap: GameSnapshot): Map<string, Territory> {
  const map = tileMap(snap);
  const out = new Map<string, Territory>();
  for (const c of snap.cogs) out.set(c.id, { tiles: 0, fortresses: 0, salients: 0 });
  for (const t of snap.tiles) {
    if (!t.alignment) continue;
    const s = out.get(t.alignment);
    if (!s) continue;
    s.tiles++;
    if (t.coherence >= snap.coherenceMax) s.fortresses++;
    else if (t.coherence > 0) {
      const nb = neighbors(t.q, t.r, map);
      const friendly = nb.filter((n) => n.alignment === t.alignment).length;
      if (friendly < Math.floor(nb.length / 2) + 1) s.salients++;
    }
  }
  return out;
}

export const rankedByHearts = (cogs: GameSnapshot["cogs"]): GameSnapshot["cogs"] =>
  [...cogs].sort((a, b) => b.hearts - a.hearts || a.index - b.index);
export const leaderIndex = (snap: GameSnapshot): number => (rankedByHearts(snap.cogs)[0]?.index ?? 0);

export interface AuctionInfo {
  winner: string | null;
  price: number;
  top: number;
  bids: [string, number][];
}
/** The Vickrey heart auction settled on `turn`, if any. */
export function auctionAt(events: StampedEvent[], turn: number): AuctionInfo | null {
  for (const e of events) {
    if (e.turn === turn && e.event.type === "auction") {
      const a = e.event;
      const top = a.bids.reduce((m, [, b]) => Math.max(m, b), 0);
      return { winner: a.winner, price: a.price, top, bids: a.bids };
    }
  }
  return null;
}
/** Cumulative energy paid for hearts up to and including `turn` (Vickrey clearing
 *  prices actually charged), total and per winning cog. */
export function heartSpend(events: StampedEvent[], turn: number): { total: number; byCog: Map<string, number> } {
  const byCog = new Map<string, number>();
  let total = 0;
  for (const e of events) {
    if (e.turn <= turn && e.event.type === "auction" && e.event.winner) {
      total += e.event.price;
      byCog.set(e.event.winner, (byCog.get(e.event.winner) ?? 0) + e.event.price);
    }
  }
  return { total, byCog };
}

/** Resolve-log events of `turn`, mint frames dropped (mint is implicit upkeep noise). */
export const eventsAt = (events: StampedEvent[], turn: number): TurnEvent[] =>
  events.filter((e) => e.turn === turn && e.event.type !== "mint").map((e) => e.event);

/** Tiles that flipped from an enemy on `turn` (capture with a prior owner) — the
 *  white dashed reveal ring on the lattice. */
export function flipTilesAt(events: StampedEvent[], turn: number): string[] {
  const out: string[] = [];
  for (const e of events)
    if (e.turn === turn && e.event.type === "capture" && e.event.from !== null && e.event.to !== null) out.push(e.event.tile);
  return out;
}
/** Tiles claimed from neutral on `turn` (capture with no prior owner). */
export function claimTilesAt(events: StampedEvent[], turn: number): string[] {
  const out: string[] = [];
  for (const e of events)
    if (e.turn === turn && e.event.type === "capture" && e.event.from === null && e.event.to !== null) out.push(e.event.tile);
  return out;
}
/** Tiles strip-mined on `turn` — the orange husk-flash reveal. */
export function exploitTilesAt(events: StampedEvent[], turn: number): string[] {
  const out: string[] = [];
  for (const e of events) if (e.turn === turn && e.event.type === "exploit") out.push(e.event.tile);
  return out;
}

export interface TileStatus {
  label: string;
  tone: string;
}
/** Classify a tile for the inspector: fortress / frontier / rotting salient / husk. */
export function tileStatus(t: TileSnapshot, map: TileMap, coherenceMax: number, ownerColor: string): TileStatus {
  const nb = neighbors(t.q, t.r, map);
  const friendly = t.alignment ? nb.filter((n) => n.alignment === t.alignment).length : 0;
  const threshold = Math.floor(nb.length / 2) + 1;
  if (!t.alignment) return { label: t.density === 0 ? "BARREN" : "NEUTRAL", tone: "var(--muted)" };
  if (t.coherence >= coherenceMax) return { label: "FORTRESS", tone: ownerColor };
  if (t.coherence === 0) return { label: "HUSK · rotted", tone: "var(--exploit)" };
  if (friendly < threshold) return { label: "ROTTING SALIENT", tone: "var(--exploit)" };
  return { label: "FRONTIER", tone: "var(--deal)" };
}
