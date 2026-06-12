// A full, serializable view of one turn: every tile + every cog.
// The unit the client renders and the live server (phase 3) broadcasts.
import type { GameState, CogId, Mineral, Treasury, Phase } from "./engine/types";
import { COHERENCE_MAX, BOARD_RADIUS } from "./engine/constants";
import { COGHERENCE_VERSION } from "./version";

export interface TileSnapshot {
  q: number;
  r: number;
  alignment: CogId | null;
  coherence: number;
  mineral: Mineral;
  density: number;
  density0: number;
}
export interface CogSnapshot {
  id: CogId;
  index: number;
  name: string;
  hearts: number;
  treasury: Treasury;
  energy: number;
}
export interface GameSnapshot {
  version: string;
  seed: number;
  turn: number;
  phase: Phase;
  radius: number;
  coherenceMax: number;
  tiles: TileSnapshot[];
  cogs: CogSnapshot[];
}

/** Project the live GameState into a flat, serializable snapshot. Pure. */
export function toSnapshot(state: GameState): GameSnapshot {
  const tiles: TileSnapshot[] = Object.values(state.tiles).map((t) => ({
    q: t.hex.q,
    r: t.hex.r,
    alignment: t.alignment,
    coherence: t.coherence,
    mineral: t.mineral,
    density: t.density,
    density0: t.density0,
  }));
  const cogs: CogSnapshot[] = state.cogOrder.map((id) => {
    const c = state.cogs[id]!;
    return { id: c.id, index: c.index, name: c.name, hearts: c.hearts, treasury: { ...c.treasury }, energy: c.energy };
  });
  return {
    version: COGHERENCE_VERSION,
    seed: state.seed,
    turn: state.turn,
    phase: state.phase,
    radius: BOARD_RADIUS,
    coherenceMax: COHERENCE_MAX,
    tiles,
    cogs,
  };
}
