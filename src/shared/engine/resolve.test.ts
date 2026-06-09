import { describe, it, expect } from "vitest";
import { resolve } from "./resolve";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";
import type { Order } from "./orders";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number, mineral: Mineral = "C", density = 1): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral, density, density0: density });
const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });

const makeState = (opts: {
  tiles: Tile[];
  cogOrder: CogId[];
  treasuries?: Record<CogId, Treasury>;
  hearts?: Record<CogId, number>;
}): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of opts.tiles) map[key(t.hex)] = t;
  const cogs: Record<CogId, CogState> = {};
  opts.cogOrder.forEach((id, i) => {
    cogs[id] = { id, index: i, treasury: opts.treasuries?.[id] ?? T(), hearts: opts.hearts?.[id] ?? 0 };
  });
  return { turn: 1, phase: "resolve", seed: 0, tiles: map, cogs, cogOrder: opts.cogOrder, log: [] };
};
const tre = (g: GameState, id: CogId) => g.cogs[id]!.treasury;
const at = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!;

describe("resolve", () => {
  it("empty orders is a no-op (state unchanged, no auction winner)", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 4)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state, events } = resolve(s, {});
    expect(at(state, 0, 0).coherence).toBe(4);
    expect(tre(state, "A")).toEqual(T(1, 1, 1, 1));
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: null, price: 0 });
  });

  it("rejects the WHOLE order set if any order is illegal (the exploit does not happen)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3, "C", 2), tile(3, 0, null, 0)],
      cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) },
    });
    const orders: Record<CogId, Order[]> = {
      A: [ { type: "align", tile: "3,0", coherence: 1 }, { type: "exploit", tile: "0,0" } ], // (3,0) not adjacent to A -> illegal
    };
    const { state, events } = resolve(s, orders);
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 3, density: 2 }); // untouched
    expect(tre(state, "A")).toEqual(T(1, 1, 1, 1));
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
  });

  it("rejects a set whose Aligns exceed the spare coherence pool", () => {
    // A's other tile (2,0) at coherence 3 can spare only 2 (donors floor at 1)
    const s = makeState({ tiles: [tile(0, 0, null, 0), tile(1, 0, "A", 1), tile(2, 0, "A", 3)], cogOrder: ["A"], treasuries: { A: T(2, 2, 2, 2) } });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "0,0", coherence: 5 }] });
    expect(at(state, 0, 0).coherence).toBe(0); // unchanged
    expect(at(state, 2, 0).coherence).toBe(3); // nothing donated
    expect(events.some((e) => e.type === "rejected" && /coherence/.test(e.reason))).toBe(true);
  });

  it("rejects an align that commits less than 1 coherence (no free captures)", () => {
    // a programmatically-built 0-coherence align (bypassing the schema's positive() guard) on A's own
    // tile is a legal target, so the only reason to bounce it is the coherence floor.
    const s = makeState({ tiles: [tile(0, 0, "A", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "0,0", coherence: 0 }] });
    expect(at(state, 0, 0).coherence).toBe(3); // untouched
    expect(events.some((e) => e.type === "rejected" && /1 coherence/.test(e.reason))).toBe(true);
  });

  it("transfer moves minerals to the recipient (next-turn money) and costs the sender 1 energy + the sent minerals", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3)], cogOrder: ["A", "B"],
      treasuries: { A: T(2, 2, 2, 5), B: T() },
    });
    const { state } = resolve(s, { A: [{ type: "transfer", to: "B", mineral: "S", amount: 3 }] });
    expect(tre(state, "B").S).toBe(3);          // B received 3 S
    expect(tre(state, "A")).toEqual(T(1, 2, 2, 2)); // A: -3 S sent, -1 energy (one C) for the transfer fee
  });

  it("exploit mints 2*coherence*density, neutralizes the tile, halves density (windfall is next-turn money)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 4, "O", 3)], cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state } = resolve(s, { A: [{ type: "exploit", tile: "0,0" }] });
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0, density: 1 }); // floor(3*0.5)=1
    expect(tre(state, "A").O).toBe(24); // 2*4*3
  });

  it("exploit resolves BEFORE align: an exploited tile is neutral/0 when a rival's align lands, so the rival takes the husk", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5, "C", 2), tile(1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(1, 1, 1, 1) },
    });
    const { state } = resolve(s, {
      A: [{ type: "exploit", tile: "0,0" }],
      B: [{ type: "align", tile: "0,0", coherence: 3 }], // B owns adjacent (1,0), pool 3 -> legal + funded
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "B", coherence: 3 });
    expect(at(state, 1, 0).coherence).toBe(1); // B's donor tile paid for it: 4 -> 1
    expect(tre(state, "A").C).toBe(20); // 2*5*2 windfall
  });

  it("two Cogs contest a neutral tile: more donated coherence wins, coherence = margin", () => {
    const s = makeState({
      tiles: [tile(0, 0, null, 0), tile(1, 0, "A", 6), tile(-1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(2, 2, 2, 2), B: T(2, 2, 2, 2) },
    });
    const { state } = resolve(s, {
      A: [{ type: "align", tile: "0,0", coherence: 5 }],
      B: [{ type: "align", tile: "0,0", coherence: 3 }],
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 2 }); // 5 vs 3 -> margin 2
    expect(at(state, 1, 0).coherence).toBe(1); // A donated 5 of 6
    expect(at(state, -1, 0).coherence).toBe(1); // B donated 3 of 4
    expect(tre(state, "A")).toEqual(T(2, 2, 2, 2)); // aligns no longer cost energy
  });

  it("heart auction is second-price: highest bid wins, pays the second-highest", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(2, 0, "B", 1), tile(-2, 0, "C", 1)], cogOrder: ["A", "B", "C"],
      treasuries: { A: T(2, 2, 2, 2), B: T(2, 2, 2, 2), C: T(2, 2, 2, 2) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "bid", energy: 5 }], B: [{ type: "bid", energy: 7 }], C: [{ type: "bid", energy: 3 }],
    });
    expect(state.cogs.B!.hearts).toBe(1);
    expect(state.cogs.A!.hearts).toBe(0);
    expect(tre(state, "B")).toEqual(T(0, 1, 1, 1)); // charged the clearing price 5
    expect(tre(state, "A")).toEqual(T(2, 2, 2, 2)); // losers pay nothing
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "B", price: 5 });
  });

  it("a sole bidder pays nothing (reserve price 0)", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 1)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state, events } = resolve(s, { A: [{ type: "bid", energy: 4 }] });
    expect(state.cogs.A!.hearts).toBe(1);
    expect(tre(state, "A")).toEqual(T(1, 1, 1, 1)); // paid nothing
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 0 });
  });

  it("tie bids resolve to the lower cog index, who pays the tied price", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(2, 0, "B", 1)], cogOrder: ["A", "B"],
      treasuries: { A: T(2, 2, 2, 2), B: T(2, 2, 2, 2) },
    });
    const { state, events } = resolve(s, { A: [{ type: "bid", energy: 5 }], B: [{ type: "bid", energy: 5 }] });
    expect(state.cogs.A!.hearts).toBe(1);
    expect(state.cogs.B!.hearts).toBe(0);
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 5 });
  });

  it("integration: a siege + an auction in one turn", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 9), tile(1, 0, "B", 4), tile(2, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(4, 0, 0, 0), B: T(3, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "align", tile: "1,0", coherence: 7 }, { type: "bid", energy: 4 }], // siege B's tile + bid
      B: [{ type: "align", tile: "1,0", coherence: 2 }, { type: "bid", energy: 2 }], // reinforce from (2,0) + bid
    });
    expect(at(state, 1, 0)).toMatchObject({ alignment: "A", coherence: 1 }); // A force 7 vs B 4+2=6
    expect(at(state, 0, 0).coherence).toBe(2); // A's fortress paid the siege: 9 -> 2
    expect(at(state, 2, 0).coherence).toBe(2); // B's other tile funded the reinforcement: 4 -> 2
    expect(state.cogs.A!.hearts).toBe(1);
    expect(tre(state, "A")).toEqual(T(2, 0, 0, 0)); // only the 2e clearing price — aligns cost coherence
    expect(tre(state, "B")).toEqual(T(3, 0, 0, 0)); // losing bid charges nothing
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 2 });
  });

  it("an incoming transfer is next-turn money: it does not fund the recipient's same-turn spend", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(5, 1, 1, 1) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "align", tile: "0,0", coherence: 1 }], // A's only tile IS the target -> no other donors -> rejected
      B: [{ type: "transfer", to: "A", mineral: "C", amount: 4 }],
    });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
    expect(at(state, 0, 0).coherence).toBe(3);      // A's align did not happen
    expect(tre(state, "A")).toEqual(T(4, 0, 0, 0));  // but A still received B's transfer (usable next turn)
  });

  it("an exploited tile cannot fund Aligns: the set is rejected wholesale (the exploit does not happen)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5, "C", 4), tile(1, 0, null, 0)], cogOrder: ["A"],
      treasuries: { A: T() },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "exploit", tile: "0,0" }, { type: "align", tile: "1,0", coherence: 4 }],
    });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 5, density: 4 }); // exploit did NOT happen
  });

  it("align donations come from the largest other tiles first, each floored at 1", () => {
    const s = makeState({
      tiles: [tile(0, 0, null, 0), tile(1, 0, "A", 5), tile(2, 0, "A", 3)], cogOrder: ["A"],
      treasuries: { A: T(1, 1, 1, 1) },
    });
    const { state } = resolve(s, { A: [{ type: "align", tile: "0,0", coherence: 6 }] });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 6 });
    expect(at(state, 1, 0).coherence).toBe(1); // largest donor drained to the floor
    expect(at(state, 2, 0).coherence).toBe(1); // then the next one
  });

  it("an incumbent's coherence participates in a tie: equal force annihilates the tile to neutral (capture to null)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(1, 1, 1, 1) },
    });
    const { state, events } = resolve(s, {
      B: [{ type: "align", tile: "0,0", coherence: 3 }], // B force 3 == A's defending coherence 3
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events.some((e) => e.type === "capture" && e.tile === "0,0" && e.from === "A" && e.to === null)).toBe(true);
  });
});
