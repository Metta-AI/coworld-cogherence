import { describe, expect, it } from "vitest";

import { MAX_TURNS } from "../shared/engine/constants.js";
import { TrainingSession } from "./training-bridge.js";

describe("Cogherence training bridge", () => {
  it("keeps the hosted seat view redacted and completes the 100-turn engine game", () => {
    const session = new TrainingSession("proof-seed", 4);
    let observation = session.observation();
    for (let decision = 0; decision < MAX_TURNS * 4; decision++) {
      expect(observation.kind).toBe("decision");
      if (observation.kind !== "decision") throw new Error("Game ended early");
      expect(observation.seat).toBe(decision % 4);
      expect(observation.semantic_view.cogs.filter((cog) => cog.index !== observation.seat).every((cog) => cog.energy === 0)).toBe(true);
      const encoding = session.encode();
      expect(encoding.decision_id).toBe(decision);
      expect(encoding.values).toHaveLength(1308);
      expect(encoding.actions).toHaveLength(30);
      expect(encoding.actions[0]).toEqual({ choice: "hold" });
      const result = session.step(decision, session.teacher().response);
      expect(result.kind).toBe("accepted");
      if (result.kind !== "accepted") throw new Error("Teacher was rejected");
      observation = result.observation;
    }
    expect(observation).toEqual({ kind: "terminal", scores: { 0: 0, 1: 0, 2: 0, 3: 0 } });
  });

  it("rejects stale or unknown choices without advancing", () => {
    const session = new TrainingSession("proof-seed", 4);
    expect(session.step(1, '{"choice":"hold"}').kind).toBe("rejected");
    expect(session.step(0, '{"choice":"missing"}').kind).toBe("rejected");
    expect(session.observation().decision_id).toBe(0);
  });
});
