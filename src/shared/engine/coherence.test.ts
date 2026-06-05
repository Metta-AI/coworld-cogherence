import { describe, it, expect } from "vitest";
import { applyDrift } from "./coherence";
import type { GameState, Tile, CogId } from "./types";
import { key, neighbors } from "./hex";
import { COHERENCE_MAX } from "./constants";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral: "C", density: 1 });

const stateOf = (tiles: Tile[]): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of tiles) map[key(t.hex)] = t;
  return { turn: 1, phase: "upkeep", seed: 0, tiles: map, cogs: {}, cogOrder: [], log: [] };
};

const coh = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!.coherence;
const align = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!.alignment;

describe("applyDrift", () => {
  it("interior tile with majority-friendly neighbors gains +1", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h) => tile(h.q, h.r, "A", 3));
    const g = applyDrift(stateOf([tile(0, 0, "A", 3), ...ns]));
    expect(coh(g, 0, 0)).toBe(4);
  });

  it("caps at COHERENCE_MAX", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h) => tile(h.q, h.r, "A", COHERENCE_MAX));
    const g = applyDrift(stateOf([tile(0, 0, "A", COHERENCE_MAX), ...ns]));
    expect(coh(g, 0, 0)).toBe(COHERENCE_MAX);
  });

  it("salient with minority-friendly neighbors loses -1", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 2 ? "A" : "B", 3));
    const g = applyDrift(stateOf([tile(0, 0, "A", 3), ...ns]));
    expect(coh(g, 0, 0)).toBe(2);
  });

  it("isolated tile (no in-board neighbors) erodes", () => {
    const g = applyDrift(stateOf([tile(0, 0, "A", 3)]));
    expect(coh(g, 0, 0)).toBe(2);
  });

  it("floors at 0", () => {
    const g = applyDrift(stateOf([tile(0, 0, "A", 0)]));
    expect(coh(g, 0, 0)).toBe(0);
  });

  it("neutral tiles never drift, even surrounded by aligned tiles", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h) => tile(h.q, h.r, "A", 3));
    const g = applyDrift(stateOf([tile(0, 0, null, 3), ...ns]));
    expect(coh(g, 0, 0)).toBe(3);
    expect(align(g, 0, 0)).toBeNull();
  });

  it("is computed from a snapshot and does not mutate the input", () => {
    const input = stateOf([tile(0, 0, "A", 2), tile(1, 0, "A", 2)]);
    const g = applyDrift(input);
    expect(coh(g, 0, 0)).toBe(3); // each is the other's only in-board neighbor -> majority
    expect(coh(g, 1, 0)).toBe(3);
    expect(input.tiles[key({ q: 0, r: 0 })]!.coherence).toBe(2); // input untouched
    expect(input.tiles[key({ q: 1, r: 0 })]!.coherence).toBe(2);
  });

  it("strict boundary: an even 3-of-6 split is NOT a majority and loses", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 3 ? "A" : "B", 3));
    const g = applyDrift(stateOf([tile(0, 0, "A", 3), ...ns]));
    expect(coh(g, 0, 0)).toBe(2); // 3 same of 6 -> 6 > 6 is false -> -1
  });

  it("strict boundary: 4-of-6 is the first true majority and gains", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 4 ? "A" : "B", 3));
    const g = applyDrift(stateOf([tile(0, 0, "A", 3), ...ns]));
    expect(coh(g, 0, 0)).toBe(4); // 4 same of 6 -> 8 > 6 -> +1
  });
});
