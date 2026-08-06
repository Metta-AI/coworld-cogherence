// SEAM-VALIDATION PORT: cogherence onto the shared @cogweb/core `Game` seam.
// cogherence's real engine is SIMULTANEOUS — `runGame` collects one Order[] per
// Cog each turn and runs them all at once in `stepTurn` (resolve → upkeep →
// first-commit bonus → advance). The seam is pull-based: the runner asks
// `pendingActors`, validates a decision against `decisionSchema`, and applies it
// via `applyDecision`. So we BUFFER each seat's Order[] as it arrives and, when
// the last seat for the turn submits, run the exact same pure `stepTurn` over the
// collected orders — the single point where engine state advances.
//
// We reuse cogherence's pure engine fns verbatim; no rules are reimplemented.
//
// PARITY NOTE: the byte-for-byte target is the pure-engine `runGame`, which calls
// `stepTurn(state, ordersByCog)` with NO `commitOrder` — so auction ties break by
// seat order (`cogOrder`) and NO first-commit tempo bonus is paid. We therefore
// (1) pass `undefined` for `commitOrder` in the resolve step and (2) do NOT
// auto-convert full COGS sets at turn start. Auto-conversion and a real
// commit-order tempo bonus are LIVE-SERVER behaviors (see
// `server/game-runner.ts`); folding them in here would diverge from `runGame`.
// `committedOrder` is still tracked in the seam state (submission order) for
// structural fidelity, but it is intentionally not handed to `stepTurn`.

import { z } from "zod";
import { GameError } from "@cogweb/core";
import type { Game, Autopilot, GameModule, ApplyResult, ObservedMessage } from "@cogweb/core";
import { applyGuidance } from "@cogweb/llm";
import type { FeedEvent } from "@cogweb/protocol";

import type { GameState, CogId } from "../shared/engine/types.js";
import type { Order } from "../shared/engine/orders.js";
import { OrderSchema } from "../shared/engine/orders.js";
import { submitOrdersSchema, toOrders } from "../agents/llm/submit.js";
import type { TurnRecord, TurnEvent } from "../shared/engine/log.js";
import { newGame, stepTurn, scoreGame } from "../shared/engine/game.js";
import { resolve } from "../shared/engine/resolve.js";
import { MAX_TURNS } from "../shared/engine/constants.js";
import { toSnapshot, type GameSnapshot } from "../shared/snapshot.js";
import { buildCogSnapshot, redactEventFor } from "./redact.js";

// ── seam types ──────────────────────────────────────────────────────────────

/** A turn's decision: the Cog's full Order[] for the simultaneous Commit. An
 *  empty list is a legal "hold" (no orders, no bid) — see {@link baselineDecision}. */
export type CoghereDecision = { orders: Order[] };

/** The seam state: the pure engine GameState plus the per-turn submission buffer.
 *  `pending` are the cogs (in cogOrder) yet to submit THIS turn; `orders` buffers
 *  each cog's Order[]; `committedOrder` records submission order (see PARITY NOTE
 *  — tracked but not handed to `stepTurn`, which matches `runGame`). */
export interface CoghereSeamState {
  engine: GameState;
  pending: CogId[];
  orders: Record<CogId, Order[]>;
  committedOrder: CogId[];
}

/** The per-seat view: the redacted snapshot (other cogs' treasury/energy zeroed). */
export type CoghereView = GameSnapshot;

// ── seat ↔ id helpers ─────────────────────────────────────────────────────────
// Seat i ↔ engine.cogOrder[i] ↔ cogs[id].index. The seam keys everything by seat;
// the engine keys everything by CogId. This is the only translation layer.

function idForSeat(s: CoghereSeamState, seat: number): CogId {
  const id = s.engine.cogOrder[seat];
  if (id === undefined) throw new GameError(`no cog at seat ${seat}`);
  return id;
}

function seatForId(s: CoghereSeamState, id: CogId): number {
  const seat = s.engine.cogs[id]?.index;
  if (seat === undefined) throw new GameError(`unknown cog id ${id}`);
  return seat;
}

