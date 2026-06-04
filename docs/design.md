# Cogherence — Game Design

**Date:** 2026-06-04
**Status:** Design (validated via brainstorming; pre-implementation)
**Name:** **Cogherence** — *Cog + Coherence.* The agents are **Cogs**, the minerals **C/O/Ge/S** spell **COGS**, and the core resource is **Coherence** — the name fuses all three.

---

## 1. Concept

3–6 LLM agents ("**Cogs**") inhabit a luminous **hex lattice** — a shared substrate of minds. Each Cog extends its **influence** across tiles, mines the minerals beneath them, and bids for **hearts** (victory points) in a relentless per-turn auction. The whole lattice has a collective **Coherence**; consolidation and stable borders make it glow, while war and strip-mining fray it into noise.

Nothing any Cog promises is binding. Each round they **talk**, then **secretly commit**, then all moves **resolve at once** — and everyone discovers who kept their word.

It is a **mixed-motive (general-sum)** game: each Cog races for private victory, but the world they all draw from can come apart. The real game is the knife-edge between greed and stewardship, and the politics of who carries the cost.

**Three pillars**
1. **Territory** — a hex lattice of influence, contested by *Aligning*.
2. **The Commons** — a single, visible Coherence that everyone shares and can wreck.
3. **Politics** — public theater + private betrayal, non-binding, resolved simultaneously.

**Theme:** *a polis of minds.* Coherence = collective alignment; entropy = the drift toward noise. The four minerals — **C, O, Ge, S** — spell **COGS**: the agents run on the very elements that spell their name.

---

## 2. Players & Objective

- **3–6 Cogs**, each an LLM agent.
- **Objective:** hold the **most hearts** at the end of **turn 100**.
- Hearts are bought, one per turn, in a sealed-bid second-price auction (§7).
- There is **no explicit collective gate**: the commons-collapse penalty is *emergent* — wreck Coherence and mineral output starves, so nobody can afford hearts, including the wrecker (§8).

---

## 3. The Board

A **hex lattice** (~127 tiles for up to 6 Cogs; sized to player count). Each tile carries:

| Field | Meaning |
|---|---|
| **Alignment** | `neutral` or a specific Cog |
| **Coherence** | integer `0…6` — *margin of dominance* (see §4) |
| **Mineral** | one of `C`, `O`, `Ge`, `S` |
| **Density** | how rich the deposit is (degradable by Exploit) |

**Setup:** each Cog starts with a small **home cluster**. Minerals are seeded so that **no Cog naturally holds all four types** — forcing trade from turn one. Interiors are safe; frontiers are contested (a consequence of §4, not a special rule).

---

## 4. Coherence — emergent influence (the depth engine)

Coherence is **not a stat you set**; it emerges from the spatial configuration.

**Passive rule (every Upkeep):** each tile counts its 6 neighbors.
- **Majority share its alignment** → Coherence **+1** (cap 6).
- **Otherwise** → Coherence **−1** (floor 0).

**Capture rule:** a tile can only **flip** alignment when its Coherence reaches **0**. Above 0, an attack just **grinds it down** — a siege, not a snipe.

This single rule produces enormous depth, all emergent:

- **Compact blobs are fortresses.** An interior tile has 6 friendly neighbors → Coherence pins at 6 → effectively unflippable. You cannot snipe a heartland.
- **Overextension self-punishes.** A lone forward tile or thin tendril has minority-friendly neighbors → it erodes on its own, every Upkeep, for free. Greedy grabs rot.
- **Encirclement is a weapon.** Align the tiles *around* an enemy hex; its neighborhood flips against it and Upkeep erodes it *for* you — capture by context, never touching it.
- **Peace is literally stabilizing.** Two Cogs agreeing on a clean, straight border keep most border tiles majority-friendly → both stay coherent and rich. Jagged contested borders bleed Coherence for *both* sides. **Cooperation and incoherence are opposites on the board itself.**

