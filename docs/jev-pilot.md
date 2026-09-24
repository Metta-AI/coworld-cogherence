# Cogherence Jev pilot

The optional `dist-server/game/jev-player.js` player uses System One
`typesafe/jev-1.13` to rank legal hold, bid, exploit, and nearby align choices.
It reads the redacted player view and recent inbox messages. It does not send
table talk. It uses the existing `cogweb.player.v1` protocol, so the game
version does not change.

## Local comparison

With an approved `OPENROUTER_API_KEY`, run `npx tsx tools/evaluate-jev.ts`.
The script plays ten turns for seeds 0, 1, and 2. Seat 0 alternates between
Jev and a matched baseline. Opponents either hold or bid two energy every
turn. These are partial games, since a full Cogherence game lasts 100 turns.

| Opponents | Jev hearts, seeds 0–2 | Matched baseline hearts | Jev calls | Provider cost |
| --- | --- | --- | ---: | ---: |
| Hold | 10, 10, 6 | 0, 0, 0 | 30 | $0.001629474 |
| Bid two | 0, 0, 0 | 10, 10, 10 | 30 | $0.001621620 |

The first prompt omitted the auction payoff. Jev held on 27 of 30 turns and
earned zero hearts. After the prompt stated that a no-bid turn cannot earn a
heart, an initial run earned six hearts in each seed. A repeat with the
same seeds earned 10, 10, and 6 hearts, showing model variability. Against
active bidders, Jev bid one on all 30 turns and lost every heart. A general
instruction to raise bids when losing did not improve that result. This
shows protocol integration and a strategy failure against active opponents.

## Complete local episode

The first full container run earned six hearts. Jev exploited its only tile
on turn 7, so its later bids were ineligible. The candidate generator now
excludes that action when only one tile remains.

The corrected player completed all 100 turns against three bundled hold
players. It chose a one-energy bid 50 times, then held after its stored energy
reached zero. It earned 50 hearts; the other seats earned zero. Its 100 calls
cost $0.003565506 and averaged 230 ms (640 ms maximum). No action was rejected,
and every reported Jev choice matched the applied probability maximum.

`npm run typecheck`, `npm test` (236 tests), and `npm run build` passed. The
`linux/amd64` image built, and the full local Coworld episode completed with
the image's `jev-player.js` entrypoint. The result is against passive opponents;
it is not evidence of negotiation skill or performance against active players.

## Private production canary

The relh-owned `relh-cogherence-jev-20260923:v1` player completed private Experience Request `xreq_ec863877-767e-4ea8-b9e0-62e67b2ed8cf` against three active league policies. Jev earned one heart; the other seats earned 99, 0, and 0. Seat 0 logged 100 Jev judgments with no player error. Provider cost was $0.004786824, mean client latency was 222 ms, and maximum latency was 480 ms. The total episode cost was $0.043358 under a $0.05 combined player LLM cap. The result confirms hosted integration and exposes poor auction play against the active opponent. No ladder submission or game-version change occurred.