// ── seed coercion ──────────────────────────────────────────────────────────────
// The seam hands a string seed; cogherence's seed is a number. A numeric string
// passes straight through; anything else is hashed deterministically so the same
// seed string always yields the same board.

function seedToNumber(seed: string): number {
  const n = Number(seed);
  if (Number.isFinite(n)) return Math.trunc(n);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return h;
}

// ── event lowering ──────────────────────────────────────────────────────────────
// Lower the engine's typed TurnRecord events to @cogweb/protocol FeedEvents
// ({turn, seat, kind, text, to, data}). `kind` = the event type, `text` = a
// rendered one-liner, `data` = the structured event. Board events are public.

function eventSeat(s: CoghereSeamState, ev: TurnEvent): number | null {
  // The seat the event is "about", when one applies — used so a per-seat feed can
  // attribute the line. Auction settles and captures are board-wide (seat null).
  if (ev.type === "order" || ev.type === "rejected" || ev.type === "exploit" || ev.type === "abandon")
    return seatForId(s, ev.cog);
  if (ev.type === "transfer") return seatForId(s, ev.from);
  if (ev.type === "starved" || ev.type === "lost" || ev.type === "mint" || ev.type === "firstCommit")
    return seatForId(s, ev.cog);
  return null; // capture, auction
}

function eventText(ev: TurnEvent): string {
  switch (ev.type) {
    case "order":
      return `${ev.cog} ${ev.order.type}${ev.cost !== undefined ? ` (${ev.cost}e)` : ""}`;
    case "rejected":
      return `${ev.cog} rejected: ${ev.reason}`;
    case "transfer":
      return `${ev.from} → ${ev.to}: ${ev.amount} ${ev.mineral}`;
    case "exploit":
      return `${ev.cog} exploited ${ev.tile} for ${ev.minted} ${ev.mineral}`;
    case "abandon":
      return `${ev.cog} abandoned ${ev.tile} (+${ev.refund}e)`;
    case "capture":
      return `${ev.tile}: ${ev.from ?? "neutral"} → ${ev.to ?? "neutral"} (coh ${ev.coherence})`;
    case "auction":
      return ev.winner ? `${ev.winner} won the heart at ${ev.price}e` : "heart auction: no winner";
    case "starved":
      return `${ev.cog} starved ${ev.tile} (coh ${ev.coherence})`;
    case "lost":
      return `${ev.cog} lost ${ev.tile}`;
    case "mint":
      return `${ev.cog} minted C${ev.gained.C} O${ev.gained.O} Ge${ev.gained.Ge} S${ev.gained.S}`;
    case "firstCommit":
      return `${ev.cog} first-commit bonus +${ev.reward}e`;
  }
}

/** Lower one completed turn's TurnRecord to FeedEvents (the runner stamps `turn`). */
function lowerRecord(s: CoghereSeamState, record: TurnRecord): Array<Omit<FeedEvent, "turn">> {
  return record.events.map((ev) => ({ seat: eventSeat(s, ev), kind: ev.type, text: eventText(ev), to: "public", data: ev }));
}

// ── bounds ──────────────────────────────────────────────────────────────────────
// cogherence seats 3–6 Cogs (board has six corners; the engine generates 3–6 home
// sites). MAX_TURNS is the fixed horizon.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
const DEFAULT_PLAYERS = 4;

// ── the Game impl ─────────────────────────────────────────────────────────────

