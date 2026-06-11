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
    cogs[id] = { id, index: i, name: id, treasury: opts.treasuries?.[id] ?? T(), hearts: opts.hearts?.[id] ?? 0 };
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
      A: [ { type: "align", tile: "9,9", force: 1 }, { type: "exploit", tile: "0,0" } ], // (9,9) off-board -> illegal
    };
    const { state, events } = resolve(s, orders);
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 3, density: 2 }); // untouched
    expect(tre(state, "A")).toEqual(T(1, 1, 1, 1));
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
  });

  it("rejects an align above the force cap (programmatic orders bypass the schema)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3)], cogOrder: ["A"], treasuries: { A: T(11, 11, 11, 11) },
    });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "0,0", force: 11 }] });
    expect(at(state, 0, 0).coherence).toBe(3); // untouched
    expect(events.some((e) => e.type === "rejected" && /force cap/.test(e.reason))).toBe(true);
  });

  it("an align bills force² + distance²: reach is quadratically expensive", () => {
    // A's only tile is (0,0); the neutral target (3,0) is 3 hexes out ->
    // force 4 bills 16 + 9 = 25e, charged in full.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(3, 0, null, 0, "S", 2)],
      cogOrder: ["A"], treasuries: { A: T(25, 0, 0, 0) },
    });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "3,0", force: 4 }] });
    expect(at(state, 3, 0)).toMatchObject({ alignment: "A", coherence: 4 }); // the committed force arrives
    expect(at(state, 0, 0).coherence).toBe(5); // no coherence is ever drained
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // billed the full 25e
    expect(events.some((e) => e.type === "capture" && e.tile === "3,0" && e.coherence === 4 && e.spent === 25)).toBe(true);
  });

  it("the k-th Align in a turn bills k×10e extra — first free, surcharge buys no force", () => {
    // two adjacent force-1 claims (2e each): total = 2 + (2 + 10) = 14e
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, null, 0), tile(-1, 0, null, 0)],
      cogOrder: ["A"], treasuries: { A: T(14, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      A: [
        { type: "align", tile: "1,0", force: 1 },
        { type: "align", tile: "-1,0", force: 1 },
      ],
    });
    expect(at(state, 1, 0)).toMatchObject({ alignment: "A", coherence: 1 });
    expect(at(state, -1, 0)).toMatchObject({ alignment: "A", coherence: 1 }); // same force — the tax bought none
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // 2 + 12 charged
    expect(events.some((e) => e.type === "capture" && e.tile === "-1,0" && e.spent === 12)).toBe(true);
  });

  it("a set that cannot cover the repeat-align surcharge is rejected", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, null, 0), tile(-1, 0, null, 0)],
      cogOrder: ["A"], treasuries: { A: T(13, 0, 0, 0) }, // 1e short of 2 + 12
    });
    const { state, events } = resolve(s, {
      A: [
        { type: "align", tile: "1,0", force: 1 },
        { type: "align", tile: "-1,0", force: 1 },
      ],
    });
    expect(at(state, 1, 0).alignment).toBeNull();
    expect(events.some((e) => e.type === "rejected" && e.cog === "A" && /afford/.test(e.reason))).toBe(true);
  });

  it("an align whose cost exceeds the 100e reach cap is rejected", () => {
    // force 1 at distance 10 -> 1 + 100 = 101e -> out of reach
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(10, 0, null, 0)],
      cogOrder: ["A"], treasuries: { A: T(101, 0, 0, 0) },
    });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "10,0", force: 1 }] });
    expect(at(state, 10, 0).alignment).toBeNull();
    expect(tre(state, "A")).toEqual(T(101, 0, 0, 0)); // nothing charged
    expect(events.some((e) => e.type === "rejected" && /out of reach/.test(e.reason))).toBe(true);
  });

  it("rejects an align that commits less than 1 force (no free captures)", () => {
    // a programmatically-built 0-force align (bypassing the schema's positive() guard) on A's own
    // tile is a legal target, so the only reason to bounce it is the force floor.
    const s = makeState({ tiles: [tile(0, 0, "A", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state, events } = resolve(s, { A: [{ type: "align", tile: "0,0", force: 0 }] });
    expect(at(state, 0, 0).coherence).toBe(3); // untouched
    expect(events.some((e) => e.type === "rejected" && /1 force/.test(e.reason))).toBe(true);
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

  it("exploit mints floor(10·coherence·density) of the MINERAL; density drops by coherence/10", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 4, "O", 3)], cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state } = resolve(s, { A: [{ type: "exploit", tile: "0,0" }] });
    // scarring scales with the order cashed: 3 − 4/10 = 2.6 (a float)
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(at(state, 0, 0).density).toBeCloseTo(2.6, 5);
    expect(tre(state, "A").O).toBe(120); // floor(10·4·3)
  });

  it("a deposit scarred below density 1 collapses to 0 — too thin to mine again", () => {
    // coherence 9 grinds 0.9 off a 1.5 deposit -> 0.6 -> snaps to 0
    const s = makeState({
      tiles: [tile(0, 0, "A", 9, "S", 1.5)], cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state } = resolve(s, { A: [{ type: "exploit", tile: "0,0" }] });
    expect(at(state, 0, 0).density).toBe(0);
    expect(tre(state, "A").S).toBe(90); // 10·9·⌊1.5⌋ — the DISPLAYED density pays, never hidden fractions
  });

  it("exploit resolves BEFORE align: an exploited tile is neutral/0 when a rival's align lands, so the rival takes the husk", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5, "C", 2), tile(1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(10, 0, 0, 0) },
    });
    const { state } = resolve(s, {
      A: [{ type: "exploit", tile: "0,0" }],
      B: [{ type: "align", tile: "0,0", force: 3 }], // bills 9 + 1 = 10e; force 3 lands on the husk
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "B", coherence: 3 });
    expect(at(state, 1, 0).coherence).toBe(4); // coherence is never drained now
    expect(tre(state, "B")).toEqual(T(0, 0, 0, 0)); // the full 10e charged
    expect(tre(state, "A").C).toBe(100); // 10*5*2 windfall
  });

  it("a contested neutral tile goes to the larger arriving force; both pay in full", () => {
    // both adjacent (d1): A force 3 bills 10e; B force 2 bills 5e -> A wins, margin 1
    const s = makeState({
      tiles: [tile(0, 0, null, 0), tile(1, 0, "A", 6), tile(-1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(10, 0, 0, 0), B: T(5, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "align", tile: "0,0", force: 3 }],
      B: [{ type: "align", tile: "0,0", force: 2 }],
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 1 }); // 3 vs 2 -> margin 1
    expect(at(state, 1, 0).coherence).toBe(6); // coherence untouched
    expect(at(state, -1, 0).coherence).toBe(4);
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // charged the committed 10e
    expect(tre(state, "B")).toEqual(T(0, 0, 0, 0)); // losers still spent what they committed
    expect(events.some((e) => e.type === "capture" && e.tile === "0,0" && e.spent === 10)).toBe(true);
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

  it("a sole bidder pays the 1e reserve — hearts are never free", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 1)], cogOrder: ["A"], treasuries: { A: T(4, 0, 0, 0) } });
    const { state, events } = resolve(s, { A: [{ type: "bid", energy: 4 }] });
    expect(state.cogs.A!.hearts).toBe(1);
    expect(tre(state, "A")).toEqual(T(3, 0, 0, 0)); // paid the reserve
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 1 });
  });

  it("a cog holding no tiles cannot win the heart auction", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1)], cogOrder: ["A", "B"],
      treasuries: { A: T(3, 0, 0, 0), B: T(9, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "bid", energy: 2 }],
      B: [{ type: "bid", energy: 9 }], // off the board -> ineligible, bid ignored
    });
    expect(state.cogs.A!.hearts).toBe(1);
    expect(state.cogs.B!.hearts).toBe(0);
    expect(tre(state, "B")).toEqual(T(9, 0, 0, 0)); // charged nothing
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 1, bids: [["A", 2]] });
  });

  it("tied bids go to the FIRST bidder (commit order), who pays the tied price", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(2, 0, "B", 1)], cogOrder: ["A", "B"],
      treasuries: { A: T(2, 2, 2, 2), B: T(2, 2, 2, 2) },
    });
    const orders = { A: [{ type: "bid", energy: 5 } as const], B: [{ type: "bid", energy: 5 } as const] };
    const { state, events } = resolve(s, orders, ["B", "A"]); // B locked its commit first
    expect(state.cogs.B!.hearts).toBe(1);
    expect(state.cogs.A!.hearts).toBe(0);
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "B", price: 5 });
  });

  it("with no commit order, tie bids fall back to seat order", () => {
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
    // A throws 50e at B's coh-4 tile (d1 -> arrives 7); B reinforces it with 4e
    // (own tile, d0 -> +2): defense 4+2 = 6 < 7 -> flips to A at margin 1.
    const s = makeState({
      tiles: [tile(0, 0, "A", 9), tile(1, 0, "B", 4), tile(2, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(56, 0, 0, 0), B: T(6, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "align", tile: "1,0", force: 7 }, { type: "bid", energy: 4 }], // d1: bills 49 + 1 = 50e
      B: [{ type: "align", tile: "1,0", force: 2 }, { type: "bid", energy: 2 }], // own tile: bills 4e
    });
    expect(at(state, 1, 0)).toMatchObject({ alignment: "A", coherence: 1 }); // 7 vs 4+2
    expect(at(state, 0, 0).coherence).toBe(9); // A's fortress is untouched — sieges cost energy now
    expect(at(state, 2, 0).coherence).toBe(4); // B's other tile too
    expect(state.cogs.A!.hearts).toBe(1);
    expect(tre(state, "A")).toEqual(T(4, 0, 0, 0)); // 50e siege + 2e clearing price
    expect(tre(state, "B")).toEqual(T(2, 0, 0, 0)); // 4e reinforcement; losing bid charges nothing
    expect(events.find((e) => e.type === "auction")).toMatchObject({ winner: "A", price: 2 });
  });

  it("an incoming transfer is next-turn money: it does not fund the recipient's same-turn spend", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(5, 1, 1, 1) },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "align", tile: "0,0", force: 1 }], // a 1e bill with an empty wallet -> unaffordable -> rejected
      B: [{ type: "transfer", to: "A", mineral: "C", amount: 4 }],
    });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
    expect(at(state, 0, 0).coherence).toBe(3);      // A's align did not happen
    expect(tre(state, "A")).toEqual(T(4, 0, 0, 0));  // but A still received B's transfer (usable next turn)
  });

  it("an exploit windfall cannot fund the same turn's Aligns (next-turn money): the set is rejected wholesale", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5, "C", 4), tile(1, 0, "B", 1)], cogOrder: ["A", "B"],
      treasuries: { A: T() },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "exploit", tile: "0,0" }, { type: "align", tile: "1,0", force: 2 }],
    });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 5, density: 4 }); // exploit did NOT happen
    expect(at(state, 1, 0)).toMatchObject({ alignment: "B", coherence: 1 });
  });

  it("abandon returns the tile to neutral and refunds its coherence as energy (next-turn money)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5, "C", 2), tile(1, 0, "A", 2)], cogOrder: ["A"],
      treasuries: { A: T(0, 3, 0, 0) }, // O is most abundant -> the refund lands there
    });
    const { state, events } = resolve(s, { A: [{ type: "abandon", tile: "0,0" }] });
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0, density: 2 }); // no scarring
    expect(tre(state, "A")).toEqual(T(0, 8, 0, 0)); // +5 O (worth exactly +5e as singles)
    expect(events).toContainEqual({ type: "abandon", cog: "A", tile: "0,0", refund: 5 });
  });

  it("abandoning a tile you don't own rejects the whole set", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 3), tile(5, 0, "B", 2)], cogOrder: ["A", "B"] });
    const { state, events } = resolve(s, { A: [{ type: "abandon", tile: "5,0" }] });
    expect(at(state, 5, 0)).toMatchObject({ alignment: "B", coherence: 2 });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
  });

  it("an abandon refund cannot fund the same turn's Aligns (the abandon does not happen)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "B", 1)], cogOrder: ["A", "B"], treasuries: { A: T() },
    });
    const { state, events } = resolve(s, {
      A: [{ type: "abandon", tile: "0,0" }, { type: "align", tile: "1,0", force: 2 }],
    });
    expect(events.some((e) => e.type === "rejected" && e.cog === "A")).toBe(true);
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 5 });
  });

  it("reinforcing your own tile is distance 0: force f bills f²", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 2)], cogOrder: ["A"], treasuries: { A: T(9, 0, 0, 0) },
    });
    const { state } = resolve(s, { A: [{ type: "align", tile: "0,0", force: 3 }] });
    expect(at(state, 0, 0)).toMatchObject({ alignment: "A", coherence: 5 }); // standing 2 + arriving 3
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // billed the full 9e
  });

  it("an incumbent's coherence participates in a tie: equal force annihilates the tile to neutral (capture to null)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "B", 4)], cogOrder: ["A", "B"],
      treasuries: { A: T(), B: T(10, 0, 0, 0) },
    });
    const { state, events } = resolve(s, {
      B: [{ type: "align", tile: "0,0", force: 3 }], // bills 10e; 3 == A's defending coherence 3
    });
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events.some((e) => e.type === "capture" && e.tile === "0,0" && e.from === "A" && e.to === null)).toBe(true);
  });
});
