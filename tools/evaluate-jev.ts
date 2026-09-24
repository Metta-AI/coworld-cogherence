import { cogherenceGame, cogherenceModule } from "../src/game/game.js";
import { decide } from "../src/game/jev-player.js";

const turns = 10;
for (const opponentBid of [0, 2]) {
  for (const seed of [0, 1, 2]) {
    for (const jev of [false, true]) {
      let state = cogherenceGame.newGame({ seed: String(seed), playerCount: 4, seatNames: [] });
      for (let turn = 0; turn < turns; turn++) {
        for (let seat = 0; seat < 4; seat++) {
          const decision = jev && seat === 0
            ? await decide({
                view: cogherenceGame.redact(state, seat),
                seat,
                turn,
                messages: [],
                reason: null,
                timeLeftMs: null,
                config: {},
                module: cogherenceModule,
              })
            : opponentBid > 0
              ? { orders: [{ type: "bid" as const, energy: opponentBid }] }
              : cogherenceGame.baselineDecision(state, seat);
          state = cogherenceGame.applyDecision(state, seat, decision).state;
        }
      }
      console.log(JSON.stringify({ opponentBid, seed, jev, turns, score: cogherenceGame.score(state) }));
    }
  }
}
