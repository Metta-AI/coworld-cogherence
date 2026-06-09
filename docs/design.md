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

**Passive rule (every Upkeep):** every **aligned** tile compares its alignment to its neighbors.
- A **strict majority** of its neighbor slots share its alignment (more than half — ≥4 of 6) → Coherence **+1**, capped at the neighbor count.
- Otherwise (a tie or a minority) → Coherence **−1**, floored at 0.

Enemy *and* neutral neighbors both count *against* a tile, so only genuinely surrounded tiles gain. **Neutral tiles stay at Coherence 0** — they neither grow nor decay until a Cog claims them. **Edge and corner tiles** use their real neighbor count as both the majority threshold and the cap, so the rim is structurally weaker (it can hold fewer friendly neighbors).

**The neighborhood, visualized.** Every interior tile has 6 neighbors; the ±1 rule just counts how many share its alignment:

```
        N1    N2
     N6     X     N3
        N5    N4
```

Tile **X** tallies its 6 neighbor slots (enemy *and* neutral count against it):
- X is **A**, neighbors `A A A A · B` → **4 of 6 → strict majority → +1.**
- X is **A**, neighbors `A A · · B B` → only 2 → **minority → −1** (a salient rots).

A fully-surrounded interior tile gains every turn (pins at the cap); a lone forward tile loses every turn (sinks to 0). Edge/corner tiles just have fewer slots — both the majority threshold and the cap scale to their real neighbor count.

**Capture rule:** a tile changes hands two ways — a winning Align (§5) flips it to the challenger, or **erosion to Coherence 0 drops it to neutral**. A tile whose Coherence grinds to 0 (via neighbor drift §4 or unpaid upkeep §6) *loses its alignment and becomes a neutral husk* — anyone adjacent can then claim it with a fresh Align. A winning Align flips the instant a challenger's force exceeds the incumbent's defense, even from high Coherence. "Siege, not a snipe" is therefore **emergent, not a hard cap**: a Coherence-10 fortress needs 11+ force in a single turn (effectively unsnipeable), while a thin Coherence-1 salient flips for a trickle of energy — or simply rots to neutral on its own next Upkeep.

This single rule produces enormous depth, all emergent:

- **Compact blobs are fortresses.** An interior tile has 6 friendly neighbors → Coherence pins at the cap → effectively unflippable. You cannot snipe a heartland.
- **Overextension self-punishes.** A lone forward tile or thin tendril has minority-friendly neighbors → it erodes on its own, every Upkeep, for free — and once it hits 0 it falls neutral. Greedy grabs rot away entirely.
- **Encirclement is a weapon.** Align the tiles *around* an enemy hex; its neighborhood turns hostile and Upkeep grinds its Coherence to 0 *for* you — at which point it drops neutral on its own, and a trivial Align claims the husk. You capture by context, spending almost nothing on the tile itself.
- **Peace is literally stabilizing.** Two Cogs agreeing on a clean, straight border keep most border tiles majority-friendly → both stay coherent and rich. Jagged contested borders bleed Coherence for *both* sides. **Cooperation and incoherence are opposites on the board itself.**

"Entropy" is just this decay (plus upkeep, §6) — emergent, no separate front.

**The Commons** is the **sum of Coherence across all aligned tiles** — the total organized order on the board. The board-wide readout (§11) shows it against its theoretical max (the Σ of every tile's cap), so a single meter answers "is the collective mind holding together?" Consolidation and clean borders push it up; war, overextension, and Exploit push it down. There is no threshold rule — collapse is purely emergent (§8).

---

## 5. Actions (verbs)

Energy is the **sole limiter**: do as much as you can afford. Every order draws on the derived energy pool (§6).

### Align — the constructive verb (expand / capture / reinforce)
Pour energy into a tile as **pressure** toward your alignment. Resolution is a **tug-of-war**, settled simultaneously across every Cog targeting the tile:

- **Each Cog's force** = the Align energy it commits to the tile. The **incumbent** (current owner) adds its **standing Coherence** as free defense, so incumbent force = standing Coherence + any Align energy the owner also commits.
- **Winner** = highest total force; **Alignment = winner**. **New Coherence = winner's force − next-highest *opposing* force**, clamped to `[0, cap]` (cap = the tile's neighbor count, normally 6).
- A winning Align **flips** the tile the instant the challenger's force exceeds the incumbent's — even from high Coherence (§4). **Ties** in top force leave the tile with its current owner, or neutral, at Coherence 0.

