// Per-observer projection of a snapshot: the board + everyone's hearts are public,
// but only the viewer sees its own treasury/energy. One redaction path for live +
// replay + fog of war. (Message redaction is added in Phase C.)
import type { CogId } from "../shared/engine/types";
import type { GameSnapshot } from "../shared/snapshot";

export function buildCogSnapshot(snap: GameSnapshot, viewer: CogId): GameSnapshot {
  return {
    ...snap,
    cogs: snap.cogs.map((c) =>
      c.id === viewer ? c : { ...c, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 0 },
    ),
  };
}