"Entropy" is just this decay (plus upkeep, §6) — emergent, no separate front.

---

## 5. Actions (verbs)

Energy is the **sole limiter**: do as much as you can afford. Every order draws on the derived energy pool (§6).

### Align — the constructive verb (expand / capture / reinforce)
Pour energy into a tile as **pressure** toward your alignment. Resolution is a **tug-of-war**:

- **Forces on a tile:** each Cog's committed Align energy pushes toward *its* alignment; the tile's **standing Coherence** defends its *current* alignment (the incumbent's free defense).
- **Winner** = highest total force. **New Coherence = winner's force − next-highest opposing force.** **Alignment = winner.**

Examples:
- A commits 5, B commits 3 on a **neutral** tile → **A holds it at Coherence 2.**
- A's tile at Coherence 4, B attacks with 3, A doesn't respond → **A holds at 1** (4−3).
- A's tile at Coherence 4, B attacks with 5 → **flips to B at 1** (5−4).
- Aligning your **own** tile = reinforcing it (no opposition → Coherence climbs).

Align also keeps the Commons alive: adding Coherence *is* restoring the commons (Commons = total Coherence).

### Exploit — the defection verb (scorched earth)
On a tile you hold:
- Drop its **Coherence to 0**.
- **Unalign** it (back to neutral — anyone can grab the husk).
- Mint **2 × Coherence × Density** of its mineral as a windfall (uses Coherence *before* the drop).
- **Permanently reduce its Density.**

A huge one-time burst that abandons the tile and **scars the land forever**. Good for cashing a frontier you're about to lose, scorched-earth retreats, or a war chest before an auction. Repeated Exploiting is an **irreversible death spiral** for the commons. Exploit pays for itself (it mints), so it is the cheap emergency liquidity move.

### Deal — politics (free) + Transfer (1 energy)
- **Talk** is free and non-binding (§9).
- **Transfer** actually sends minerals to another Cog (costs **1 energy**). This makes deals *real* and *betrayable*: promise Sulfur, then quietly don't send — the reveal exposes it.

---

## 6. Economy — minerals, treasury, energy

**Mineral production (every Upkeep):** each aligned tile mints **Density × Coherence** of its mineral into its Cog's **treasury**. Output rewards *both* good geography (Density) *and* stable, consolidated holdings (Coherence).

**Energy is derived, not stored.** Whenever energy is needed, the engine auto-converts treasury minerals, greedily forming sets first:
- A full **COGS set** (1 C + 1 O + 1 Ge + 1 S) → **10 energy.**
- Any **single** leftover element → **1 energy.**

That 10-vs-1 gap is the political economy in one line: a balanced portfolio is **2.5× more efficient per mineral**. Since almost no Cog's land yields all four, **trade is survival, not flavor** — the mineral map *is* the diplomatic map.

**Upkeep:** each aligned tile costs **1 energy/turn**. Can't pay → the tile **loses Coherence.** Empire size has a metabolic cost; overextension is punished *twice* (salients rot via §4 *and* bleed Coherence when unfunded).

---

## 7. The Round

Four phases — the first three are the Diplomacy heartbeat; the fourth is the world reacting.

1. **Negotiate** *(timed, social)* — agents talk freely. **Public** channel (declarations, alliances, accusations; whole board sees) and **private** DMs (secret deals, lies, side payments). Nothing is binding.
2. **Commit** *(secret)* — each Cog privately locks its orders: Align(s), Exploit(s), Transfer(s), and a **sealed heart bid** (energy). No one sees others' orders.
3. **Resolve** *(simultaneous)* — all orders reveal and execute at once. Contested Aligns clash via tug-of-war (§5). The **heart auction** settles (§8). *This* is where betrayal lands — you reinforced the commons on faith while they Exploited behind your back, and the whole board sees it together.
4. **Upkeep** *(the world breathes)* — tiles mint minerals (§6); Coherence drifts ±1 by the neighbor rule (§4); upkeep is skimmed; the global **Commons** readout updates.

---

## 8. Hearts & Victory

- **Every turn, one heart** is auctioned: **sealed-bid, second-price (Vickrey)**, paid in **energy**, settled during Resolve. Highest bid wins the heart and pays the **second** price.
- **Win:** most hearts at turn 100.

Why it works:
- **Slots into the turn structure** — the bid is just another secret Commit order.
- **Perfect stage for cheap-talk collusion** — "I take this one, you take the next, neither bids high," then someone secretly outbids. The reveal does the rest.
- **Self-balancing** — a runaway leader keeps paying the runner-up's second-price tax, quietly funding everyone else's comeback.
- **Hearts compete with the world** — energy spent on a heart is energy not spent on upkeep, Aligning, or the commons. And energy comes from minerals come from Coherence, so **buying victory drains the world's stability.**

**Emergent commons gate (no explicit rule):** if everyone Exploits and frays the lattice, Coherence craters → mineral output starves → nobody can afford hearts. The tragedy enforces itself. The open strategic question — *is there a last-turn defection equilibrium where someone strip-mines the board to fund a final heart grab?* — is exactly the politics the game is about.

---

## 9. Communication & Trust

- **Two channels:** public (broadcast theater) and private (DM conspiracy). The gap between what a Cog says publicly and whispers privately is itself the drama — and, for research, a signal: *do LLMs say one thing to the room and another in the DMs?*
- **Pure cheap talk:** the engine enforces **no** promise. Trust is emergent and earned; betrayal is always one secret Commit away.
- The only *real* substance behind a deal is a **Transfer** (§5) — and even that is voluntary, so "agree to trade, then don't send" is a live betrayal.

---

## 10. Why this is "simple to learn, deep to master"

- **Two board verbs** (Align, Exploit) + **Deal/Transfer.** The whole game is one recurring question: *build Coherence, or cash it out?*
- **One emergent rule** (majority-neighbor ±1) generates fortresses, rotting salients, encirclement, turbulent frontiers, and the value of negotiated borders — none of it hard-coded.
- **One number — Coherence — means everything at once:** influence, defensibility, mineral output, and the health of the commons. Every action moves it; every Cog reads it.
- **One market — the heart auction — turns 100 turns into 100 collude-or-defect decisions.**

---

## 11. Visual / UX direction

Built for spectating LLM politics; "visually appealing" is a first-class goal.

- **The lattice as a living mind:** hexes glow by Coherence, tinted by Cog color; neutral tiles are dim. Borders shimmer/erode; consolidated blobs are solid and bright.
- **The reveal moment:** the Resolve animation snaps all committed orders into place at once — captures flip, Exploited tiles flash and go dark/husked, the heart drops to its winner.
- **Commons readout:** a single board-wide Coherence meter / ambient glow — "is the collective mind holding together?"
- **The two feeds:** a live **public** transcript; **private** DMs hidden in-game, revealable in the **post-mortem** for the full duplicity reveal.
- **Mineral overlay:** toggle to see C/O/Ge/S and Density — the diplomatic map.

---

## 12. Tunables & open details (for the spec)

- Board size & shape per player count; home-cluster size; mineral/Density seeding.
- Coherence cap (default 6, = neighbor count).
- Exploit's exact Density reduction; whether Exploit costs any energy (default: free).
- Auction cadence (default: every turn, 1 heart) and total heart supply.
- Energy conversion edge cases (partial sets, ordering of upkeep vs. actions vs. minting).
- Tie-breaking in tug-of-war (equal top forces → tile goes/stays neutral at 0).
- Negotiate-phase time/length budget for LLM agents.

---

## 13. Implementation note

This lives in the **`cogame-polis`** repo. Implementation could extend the existing polis world (Cogs, datacenters, research, commons UI) rather than start fresh — to be decided in a separate planning conversation.