Examples:
- A commits 5, B commits 3 on a **neutral** tile (standing 0) → **A holds it at Coherence 2** (5−3).
- A's tile at Coherence 4, B attacks with 3, A doesn't respond → incumbent force 4 beats 3, **A holds at 1** (4−3) — a defended grind.
- A's tile at Coherence 4, B attacks with 5 → challenger 5 beats incumbent 4, **flips to B at 1** (5−4).
- Reinforcing your **own** uncontested tile climbs its Coherence to `min(standing + committed, cap)`.

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

**Mineral production (every Upkeep):** each aligned tile mints **Density × Coherence ÷ 10** of its mineral into its Cog's **treasury**, *stochastically rounded* (a raw 2.3 mints 2, plus 1 with probability 0.3 — unbiased on average). On the 0–10 Coherence scale this means a tile at full Coherence yields its Density and weaker tiles yield proportionally less, so output rewards *both* good geography (Density) *and* stable, consolidated holdings (Coherence) while staying on a tractable scale.

**Energy is derived, not stored.** Whenever energy is needed, the engine auto-converts treasury minerals, greedily forming sets first:
- A full **COGS set** (1 C + 1 O + 1 Ge + 1 S) → **10 energy.**
- Any **single** leftover element → **1 energy.**

That 10-vs-1 gap is the political economy in one line: a balanced portfolio is **2.5× more efficient per mineral**. Since almost no Cog's land yields all four, **trade is survival, not flavor** — the mineral map *is* the diplomatic map.

**Upkeep:** each aligned tile costs **1 energy/turn**. Can't pay → the tile **loses Coherence.** Empire size has a metabolic cost; overextension is punished *twice* (salients rot via §4 *and* bleed Coherence when unfunded).

**Timing (one-turn lag):** minerals minted in Upkeep land in the treasury for *next* turn — you always Commit against last turn's production. Energy itself is never banked: it's recomputed from the treasury the moment it's needed, and any unconverted potential simply stays as minerals. The full execution order (Exploit → Align → Transfer → auction → Upkeep) is fixed in **§14**.

---

## 7. The Round

Four phases — the first three are the Diplomacy heartbeat; the fourth is the world reacting.

1. **Negotiate** *(timed, social)* — agents talk freely. **Public** channel (declarations, alliances, accusations; whole board sees) and **private** DMs (secret deals, lies, side payments). Nothing is binding.
2. **Commit** *(secret, timed)* — each Cog privately locks its orders: Align(s), Exploit(s), Transfer(s), and a **sealed heart bid** (energy). No one sees others' orders. The phase runs on a **deadline** (a hung Cog defaults to no orders), and the **first Cog to lock its Commit earns a tempo bonus** — exactly `FIRST_COMMIT_REWARD` energy, paid as units of its most abundant mineral so the marginal value is precisely that — rewarding decisiveness without warping the mineral economy. (A live mechanic: scripted replays opt out, so a deterministic instant-first doesn't dominate.)
3. **Resolve** *(simultaneous)* — all orders reveal and execute at once, in a fixed order (Exploit → Align → Transfer → auction; **§14**). Contested Aligns clash via tug-of-war (§5); the **heart auction** settles (§8). *This* is where betrayal lands — you reinforced the commons on faith while they Exploited behind your back, and the whole board sees it together.
4. **Upkeep** *(the world breathes)* — tiles mint minerals (§6); Coherence drifts ±1 by the neighbor rule (§4); upkeep is skimmed; the global **Commons** readout updates.

---

## 8. Hearts & Victory

- **Every turn, one heart** is auctioned: **sealed-bid, second-price (Vickrey)**, paid in **energy**, settled during Resolve. Highest bid wins the heart and pays the **second** price; bid ties break deterministically (§14).
- **Win:** most hearts at turn 100. Ties break by **remaining treasury value** (energy-equivalent, §6), then by **total Coherence held**.

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
- **Commons readout:** a single board-wide Coherence meter / ambient glow (Commons = total Coherence, §4) — "is the collective mind holding together?"
- **The two feeds:** a live **public** transcript; **private** DMs hidden in-game, revealable in the **post-mortem** for the full duplicity reveal.
- **Mineral overlay:** toggle to see C/O/Ge/S and Density — the diplomatic map.

---

## 12. Tunables & open details (for the spec)

**Still genuinely open:**
- Board size & shape per player count; home-cluster size; mineral/Density seeding — and how to keep 3-player vs 6-player starts fair.
- Coherence cap (default 6 = interior neighbor count; edge tiles lower, §4).
- Exploit's exact Density reduction per use; whether Exploit costs any energy (default: free); whether interior self-Exploit needs a brake (balance test, §5).
- Auction cadence (default: every turn, 1 heart) and total heart supply (default: 100).
- Partial-set mineral conversion: a leftover element is worth 1 energy (§6) — confirm no fractional carry/credit.

