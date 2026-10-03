import { expect, it } from "vitest";
import { cogherenceGame } from "./game.js";
import { normalizePosts } from "./speech.js";
import { TrainingSession } from "./training-bridge.js";

it("only explicitly public posts broadcast; valid private posts keep their recipient", () => {
  const state = cogherenceGame.newGame({
    playerCount: 4,
    seed: "recipient",
    seatNames: ["A", "B", "C", "D"],
  });
  const view = cogherenceGame.redact(state, 0);
  expect(
    normalizePosts(
      {
        messages: [
          { to: "public", text: "public" },
          { to: view.cogs[1]!.id, text: "private" },
        ],
      },
      view,
      0,
    ),
  ).toEqual([
    { to: null, text: "public" },
    { to: 1, text: "private" },
  ]);
  for (const to of ["unknown-cog", view.cogs[0]!.id])
    expect(() => normalizePosts({ messages: [{ to, text: "private intent" }] }, view, 0)).toThrow(
      "Recipient must be public or another cog's id",
    );
});
it.each(["unknown", "self"])(
  "consumes %s private-recipient rejection as silence through the ordinary training bridge",
  (recipient) => {
    const bridge = new TrainingSession("recipient", 4);
    const observation = bridge.observation();
    if (observation.kind !== "decision") throw new Error("Expected speech decision");
    const to =
      recipient === "self" ? observation.semantic_view.cogs[observation.seat]!.id : "unknown-cog";
    const result = bridge.step(
      observation.decision_id,
      JSON.stringify({ messages: [{ to, text: "private intent" }] }),
    );
    expect(result).toMatchObject({ kind: "consumed_rejection", action: { messages: [] } });
  },
);