export const cogherenceGame: Game<CoghereSeamState, CoghereDecision, CoghereView> = {
  id: "cogherence",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  newGame({ seed, playerCount, seatNames }): CoghereSeamState {
    const count = playerCount || DEFAULT_PLAYERS;
    // Lobby seat names flow straight to the cogs as display names (seat i ↔
    // cog i); blanks fall back to the engine's default corner names.
    const engine = newGame(seedToNumber(seed), count, seatNames);
    return { engine, pending: [...engine.cogOrder], orders: {}, committedOrder: [] };
  },

  turnOf(s): number {
    return s.engine.turn;
  },

  // cogherence is SIMULTANEOUS: every Cog acts every turn. The pending seats are
  // all cogs that have not yet submitted this turn; empty once the game finishes.
  pendingActors(s): number[] {
    if (s.engine.turn > MAX_TURNS) return [];
    return s.pending.map((id) => seatForId(s, id));
  },

  // State-independent: one schema for every seat, every turn. The runner's
  // validate-gate parses EVERY pilot's output through this, so it must accept both
  // decision producers: the canonical `{orders}` (scripted / baseline / remote) AND
  // the LLM autopilot's GROUPED `submit_orders` tool payload ({aligns, exploits,
  // abandons, transfers, bid} — cogherence's real tool spec). The grouped branch is
  // flattened to `{orders}` via the SAME `toOrders` grouping `parseSubmit` uses, so
  // the autopilot reuses cogherence's existing tool verbatim and `applyDecision`
  // still sees one canonical shape.
  decisionSchema(_s, _seat): z.ZodType<CoghereDecision> {
    return z.union([
      z.object({ orders: OrderSchema.array() }),
      submitOrdersSchema.transform((p) => ({ orders: toOrders(p) })),
    ]) as z.ZodType<CoghereDecision>;
  },

  applyDecision(s, seat, decision): ApplyResult<CoghereSeamState> {
    const id = idForSeat(s, seat);
    if (!s.pending.includes(id)) {
      throw new GameError(`seat ${seat} (${id}) has already submitted this turn`);
    }

    // Dry-run THIS seat's orders against the engine on a CLONE (so the live state
    // is never touched) and bounce an illegal set with the engine's own reason —
    // the same gate the LLM player uses (llm-agent.rejectionReason). The runner
    // re-prompts on the thrown GameError.
    const probe = resolve(structuredClone(s.engine), { [id]: decision.orders });
    const rej = probe.events.find((e) => e.type === "rejected" && e.cog === id);
    if (rej && rej.type === "rejected") throw new GameError(rej.reason);

    const next: CoghereSeamState = {
      ...s,
      pending: s.pending.filter((x) => x !== id),
      orders: { ...s.orders, [id]: decision.orders },
      committedOrder: [...s.committedOrder, id],
    };

    // Still seats to hear from this turn — buffer and hold (no engine step yet).
    if (next.pending.length > 0) return { state: next };

    // Last seat in: run the simultaneous turn exactly as `runGame` does —
    // stepTurn over the collected orders with NO commitOrder (see PARITY NOTE).
    const ordersByCog: Record<CogId, Order[]> = {};
    for (const cid of s.engine.cogOrder) ordersByCog[cid] = next.orders[cid] ?? [];
    const engine = stepTurn(next.engine, ordersByCog);
    const record = engine.log[engine.log.length - 1]!;
    const events = lowerRecord(next, record);
    const fresh: CoghereSeamState = { engine, pending: [...engine.cogOrder], orders: {}, committedOrder: [] };
    return { state: fresh, events };
  },

  isFinished(s): boolean {
    return s.engine.turn > MAX_TURNS;
  },

  // Hearts by seat (the only thing that decides the winner; wealth is the engine's
  // tiebreak — see scoreGame). Seat index → hearts.
  score(s): Record<number, number> {
    const out: Record<number, number> = {};
    for (const id of s.engine.cogOrder) out[s.engine.cogs[id]!.index] = s.engine.cogs[id]!.hearts;
    return out;
  },

  // Port of buildCogSnapshot: the board + everyone's hearts are public, but a seat
  // sees only its own treasury/energy (others zeroed). seat=null = the public view.
  redact(s, seat): CoghereView {
    const snap = toSnapshot(s.engine);
    return seat === null ? snap : buildCogSnapshot(snap, idForSeat(s, seat));
  },

  // An empty order set: no orders, no bid — a legal hold for any seat, any turn.
  baselineDecision(_s, _seat): CoghereDecision {
    return { orders: [] };
  },
};