**Now specified elsewhere (previously open):**
- Execution & energy ordering, over-commitment handling → **§14**.
- Tug-of-war and auction tie-breaks → **§5 / §14**.
- Negotiate-phase time & token budget → **§14**.
- Majority rule, edge-tile and neutral-tile handling → **§4**.

---

## 13. Implementation note

This design lives in the **`cogame-cogherence`** repo. Implementation could either start fresh here or extend the existing **`cogame-polis`** world (Cogs, datacenters, research, commons UI) — to be decided in a separate planning conversation.

---

## 14. Agent interface — observation & action schema

*Proposed defaults for the spec. This is the machine-facing contract: exactly what each Cog reads and writes every round. Field names are illustrative.*

### 14.1 What a Cog observes
Each Cog's observation is **public state** + **its own private state** — never another Cog's secrets.

**Public (identical for all Cogs):**
- `turn`, `phase`, `players`: ids, colors, **heart counts**, alive/eliminated.
- `board`: per tile — `id`, `coords` (axial `q,r`), `neighbors` (ids), `alignment`, `coherence`, `mineral`, `density`.
- `commons`: current total Coherence and its max (§4).
- `market`: hearts remaining; last auction's winner + **price paid** (the second price). Individual bids stay secret — only the clearing result is public.
- `public_log`: the Negotiate-phase public-channel transcript.

**Private (this Cog only):**
- `treasury`: counts of `C / O / Ge / S`.
- `energy_now`: treasury greedily converted to energy (§6) — advisory; recomputed at Resolve.
- `dms`: only threads this Cog is party to.
- `last_resolution`: what actually happened to its orders last turn — which Aligns won/lost and at what Coherence, transfers received, bid outcome. This is the betrayal reveal.

A Cog never sees another Cog's treasury, pending orders, sealed bid, or private DMs.

### 14.2 What a Cog emits

**Negotiate phase** — zero or more messages:
```json
{ "type": "say", "channel": "public", "text": "..." }
{ "type": "dm", "to": "<cog_id>", "text": "..." }
```

**Commit phase** — exactly one secret order set:
```json
{
  "align":    [{ "tile": "<id>", "energy": 5 }],
  "exploit":  [{ "tile": "<id>" }],
  "transfer": [{ "to": "<cog_id>", "mineral": "S", "amount": 2 }],
  "bid":      3
}
```
All four keys optional; omit or use `[]` / `0` for none. `align.energy ≥ 1`, `transfer.amount ≥ 1`, `bid ≥ 0`.

### 14.3 Validation & failure (deterministic, engine-enforced)
- **Legal targets:** Align any tile; Exploit only tiles the Cog currently owns; Transfer only minerals it holds. Illegal entries are **dropped and logged**, never errored.
- **Energy budget (Commit):** committed energy = Σ `align.energy` + (1 per transfer) + `bid`, drawn from the treasury converted on demand (§6). **Exploit resolves first and *mints* energy** (§5), so it can fund the rest and never fails for cost. If commitments still exceed available energy at Resolve, they are paid in priority order — **transfers → aligns (submitted order) → bid** — and anything unaffordable is **dropped** (a dropped or partial bid counts as **0**). A bid only needs to be *covered* at commit — only the **winner** actually pays, and only the **second price** (§8); losers and the winner's overage are refunded.
- **Upkeep** is separate (step 5 below): each owned tile costs 1 energy; any shortfall is paid in **Coherence loss**, not order failure (§6).
- **Malformed / missing output** (timeout, invalid JSON, unknown tile id): the Cog is treated as **no orders, bid 0** for the turn, and it's logged. The game never stalls on one agent.

### 14.4 Execution order (canonical — resolves the §6/§12 ambiguity)
Steps 1–4 are **Resolve** (phase 3); step 5 is **Upkeep** (phase 4):
1. **Exploit** — mint windfalls, drop tiles to neutral @ Coherence 0, reduce density.
2. **Align** — tug-of-war on every contested tile, all simultaneously (§5).
3. **Transfer** — move minerals between treasuries.
4. **Heart auction** — Vickrey settle (§8); winner pays the second price. **Bid ties break deterministically** (e.g. lowest `cog_id`).
5. **Upkeep** — mint minerals (§6), apply the ±1 neighbor drift (§4), skim per-tile upkeep, refresh the Commons readout.

### 14.5 Time & token budget (LLM-specific)
Negotiate is **timed**: a fixed wall-clock or token budget per Cog per round, plus a bounded number of message exchanges (default: a few public + DM rounds). Exceeding the budget ends that Cog's Negotiate turn; it can still Commit. This keeps a 100-turn game tractable and stops one slow agent from stalling the match.

