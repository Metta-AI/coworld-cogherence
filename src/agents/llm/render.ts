// Serialize an AgentView into the prompt a Cog reads each turn: an episode-selected
// SYSTEM rule presentation and a per-turn USER message (its treasury, the
// scoreboard, its tiles, and the frontier it may Align). Pure and testable.
import { introductions, resolvePromptSelection, type PromptSelection } from "./prompt-variants.js";
import type { AgentView } from "../types";
import type { CogId } from "../../shared/engine/types";
import { isLegalAlignTarget } from "../../shared/engine/orders";
import { COHERENCE_MAX, MAX_TURNS } from "../../shared/engine/constants";

const ACTION_RULES = `YOUR ACTIONS each turn (as JSON):
- align {tile, force}: commit FORCE (1-10) to a tile's tug-of-war; the ENERGY billed = force² + distance², where distance is from your CLOSEST tile (your own tile = 0, adjacent = 1) — reach is quadratically expensive, and a cost above 100e is out of reach (rejected). An affordable, valid order set pays the FULL Align cost win or lose. An unaffordable or invalid order set is rejected wholesale without executing its orders. REPEAT TAX: each additional Align in the same turn bills +10 energy more than the last (first free, then +10, +20, ...) — overhead that buys no force. Capture is a tug-of-war: you take a tile when your force exceeds the incumbent's Coherence (plus any force they commit).
- exploit {tile}: strip-mine a tile you own for a floor(10×coherence×density) windfall of its MINERAL — but it goes neutral and its density permanently drops by coherence/10. Scorched earth.
- abandon {tile}: return a tile you own to neutral; its standing coherence comes home as energy (next-turn money, full value, no scarring). The orderly retreat — cash out ground you cannot afford to hold.
- transfer {to, mineral, amount}: send minerals to another Cog (1 energy). Deals are non-binding.
- bid: a sealed second-price heart bid, in energy. Only Cogs holding ground can bid. The highest bidder wins and pays the greater of 1 energy or the second-highest bid; tied bids go to the earlier seat in the fixed Cog order. Submitting first does not change ties and earns no energy bonus in this Coworld.

Spend only energy you can afford — an unaffordable order set is rejected wholesale. Think briefly, then return JSON exactly once.`;

const RULES = `

THE BOARD. Each tile has an alignment (a Cog or neutral), a Coherence 0–${COHERENCE_MAX} (its "margin of dominance"), a mineral (C/O/Ge/S), and a density. Neighbor pressure moves Coherence directly: when a tile's upkeep is paid, allied neighbors help it rise; enemy neighbors make it fall whether the bill is paid or not. Resistance adds no energy charge; every owned tile pays the same empire-scaled base upkeep (see ENERGY).

ENERGY. Aligned tiles mint floor(density × coherence / 10) of their mineral each turn — a tile at full coherence (${COHERENCE_MAX}) yields its full density; weaker tiles yield proportionally less. Density runs 0-10 (power-law: most tiles thin, a few rich). ENERGY IS STORED — it is the only spendable currency, and minerals are transferable goods, not spendable energy: this four-seat Coworld does not convert minerals automatically, and its orders have no conversion action. Neither full sets nor loose minerals can fund your orders or upkeep. Minerals can be transferred, but only stored energy spends. Do not plan around a conversion button or automatic conversion from another game interface. Each tile bills upkeep every turn: just a base of floor(sqrt(your tile count)) energy — empire scale taxes EVERY tile, so sprawl gets expensive. Resistance costs NO energy — neighbors move COHERENCE directly instead: every turn a tile shifts +1 Coherence per allied neighbor and −1 per enemy neighbor (net, cap ${COHERENCE_MAX}, at 0 it goes neutral and you lose it; neutral neighbors count for nothing). The ally bonus only applies if the tile's bill is PAID — an unpaid tile still suffers the enemy drain but gets no healing. Bills are paid strongest-tile-first automatically. Frontiers survive by being BACKED with allied tiles, not by money. IMPORTANT: minerals you mint this turn land in your treasury NEXT turn (a one-turn lag), and only STORED energy spends — an order set you can't afford from stored energy is rejected wholesale.

${ACTION_RULES}`;

