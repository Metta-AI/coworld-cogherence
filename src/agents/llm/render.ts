// Serialize an AgentView into the prompt a Cog reads each turn: a fixed SYSTEM
// preamble (rules + how to act) and a per-turn USER message (its treasury, the
// scoreboard, its tiles, and the frontier it may Align). Pure and testable.
import type { AgentView } from "../types";
import type { CogId } from "../../shared/engine/types";
import { isLegalAlignTarget } from "../../shared/engine/orders";
import { maxEnergy } from "../../shared/engine/energy";
import { COHERENCE_MAX, MAX_TURNS, SET_ENERGY, UPKEEP_PER_TILE } from "../../shared/engine/constants";

export const SYSTEM_PROMPT = `You are a Cog in **Cogherence**, a mixed-motive game on a hex lattice. 3–6 Cogs compete to hold the most **hearts** at turn ${MAX_TURNS}; one heart is auctioned each turn.

THE BOARD. Each tile has an alignment (a Cog or neutral), a Coherence 0–${COHERENCE_MAX} (its "margin of dominance"), a mineral (C/O/Ge/S), and a density. Every Upkeep, a tile gains Coherence if a strict majority of its neighbors share its alignment, else it loses Coherence. Compact blobs are fortresses; lone salients rot.

ENERGY. Aligned tiles mint density×coherence of their mineral each turn. Minerals convert to energy on demand: a full C+O+Ge+S set = ${SET_ENERGY} energy, a single leftover mineral = 1. So a balanced treasury is far more efficient — trade is survival. Each tile costs ${UPKEEP_PER_TILE} energy/turn upkeep. IMPORTANT: minerals you mint this turn land in your treasury NEXT turn (a one-turn lag), so you can only spend the energy you ALREADY hold; an order set you can't afford is rejected wholesale.

YOUR ACTIONS each turn (via the submit_orders tool):
- align {tile, energy}: pour energy toward your alignment. Target a tile you own (reinforce) or one adjacent to your territory (expand/capture). Capture is a tug-of-war: you take a tile when your force exceeds the incumbent's Coherence.
- exploit {tile}: strip-mine a tile you own for a 2×coherence×density windfall — but it goes neutral and its density permanently halves. Scorched earth.
- transfer {to, mineral, amount}: send minerals to another Cog (1 energy). Deals are non-binding.
- bid: a sealed second-price heart bid, in energy. Highest bidder wins the heart and pays the second price.

Spend only energy you can afford — an unaffordable order set is rejected wholesale. Think briefly, then call submit_orders exactly once.`;

function heartsLine(view: AgentView): string {
  return view.state.cogOrder.map((id) => `${id}:${view.state.cogs[id]!.hearts}`).join(" ");
}

/** Recent visible messages (public + this cog's DMs), formatted for the prompt. */
function renderMessages(view: AgentView): string {
  const msgs = view.messages ?? [];
  if (!msgs.length) return "  (no messages yet)";
  return msgs.map((m) => `  ${m.from} → ${m.to === "public" ? "all" : m.to}: ${m.text}`).join("\n");
}

export function renderView(view: AgentView): { system: string; user: string } {
  const { state, me } = view;
  const cog = state.cogs[me]!;
  const t = cog.treasury;
  const energy = maxEnergy(t);

  const mine: string[] = [];
  const frontier: string[] = [];
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.alignment === me) {
      mine.push(`  ${k}  coh${tile.coherence}  ${tile.mineral} d${tile.density}`);
    } else if (isLegalAlignTarget(state, me, k)) {
      const owner: CogId | "neutral" = tile.alignment ?? "neutral";
      frontier.push(`  ${k}  ${owner}  coh${tile.coherence}  ${tile.mineral} d${tile.density}`);
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

  return { system: SYSTEM_PROMPT, user };
}

/** The Negotiate-phase prompt: board + scoreboard + recent messages + an
 *  instruction to send public/DM messages (the cheap-talk politics, design §9). */
export function renderNegotiate(view: AgentView): { system: string; user: string } {
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
  return { system: SYSTEM_PROMPT, user };
}
