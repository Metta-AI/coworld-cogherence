import { describe, it, expect } from "vitest";
import { driftDirection } from "./coherence";
import type { GameState, Tile, CogId } from "./types";
import { key, neighbors } from "./hex";
import { COHERENCE_MAX } from "./constants";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral: "C", density: 1, density0: 1 });

const stateOf = (tiles: Tile[]): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of tiles) map[key(t.hex)] = t;
  return { turn: 1, phase: "upkeep", seed: 0, tiles: map, cogs: {}, cogOrder: [], log: [] };
};

const coh = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!.coherence;
const align = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!.alignment;

describe("driftDirection", () => {
  const at = (g: GameState, q: number, r: number): Tile => g.tiles[key({ q, r })]!;

  it("interior tile with majority-friendly neighbors points +1", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h) => tile(h.q, h.r, "A", 3));
    const g = stateOf([tile(0, 0, "A", 3), ...ns]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(1);
  });

  it("salient with minority-friendly neighbors points -1", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 2 ? "A" : "B", 3));
    const g = stateOf([tile(0, 0, "A", 3), ...ns]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(-1);
  });

  it("isolated tile (no in-board neighbors) erodes", () => {
    const g = stateOf([tile(0, 0, "A", 3)]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(-1);
  });

  it("a lone friendly pair sustains itself (each is the other's only neighbor)", () => {
    const g = stateOf([tile(0, 0, "A", 2), tile(1, 0, "A", 2)]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(1);
    expect(driftDirection(g, at(g, 1, 0))).toBe(1);
  });

  it("strict boundary: an even 3-of-6 split is NOT a majority and loses", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 3 ? "A" : "B", 3));
    const g = stateOf([tile(0, 0, "A", 3), ...ns]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(-1); // 3 same of 6 -> 6 > 6 is false
  });

  it("strict boundary: 4-of-6 is the first true majority and gains", () => {
    const ns = neighbors({ q: 0, r: 0 }).map((h, i) => tile(h.q, h.r, i < 4 ? "A" : "B", 3));
    const g = stateOf([tile(0, 0, "A", 3), ...ns]);
    expect(driftDirection(g, at(g, 0, 0))).toBe(1); // 4 same of 6 -> 8 > 6
  });
});
