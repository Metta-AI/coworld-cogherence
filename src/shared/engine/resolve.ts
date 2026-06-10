// The Resolve phase: all Cogs' Commit-phase orders execute simultaneously in a
// single LOCKED sequence — validate+budget, sealed second-price heart auction
// (reserve 1e; only cogs holding ground may bid), charge, exploits/abandons,
// align funding + tug-of-war, then assemble next-turn treasuries. Align funding
// splits by target: settling NEUTRAL ground is paid in energy (that is what the
// starting bank is for); Aligns against standing alignments are paid in
// COHERENCE transferred out of the aligner's other tiles (largest first, donors
// floored at 1). Pure: the input GameState is never mutated.
//
// Two invariants drive the design:
//  - chargeEnergy is monotonic (affordable iff maxEnergy >= need), so a Cog that
//    can afford its worst-case spend can always afford its lower actual spend.
//  - Windfalls (exploit) and incoming transfers are NEXT-TURN money: they are
//    added AFTER charging, so they cannot fund this turn's spend.

import type { GameState, CogId, HexKey, Mineral, Treasury, CogState } from "./types";
import { MINERALS } from "./types";
import { chargeEnergy, maxEnergy } from "./energy";
import { resolveTile } from "./coherence";
import { isLegalAlignTarget, isOwn } from "./orders";
import type { Order } from "./orders";
import { EXPLOIT_MULT, EXPLOIT_DENSITY, TRANSFER_FEE } from "./constants";

/** Events emitted by a Resolve phase (for the turn log / replay). */
export type ResolveEvent =
  | { type: "rejected"; cog: CogId; reason: string }
  | { type: "transfer"; from: CogId; to: CogId; mineral: Mineral; amount: number }
  | { type: "exploit"; cog: CogId; tile: HexKey; mineral: Mineral; minted: number }
  | { type: "abandon"; cog: CogId; tile: HexKey; refund: number }
  | { type: "capture"; tile: HexKey; from: CogId | null; to: CogId | null; coherence: number; spent: number }
  | { type: "auction"; winner: CogId | null; price: number; bids: Array<[CogId, number]> };

const emptyT = (): Treasury => ({ C: 0, O: 0, Ge: 0, S: 0 });
const subT = (a: Treasury, b: Treasury): Treasury => ({ C: a.C - b.C, O: a.O - b.O, Ge: a.Ge - b.Ge, S: a.S - b.S });
const addT = (a: Treasury, b: Treasury): Treasury => ({ C: a.C + b.C, O: a.O + b.O, Ge: a.Ge + b.Ge, S: a.S + b.S });

/** A validated, affordable Cog's intent, ready to apply in the locked sequence. */
interface Plan {
  aligns: Array<[HexKey, number]>;
  exploits: HexKey[];
  abandons: HexKey[];
  transfers: Array<{ to: CogId; mineral: Mineral; amount: number }>;
  bid: number;
  sent: Treasury;
  spendBase: number; // transfer fees (always paid, regardless of auction) — aligns cost coherence, not energy
}

/** Execute one simultaneous Resolve phase. Pure: returns a new state + events.
 *  `commitOrder` (cogs in the order they locked their Commits) breaks auction
 *  ties first-bidder-first; absent cogs rank after all present ones, in seat
 *  order — so scripted games tie-break by seat. */