// ── autopilot ────────────────────────────────────────────────────────────────
// A thin autopilot over the seam that RELABELS cogherence's existing LLM pieces
// onto the @cogweb/core seam rather than reinventing them:
//  - `systemPrompt` is cogherence's SYSTEM_PROMPT (the full rules copy);
//  - `tool` is cogherence's REAL `SUBMIT_ORDERS_TOOL` (the grouped
//    {aligns,exploits,abandons,transfers,bid} spec, with the rich per-field
//    cost/strategy descriptions that materially help the model). Its grouped
//    payload is normalized to the canonical `{ orders }` by `decisionSchema`
//    above (the same `toOrders` grouping `parseSubmit` uses), so the LLM driver
//    validates the tool call against `decisionSchema` directly;
//  - `renderObservation` is `renderView` adapted to the REDACTED seam view (the
//    autopilot only has the per-seat `CoghereView` snapshot, not the full
//    `AgentView`/`GameState` `renderView` takes), plus the seat's visible inbox
//    and operator guidance folded in via `applyGuidance`.

import { SYSTEM_PROMPT } from "../agents/llm/render.js";
import { SUBMIT_ORDERS_TOOL } from "../agents/llm/submit.js";

function renderSnapshotFor(view: CoghereView, seat: number): string {
  const me = view.cogs[seat];
  const lines: string[] = [`Turn ${view.turn}/${MAX_TURNS}. You are ${me?.id ?? `seat ${seat}`}.`];
  if (me) lines.push(`Your treasury: C${me.treasury.C} O${me.treasury.O} Ge${me.treasury.Ge} S${me.treasury.S} — ${me.energy} energy stored.`);
  lines.push(
    "Hearts — " + view.cogs.map((c) => `${c.id}:${c.hearts}`).join(" "),
  );
  const mine = view.tiles.filter((t) => me && t.alignment === me.id);
  lines.push(`Your tiles (${mine.length}): ${mine.map((t) => `${t.q},${t.r}[coh${t.coherence} ${t.mineral} d${Math.floor(t.density)}]`).join(" ") || "(none)"}`);
  return lines.join("\n");
}

/** Label a visible message's sender by its cog id (falling back to a seat tag),
 *  and whether it's a public broadcast or a DM to this seat. `ObservedMessage`
 *  keys senders by seat number; the redacted view maps seat → cog id. */
function messageLine(view: CoghereView, m: ObservedMessage): string {
  const fromId = view.cogs[m.from]?.id ?? `seat ${m.from}`;
  const scope = m.to === "public" ? "(public)" : "(to you)";
  return `  ${fromId} ${scope}: ${m.text}`;
}

export const cogherenceAutopilot: Autopilot<CoghereSeamState, CoghereDecision> = {
  // cogherence's full rules copy, verbatim.
  systemPrompt(): string {
    return SYSTEM_PROMPT;
  },

  // `renderView` adapted to the redacted seam view: the seat's treasury/energy,
  // the public hearts board, and its own tiles, then its visible inbox, then the
  // submit ask. Operator guidance is folded in via the shared `applyGuidance`.
  renderObservation(state, seat, ctx): string {
    const view = cogherenceGame.redact(state, seat);
    const lines = [renderSnapshotFor(view, seat)];
    if (ctx.messages.length > 0) {
      lines.push("Messages you can see:");
      for (const m of ctx.messages.slice(-12)) lines.push(messageLine(view, m));
    }
    lines.push("\nCall submit_orders with your orders for this turn (an empty list holds).");
    const body = lines.join("\n");
    return ctx.guidance ? applyGuidance(body, ctx.guidance) : body;
  },

  // cogherence's REAL submit_orders tool: the grouped {aligns,exploits,abandons,
  // transfers,bid} payload normalized to `{orders}` by `decisionSchema`.
  tool(): { name: string; description: string; inputSchema: unknown } {
    return SUBMIT_ORDERS_TOOL;
  },
};

// ── module ──────────────────────────────────────────────────────────────────────

export const cogherenceModule: GameModule<CoghereSeamState, CoghereDecision, CoghereView> = {
  game: cogherenceGame,
  autopilot: cogherenceAutopilot,
};

// Re-exported for convenience / tests.
export { scoreGame };
