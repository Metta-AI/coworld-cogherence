// Per-player fog-of-war over a full GameState — the GameState-level analog of
// `buildCogSnapshot` (which redacts the flat GameSnapshot). A Coworld player
// receives an AgentView whose `state` is a GameState, so we project that:
// opponents' treasury and stored energy are hidden (zeroed), and the resolved
// `log` is dropped (the renderer never reads it, and it carries other cogs'
// past orders + sealed bids). The board, hearts, and turn stay public.
import type { GameState, CogId } from "../shared/engine/types";
import { emptyTreasury } from "../shared/engine/types";

export function redactStateFor(state: GameState, viewer: CogId): GameState {
  const cogs: GameState["cogs"] = {};
  for (const id of state.cogOrder) {
    const c = state.cogs[id]!;
    cogs[id] = id === viewer ? c : { ...c, treasury: emptyTreasury(), energy: 0 };
  }
  return { ...state, cogs, log: [] };
}