export function resolve(
  state: GameState,
  ordersByCog: Record<CogId, Order[]>,
  commitOrder: CogId[] = [],
): { state: GameState; events: ResolveEvent[] } {
  const events: ResolveEvent[] = [];
  const plans = new Map<CogId, Plan>();

  // 1. validate + budget — reject the WHOLE order set on any violation.
  // Relies on the stable-order invariant from types.ts: `cogOrder` contains
  // exactly the keys of `state.cogs` (so iterating it visits every Cog once).
  for (const cogId of state.cogOrder) {
    const cog = state.cogs[cogId];
    if (!cog) continue;
    const orders = ordersByCog[cogId] ?? [];
    const aligns: Array<[HexKey, number]> = [];
    const exploits: HexKey[] = [];
    const abandons: HexKey[] = [];
    const transfers: Array<{ to: CogId; mineral: Mineral; amount: number }> = [];
    const sent = emptyT();
    let bid = 0;
    let bidSeen = false;
    let reject: string | null = null;

    for (const o of orders) {
      if (reject) break;
      if (o.type === "align") {
        if (o.force < 1) reject = `align ${o.tile} needs at least 1 force`;
        else if (!isLegalAlignTarget(state, cogId, o.tile)) reject = `illegal align ${o.tile}`;
        else aligns.push([o.tile, o.force]);
      } else if (o.type === "exploit") {
        if (!isOwn(state, cogId, o.tile)) reject = `illegal exploit ${o.tile}`;
        else exploits.push(o.tile);
      } else if (o.type === "abandon") {
        if (!isOwn(state, cogId, o.tile)) reject = `illegal abandon ${o.tile}`;
        else abandons.push(o.tile);
      } else if (o.type === "transfer") {
        if (!state.cogs[o.to] || o.to === cogId) reject = `illegal transfer to ${o.to}`;
        else {
          transfers.push({ to: o.to, mineral: o.mineral, amount: o.amount });
          sent[o.mineral] += o.amount;
        }
      } else {
        if (bidSeen) reject = "multiple bids";
        else {
          bidSeen = true;
          bid = o.energy;
        }
      }
    }
    if (reject) {
      events.push({ type: "rejected", cog: cogId, reason: reject });
      continue;
    }

    // affordability: must hold the minerals it is sending, then afford worst-case
    // ENERGY spend (= settling Aligns on neutral ground + #transfers×FEE + bid)
    // from treasury − sent. WAR Aligns (non-neutral targets, classified by the
    // pre-resolve board) are paid in coherence instead: the committed total must
    // fit the donatable pool — Σ max(0, coherence − 1) across the cog's OTHER
    // tiles (not the align targets, not tiles it is exploiting/abandoning away).
    if (MINERALS.some((m) => cog.treasury[m] < sent[m])) {
      events.push({ type: "rejected", cog: cogId, reason: "insufficient minerals to transfer" });
      continue;
    }
    const settleCost = aligns.reduce((s, [k, f]) => s + (state.tiles[k]!.alignment === null ? f : 0), 0);
    const spendBase = transfers.length * TRANSFER_FEE + settleCost;
    if (maxEnergy(subT(cog.treasury, sent)) < spendBase + bid) {
      events.push({ type: "rejected", cog: cogId, reason: "cannot afford committed spend" });
      continue;
    }
    const warTotal = aligns.reduce((s, [k, f]) => s + (state.tiles[k]!.alignment !== null ? f : 0), 0);
    if (warTotal > 0) {
      const excluded = new Set([...exploits, ...abandons, ...aligns.map(([k]) => k)]);
      let pool = 0;
      for (const [k, t] of Object.entries(state.tiles)) {
        if (t.alignment === cogId && !excluded.has(k)) pool += Math.max(0, t.coherence - 1);
      }
      if (warTotal > pool) {
        events.push({ type: "rejected", cog: cogId, reason: "insufficient coherence to fund Aligns" });
        continue;
      }
    }
    plans.set(cogId, { aligns, exploits, abandons, transfers, bid, sent, spendBase });
  }

  // 2. heart auction — sealed second-price among valid Cogs with a positive bid.
  // Highest bid wins (ties => the FIRST bidder by commit order), pays the
  // second-highest bid, floored at the 1e reserve.
  // Only cogs holding ground may buy hearts — a cog wiped off the board is out
  // of the game, not a free-heart zombie.
  const holdsGround = new Set<CogId>();
  for (const t of Object.values(state.tiles)) if (t.alignment !== null) holdsGround.add(t.alignment);
  const bids: Array<[CogId, number]> = [];
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (p && p.bid > 0 && holdsGround.has(cogId)) bids.push([cogId, p.bid]);
  }
  let winner: CogId | null = null;
  let clearingPrice = 0;
  if (bids.length > 0) {
    const commitRank = new Map<CogId, number>(commitOrder.map((id, i) => [id, i]));
    const rank = (id: CogId): number => commitRank.get(id) ?? commitOrder.length + state.cogOrder.indexOf(id);
    let wi = 0;
    for (let i = 1; i < bids.length; i++)
      if (bids[i]![1] > bids[wi]![1] || (bids[i]![1] === bids[wi]![1] && rank(bids[i]![0]) < rank(bids[wi]![0]))) wi = i;
    winner = bids[wi]![0];
    for (let i = 0; i < bids.length; i++) if (i !== wi && bids[i]![1] > clearingPrice) clearingPrice = bids[i]![1];
    if (clearingPrice < 1) clearingPrice = 1; // reserve price — hearts are never free
  }

  // 3. apply effects -> new tiles + treasuries.
  const tiles = { ...state.tiles };
  const postCharge = new Map<CogId, Treasury>();
  const windfall = new Map<CogId, Treasury>();
  const incoming = new Map<CogId, Treasury>();
  for (const cogId of state.cogOrder) {
    windfall.set(cogId, emptyT());
    incoming.set(cogId, emptyT());
  }

  // 3a. charge ACTUAL spend (= spendBase + clearing price if auction winner) from
  // treasury − sent. Monotonic affordability guarantees chargeEnergy succeeds.
  for (const cogId of state.cogOrder) {
    const cog = state.cogs[cogId]!;
    const p = plans.get(cogId);
    if (!p) {
      postCharge.set(cogId, { ...cog.treasury });
      continue;
    }
    const actual = p.spendBase + (winner === cogId ? clearingPrice : 0);
    const afterSend = subT(cog.treasury, p.sent);
    const charged = chargeEnergy(afterSend, actual);
    // Invariant: the budget gate validated maxEnergy(afterSend) >= worstCase >= actual,
    // and chargeEnergy is monotonic, so this is always non-null. Fail loud if that ever breaks.
    if (charged === null) throw new Error(`resolve: affordability invariant violated for ${cogId}`);
    postCharge.set(cogId, charged);
  }

  // 3b. transfers -> recipient incoming (next-turn money). Rejected Cogs still
  // receive incoming transfers (incoming is keyed for every cog).
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (!p) continue;
    for (const tr of p.transfers) {
      const inc = incoming.get(tr.to)!;
      inc[tr.mineral] += tr.amount;
      events.push({ type: "transfer", from: cogId, to: tr.to, mineral: tr.mineral, amount: tr.amount });
    }
  }

  // 3c. exploits (BEFORE aligns): mint windfall, then neutralize + scar the tile,
  // so an exploited tile is a neutral husk when a rival's align lands this turn.
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (!p) continue;
    for (const tk of p.exploits) {
      const t = tiles[tk];
      if (!t || t.alignment !== cogId) continue; // dup / already neutral
      const minted = EXPLOIT_MULT * t.coherence * t.density;
      windfall.get(cogId)![t.mineral] += minted;
      events.push({ type: "exploit", cog: cogId, tile: tk, mineral: t.mineral, minted });
      tiles[tk] = { ...t, alignment: null, coherence: 0, density: Math.floor(t.density * EXPLOIT_DENSITY) };
    }
  }

  // 3c-b. abandons: the tile returns to neutral and its standing coherence comes
  // home as ENERGY (next-turn money) — paid as units of the cog's most abundant
  // mineral, each worth exactly +1e (adding to the max never completes a set).
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (!p) continue;
    for (const tk of p.abandons) {
      const t = tiles[tk];
      if (!t || t.alignment !== cogId) continue; // dup / already gone
      const refund = t.coherence;
      if (refund > 0) {
        const cog = state.cogs[cogId]!;
        const mineral = MINERALS.reduce((a, b) => (cog.treasury[a] >= cog.treasury[b] ? a : b));
        windfall.get(cogId)![mineral] += refund;
      }
      events.push({ type: "abandon", cog: cogId, tile: tk, refund });
      tiles[tk] = { ...t, alignment: null, coherence: 0 };
    }
  }

  // 3c2. align funding: the committed coherence is donated OUT of the aligner's
  // own tiles — largest first (ties by key), never below 1 — before any contest
  // resolves, so spending your fortress visibly weakens it this same turn.
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (!p) continue;
    // war Aligns only — settling neutral ground was charged in energy above
    let need = p.aligns.reduce((s, [k, f]) => s + (state.tiles[k]!.alignment === null ? 0 : f), 0);
    if (need === 0) continue;
    const targets = new Set(p.aligns.map(([k]) => k));
    const donors = Object.entries(tiles)
      .filter(([k, t]) => t.alignment === cogId && !targets.has(k))
      .sort((a, b) => b[1].coherence - a[1].coherence || (a[0] < b[0] ? -1 : 1));
    for (const [k, t] of donors) {
      if (need === 0) break;
      const give = Math.min(need, Math.max(0, t.coherence - 1));
      if (give <= 0) continue;
      tiles[k] = { ...t, coherence: t.coherence - give };
      need -= give;
    }
    // Invariant: the pool was validated against pre-resolve state minus the cog's
    // own exploits, and nothing else touches its tiles before this step.
    if (need > 0) throw new Error(`resolve: align coherence invariant violated for ${cogId}`);
  }

  // 3d. align tug-of-war: gather aligns per tile, resolve against post-exploit
  // incumbents, update the tile.
  const alignsByTile = new Map<HexKey, Array<[CogId, number]>>();
  for (const cogId of state.cogOrder) {
    const p = plans.get(cogId);
    if (!p) continue;
    for (const [tk, energy] of p.aligns) {
      const list = alignsByTile.get(tk);
      if (list) list.push([cogId, energy]);
      else alignsByTile.set(tk, [[cogId, energy]]);
    }
  }
  for (const [tk, aligns] of alignsByTile) {
    const t = tiles[tk];
    if (!t) continue;
    const res = resolveTile(t.alignment, t.coherence, aligns);
    if (res.alignment !== t.alignment) {
      // the energy the new owner committed to this tile (0 on mutual annihilation)
      const spent = aligns.filter(([id]) => id === res.alignment).reduce((s, [, e]) => s + e, 0);
      events.push({ type: "capture", tile: tk, from: t.alignment, to: res.alignment, coherence: res.coherence, spent });
    }
    tiles[tk] = { ...t, alignment: res.alignment, coherence: res.coherence };
  }

  // 3e. assemble cog states: new treasury = postCharge + windfall + incoming
  // (windfall & incoming added AFTER charging => next-turn money).
  const cogs: Record<CogId, CogState> = {};
  for (const cogId of state.cogOrder) {
    const base = state.cogs[cogId]!;
    cogs[cogId] = {
      ...base,
      treasury: addT(addT(postCharge.get(cogId)!, windfall.get(cogId)!), incoming.get(cogId)!),
      hearts: base.hearts + (winner === cogId ? 1 : 0),
    };
  }

  events.push({ type: "auction", winner, price: clearingPrice, bids });
  return { state: { ...state, tiles, cogs }, events };
}