const EXPLANATIONS = {
  board: `A tile has a Cog alignment or is neutral, a mineral (C/O/Ge/S), density, and Coherence from 0 to ${COHERENCE_MAX}. Coherence is its margin of dominance. During upkeep, each allied neighbor adds 1 if the tile's bill is paid; each enemy neighbor subtracts 1 regardless of payment. Neutral neighbors contribute nothing. Apply the net change, capped at ${COHERENCE_MAX}; reaching 0 makes the tile neutral and loses it. Resistance adds no energy fee. Frontiers survive by being BACKED with allied tiles, not by money.`,
  economy: `Each aligned tile produces floor(density × coherence / 10) units of its mineral per turn. Full Coherence (${COHERENCE_MAX}) yields full density, with weaker tiles producing proportionally less. Density is 0–10 with a power-law distribution: many thin tiles and a few rich ones. Newly minted minerals arrive in your treasury NEXT turn. Minerals are transferable goods, never spendable energy in this four-seat Coworld: there is no automatic conversion and no conversion order. Full sets and loose minerals cannot pay orders or upkeep. Do not plan around a conversion button or automatic conversion from another game interface.`,
  upkeep: `Only STORED energy is spendable. Each owned tile owes floor(sqrt(your tile count)) energy every turn. Empire scale taxes EVERY tile, so sprawl gets expensive. Strongest tiles have their bills paid first automatically. A paid tile gets allied-neighbor healing; an unpaid tile gets none, but still takes enemy-neighbor drain. Resistance itself costs NO energy. An order set exceeding stored energy is rejected wholesale.`,
};
const HELDOUT_EXPLANATIONS: typeof EXPLANATIONS = {
  board: `Read each hex by owner (one Cog or neutral), mineral C/O/Ge/S, density, and dominance margin called Coherence (0–${COHERENCE_MAX}). Neighbor influence changes Coherence directly. An enemy neighbor removes one each turn even if upkeep goes unpaid; an allied neighbor restores one only after payment. Neutral neighbors do neither. Net these changes and cap at ${COHERENCE_MAX}. At zero the tile becomes neutral and leaves your holdings. Resistance has no energy surcharge. Frontiers survive by being BACKED with allied tiles, not by money.`,
  economy: `Mining contributes floor(density × coherence / 10) of a tile's mineral every turn it is aligned. At ${COHERENCE_MAX} Coherence this is the full density, and lower Coherence reduces it proportionately. Densities follow a power law between 0 and 10: rich tiles are rare, thin tiles common. Production is delayed one turn before entering your treasury. You can transfer minerals, but this four-seat game provides neither automatic mineral conversion nor an order to convert them. Sets and singles alike are unable to fund upkeep or orders. Do not plan around a conversion button or automatic conversion from another game interface.`,
  upkeep: `Your stored energy alone funds spending. The per-turn bill for EACH owned tile is floor(sqrt(the number of tiles you own)). Empire scale taxes EVERY tile, so sprawl gets expensive. Automatic payment proceeds from strongest tile to weakest. Payment enables allied neighbors to heal a tile; nonpayment removes that benefit without stopping hostile drain. There is no separate energy charge for resistance. If stored energy cannot cover an order set, the entire set is rejected.`,
};
const SECTION_ORDER = {
  plain: ["board", "economy", "upkeep"],
  numbered: ["economy", "upkeep", "board"],
  questions: ["upkeep", "board", "economy"],
  reordered: ["board", "upkeep", "economy"],
  "heldout-briefing": ["economy", "board", "upkeep"],
  "heldout-reference": ["upkeep", "economy", "board"],
} as const;
const QUESTIONS = {
  board: "How does territory gain or lose Coherence?",
  economy: "What do your tiles produce, and when?",
  upkeep: "What can you spend, and what does holding land cost?",
};

