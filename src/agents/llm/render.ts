// Serialize an AgentView into the prompt a Cog reads each turn: a fixed SYSTEM
// preamble (rules + how to act) and a per-turn USER message (its treasury, the
// scoreboard, its tiles, and the frontier it may Align). Pure and testable.
import type { AgentView } from "../types";
import type { CogId } from "../../shared/engine/types";
import { isLegalAlignTarget } from "../../shared/engine/orders";
import { maxEnergy } from "../../shared/engine/energy";
import { COHERENCE_MAX, MAX_TURNS, RESISTANCE_COST, SET_ENERGY } from "../../shared/engine/constants";

export const SYSTEM_PROMPT = `You are a Cog in **Cogherence**, a mixed-motive game on a hex lattice. 3–6 Cogs compete to hold the most **hearts** at turn ${MAX_TURNS}; one heart is auctioned each turn.

THE BOARD. Each tile has an alignment (a Cog or neutral), a Coherence 0–${COHERENCE_MAX} (its "margin of dominance"), a mineral (C/O/Ge/S), and a density. Coherence rises and falls with the upkeep bill (see ENERGY): sheltered ground is cheap to hold; ground where enemies outnumber your allied neighbors costs extra and rots when you cannot pay.

ENERGY. Aligned tiles mint floor(density × coherence / 10) of their mineral each turn — a tile at full coherence (${COHERENCE_MAX}) yields its full density; weaker tiles yield proportionally less. Density runs 0-10 (power-law: most tiles thin, a few rich). Minerals convert to energy on demand: a full C+O+Ge+S set = ${SET_ENERGY} energy, a single leftover mineral = 1. So a balanced treasury is far more efficient — trade is survival. Each tile bills upkeep every turn: a base of floor(sqrt(your tile count)) energy — empire scale taxes EVERY tile, so sprawl gets expensive — PLUS resistance = ${RESISTANCE_COST} energy × enemy neighbors — allies do NOT reduce resistance (neutral neighbors count for nothing), so contested ground is a serious money sink no matter how backed up you are. Coherence changes ONLY through this bill: an unpaid tile UNDER resistance (any enemy neighbor) loses 1 Coherence (at 0 it goes neutral and you lose it) while zero-resistance tiles hold even unpaid; a PAID tile regenerates +1 Coherence per allied neighbor every turn FOR FREE (cap ${COHERENCE_MAX}) — allies are how ground heals. Bills are paid strongest-tile-first automatically. IMPORTANT: minerals you mint this turn land in your treasury NEXT turn (a one-turn lag), so you can only spend the energy you ALREADY hold; an order set you can't afford is rejected wholesale.

YOUR ACTIONS each turn (via the submit_orders tool):
- align {tile, force}: commit FORCE (1-10) to a tile's tug-of-war; the ENERGY billed = force² + distance², where distance is from your CLOSEST tile (your own tile = 0, adjacent = 1) — reach is quadratically expensive, and a cost above 100e is out of reach (rejected). The FULL cost is charged win or lose, and so is any set you cannot afford. REPEAT TAX: each additional Align in the same turn bills +10 energy more than the last (first free, then +10, +20, ...) — overhead that buys no force. Capture is a tug-of-war: you take a tile when your force exceeds the incumbent's Coherence (plus any force they commit).
- exploit {tile}: strip-mine a tile you own for a floor(10×coherence×density) windfall of its MINERAL — but it goes neutral and its density permanently drops by coherence/10. Scorched earth.
- abandon {tile}: return a tile you own to neutral; its standing coherence comes home as energy (next-turn money, full value, no scarring). The orderly retreat — cash out ground you cannot afford to hold.
- transfer {to, mineral, amount}: send minerals to another Cog (1 energy). Deals are non-binding.
- bid: a sealed second-price heart bid, in energy. Highest bidder wins the heart and pays the second price; tied bids go to whoever committed first.

Spend only energy you can afford — an unaffordable order set is rejected wholesale. Think briefly, then call submit_orders exactly once.`;

/** Prepend an operator-set persona to the system prompt (empty/blank = unchanged).
 *  Re-applied every turn so live steering takes effect on the next decision. */
function systemWithPersona(persona?: string): string {
  const p = persona?.trim();
  return p ? `OPERATOR DIRECTIVE (follow this persona): ${p}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;
}

function heartsLine(view: AgentView): string {
  return view.state.cogOrder.map((id) => `${id}:${view.state.cogs[id]!.hearts}`).join(" ");
}

/** Recent visible messages (public + this cog's DMs), formatted for the prompt. */
function renderMessages(view: AgentView): string {
  const msgs = view.messages ?? [];
  if (!msgs.length) return "  (no messages yet)";
  return msgs.map((m) => `  ${m.from} → ${m.to === "public" ? "all" : m.to}: ${m.text}`).join("\n");
}

export function renderView(view: AgentView, persona?: string): { system: string; user: string } {
  const { state, me } = view;
  const cog = state.cogs[me]!;
  const t = cog.treasury;
  const energy = maxEnergy(t);

  const mine: string[] = [];
  const frontier: string[] = [];
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.alignment === me) {
      mine.push(`  ${k}  coh${tile.coherence}  ${tile.mineral} d${Math.floor(tile.density)}`);
    } else if (isLegalAlignTarget(state, me, k)) {
      const owner: CogId | "neutral" = tile.alignment ?? "neutral";
      frontier.push(`  ${k}  ${owner}  coh${tile.coherence}  ${tile.mineral} d${Math.floor(tile.density)}`);
    }
  }

  const user = [
    `Turn ${state.turn}/${MAX_TURNS}. You are ${me}.`,
    ``,
    `Your treasury: C${t.C} O${t.O} Ge${t.Ge} S${t.S}.`,
    `Energy you can spend THIS turn: ≈${energy} (a full C+O+Ge+S set = ${SET_ENERGY}, a single mineral = 1). Minerals you mint this turn arrive NEXT turn — they do NOT add to this. Keep total spend at or below ${energy} or the whole order set is rejected.`,
    `Hearts — ${heartsLine(view)}`,
    ``,
    `Your tiles (${mine.length}):`,
    ...(mine.length ? mine : ["  (none)"]),
    ``,
    `Frontier you may Align — your tiles + adjacent (owner = neutral or a Cog):`,
    ...(frontier.length ? frontier : ["  (none)"]),
    ``,
    `Recent messages (public + your DMs):`,
    renderMessages(view),
    ``,
    `Call submit_orders with your orders for this turn.`,
  ].join("\n");

  return { system: systemWithPersona(persona), user };
}

/** The Negotiate-phase prompt: board + scoreboard + recent messages + an
 *  instruction to send public/DM messages (the cheap-talk politics, design §9). */
export function renderNegotiate(view: AgentView, persona?: string): { system: string; user: string } {
  const { state, me } = view;
  const t = state.cogs[me]!.treasury;
  const user = [
    `Turn ${state.turn}/${MAX_TURNS}. You are ${me}. NEGOTIATION PHASE.`,
    ``,
    `Your treasury: C${t.C} O${t.O} Ge${t.Ge} S${t.S} (≈${maxEnergy(t)} energy). Hearts — ${heartsLine(view)}.`,
    ``,
    `Recent messages (public + your DMs):`,
    renderMessages(view),
    ``,
    `Send public messages (to "public") or private DMs (to a cog id like "cog1") to form alliances, propose mineral trades, bluff, or threaten — nothing is binding, and you can betray later. Call send_messages with your messages (empty list to stay silent). One or two sentences each.`,
  ].join("\n");
  return { system: systemWithPersona(persona), user };
}
