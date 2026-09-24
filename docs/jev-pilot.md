# Cogherence Jev pilot

The optional `dist-server/game/jev-player.js` player uses System One
`typesafe/jev-1.13` to rank legal hold, bid, exploit, and nearby align choices.
It reads the redacted player view and recent inbox messages. It does not send
table talk. It uses the existing `cogweb.player.v1` protocol, so the game
version does not change.

## Local comparison

With an approved `OPENROUTER_API_KEY`, run `npx tsx tools/evaluate-jev.ts`.
The script plays ten turns for seeds 0, 1, and 2. Seat 0 alternates between
Jev and the bundled hold baseline; all other seats hold. These are partial
games, since a full Cogherence game lasts 100 turns.

| Seat 0 | Hearts after ten turns, seeds 0–2 | Jev calls | Provider cost | Mean/max call latency |
| --- | --- | ---: | ---: | ---: |
| Hold baseline | 0, 0, 0 | 0 | $0 | — |
| Jev | 6, 6, 6 | 30 | $0.001391922 | 206/286 ms |

The first prompt omitted the auction payoff. Jev held on 27 of 30 turns and
earned zero hearts. After the prompt stated that a no-bid turn cannot earn a
heart, Jev chose a bid on 27 of 30 turns. The three seeds produced the same
score against opponents who never bid. This shows protocol integration and
prompt sensitivity. It does not measure negotiation, table talk, or a gain
against active opponents.

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
A hosted policy upload remains to be run.