export function renderSystemPrompt(selection: PromptSelection = resolvePromptSelection()): string {
  if (selection.variant === "canonical") return introductions.canonical + RULES;
  const explanations = selection.variant.startsWith("heldout-") ? HELDOUT_EXPLANATIONS : EXPLANATIONS;
  const sections = SECTION_ORDER[selection.variant].map((key, index) => {
    const heading = selection.variant === "questions" ? QUESTIONS[key] :
      selection.variant === "numbered" ? `${index + 1}. ${key.toUpperCase()}` : key.toUpperCase();
    return `${heading}\n${explanations[key]}`;
  });
  return introductions[selection.variant] + "\n\n" + sections.join("\n\n") + "\n\n" + ACTION_RULES;
}
export const SYSTEM_PROMPT = renderSystemPrompt();

/** Prepend an operator-set persona to the system prompt (empty/blank = unchanged).
 *  Re-applied every turn so live steering takes effect on the next decision. */
function systemWithPersona(persona: string | undefined, selection: PromptSelection): string {
  const p = persona?.trim();
  const system = renderSystemPrompt(selection);
  return p ? `OPERATOR DIRECTIVE (follow this persona): ${p}\n\n${system}` : system;
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

export function renderView(view: AgentView, persona?: string, selection = resolvePromptSelection()): { system: string; user: string } {
  const { state, me } = view;
  const cog = state.cogs[me]!;
  const t = cog.treasury;
  const energy = cog.energy;

  const mine: string[] = [];
  const frontier: string[] = [];
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.alignment === me) {
      mine.push(`  ${k}  coh${tile.coherence}  ${tile.mineral} d${Math.floor(tile.density)}`);
    } else if (isLegalAlignTarget(state, me, k)) {
      const owner: CogId | "neutral" = tile.alignment ?? "neutral";
      frontier.push(
        `  ${k}  ${owner}  coh${tile.coherence}  ${tile.mineral} d${Math.floor(tile.density)}`,
      );
    }
  }

  const user = [
    `Turn ${state.turn}/${MAX_TURNS}. You are ${me}.`,
    ``,
    `Your treasury: C${t.C} O${t.O} Ge${t.Ge} S${t.S}.`,
    `Energy you can spend THIS turn: ${energy} stored energy. Minerals are not converted to energy in this Coworld. Minerals you mint this turn arrive NEXT turn — they do NOT add to spendable energy. Keep total spend at or below ${energy} or the whole order set is rejected.`,
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
    `Return JSON with your orders for this turn.`,
  ].join("\n");

  return { system: systemWithPersona(persona, selection), user };
}

/** The Negotiate-phase prompt: board + scoreboard + recent messages + an
 *  instruction to send public/DM messages (the cheap-talk politics, design §9). */
export function renderNegotiate(
  view: AgentView,
  persona?: string,
  selection = resolvePromptSelection(),
): { system: string; user: string } {
  const { state, me } = view;
  const t = state.cogs[me]!.treasury;
  const user = [
    `Turn ${state.turn}/${MAX_TURNS}. You are ${me}. NEGOTIATION PHASE.`,
    ``,
    `Your treasury: C${t.C} O${t.O} Ge${t.Ge} S${t.S} (${state.cogs[me]!.energy} energy stored). Hearts — ${heartsLine(view)}.`,
    ``,
    `Recent messages (public + your DMs):`,
    renderMessages(view),
    ``,
    `Send public messages (to "public") or private DMs (to a cog id like "cog1") to form alliances, propose mineral trades, bluff, or threaten — nothing is binding, and you can betray later. Return JSON with your messages (empty list to stay silent). One or two sentences each.`,
  ].join("\n");
  return { system: systemWithPersona(persona, selection), user };
}