---

## 15. Worked example — one full turn

*Three Cogs (**A**, **B**, **C**), mid-game, Turn 42. Talk → secret orders → simultaneous reveal → the world reacting, with real numbers.*

### Start of turn — what each Cog holds
Treasuries carry over from Turn 41's Upkeep — you always spend *last* turn's production (§6, one-turn lag). Energy is derived greedily, sets first (§6):

| Cog | C | O | Ge | S | Energy available |
|---|---|---|---|---|---|
| A | 2 | 2 | 2 | 1 | 1 COGS set (10) + 3 singles = **13** |
| B | 3 | 0 | 3 | 3 | no set (0 O) + 9 singles = **9** |
| C | 1 | 1 | 1 | 1 | 1 set = **10** |

Tracked tiles:

| Tile | Owner | Coherence | Mineral | Density |
|---|---|---|---|---|
| t1 | A | 4 | O | 2 |
| t2 | neutral | 0 | S | 3 |
| t3 | A | 2 | Ge | 1 |

t1 is A's frontier O-tile (B eyes it); t2 is unclaimed **S** that A badly needs; t3 is a thin A salient A expects to lose.

### 1. Negotiate (public + DM, non-binding §9)
- **Public:** A proposes a border truce — "t1 stays mine, no aggression." B agrees on the public channel.
- **DM (A→B):** "You're starved for O — I'll send 2 O this turn if you leave t1 alone." B: "Deal."

### 2. Commit (secret, simultaneous §7)
- **A** (13e): Align **t2** ← 5 · **Exploit t3** · **Transfer 2 O → B** (1e) · **bid 3.** *(A intends to keep its word.)*
- **B** (9e): Align **t1** ← 5 · **bid 4.** *(Betrayal — attacks the truce tile; tapped out at 5 + 4 = 9.)*
- **C** (10e): Align **t2** ← 3 · **bid 2.**

### 3. Resolve (canonical order §14.4)
**① Exploit** — A scorches t3 (Coh 2, Ge, D1) before losing it: windfall = 2 × Coherence × Density = 2 × 2 × 1 = **4 Ge** to A (minted now, can fund the rest of A's turn); t3 → **neutral @ 0**, Density **1 → 0** (scarred, §12).

**② Align** (tug-of-war, all at once §5):
- **t1:** incumbent A = standing 4 + 0 committed = **4**; challenger B = **5**. B wins → **t1 flips to B @ Coherence 1** (5 − 4). *The betrayal lands.*
- **t2:** neutral (0) vs A (5) vs C (3). A wins; next-highest *opposing* force = C's 3 → **A captures t2 @ Coherence 2** (5 − 3). C's 3 energy bought nothing.

**③ Transfer** — 2 O lands in B's treasury. **A kept its promise; B broke its.** The reveal shows both at once — the whole point of simultaneous resolution.

**④ Heart auction** (Vickrey, second-price §8): bids A 3, B 4, C 2 → **B wins**, pays the **second price = 3** energy (A's bid). B: hearts +1. *(B had 9 − 5 = 4 left, so 3 is covered; an uncovered bid would be zeroed, §14.3. A and C lose, so pay nothing — A's 3 reserved energy is freed.)*

### 4. Upkeep — the world breathes (§14.5)
- **Mint** (Density × Coherence → owner, for *next* turn): t1 → 2 O to B; t2 → **6 S to A** (A finally has S income); t3 (neutral) → nothing.
- **Drift (±1, §4):** t2 sits inside A's cluster (4 of 6 neighbors A) → majority → **+1 → 3.** t1 is now a lone **B** salient ringed by A → minority → **−1 → 0.** *B's prize is already rotting; A can retake the husk next turn for a trickle.*
- **Upkeep skim:** 1 energy per owned tile; a Cog that can't pay loses Coherence instead.
- **Commons:** across these tiles, aligned Coherence went 4 + 2 = **6 → 0 + 3 = 3.** War + Exploit **frayed the Commons** even though the tiles only changed hands.

### What this turn demonstrates
- **Tug-of-war is king:** a winning Align flips t1 in one turn — no grind-to-0 required (§4/§5).
- **The reveal is the drama:** A paid the O it promised; B broke the truce — exposed together (§9).
- **Greed self-punishes:** B's grab is a salient that erodes immediately (§4).
- **Trade is survival:** A's balanced wallet (a COGS set → 13e) outspends B's starved 9e with no O (§6).
- **Buying victory costs the world:** the heart drained energy B can't spend on its rotting frontier (§8).
