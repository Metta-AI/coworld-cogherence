// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PhaseStrip } from "./PhaseStrip";
import type { ServerStatus } from "../../shared/protocol";

const status = (over: Partial<ServerStatus> = {}): ServerStatus => ({
  turn: 5,
  phase: "commit",
  finished: false,
  cogCount: 4,
  clientCount: 1,
  pending: ["cog2", "cog3"],
  done: ["cog0", "cog1"],
  ...over,
});

describe("PhaseStrip", () => {
  it("lights the current phase and marks earlier ones done", () => {
    const { container } = render(<PhaseStrip status={status({ phase: "commit" })} />);
    const chips = [...container.querySelectorAll(".phase-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["negotiate", "commit", "resolve", "upkeep"]);
    expect(chips[0]!.className).toContain("done"); // negotiate already passed
    expect(chips[1]!.className).toContain("live"); // commit is live
    expect(chips[2]!.className).not.toContain("live");
  });

  it("shows the ready count during commit (the deadline countdown lives in the header)", () => {
    const { getByTestId } = render(<PhaseStrip status={status({ phase: "commit" })} />);
    expect(getByTestId("phase-strip").textContent).toMatch(/2\/4 ready/);
  });

  it("shows no ready count outside commit", () => {
    const { getByTestId } = render(<PhaseStrip status={status({ phase: "negotiate" })} />);
    expect(getByTestId("phase-strip").textContent).not.toMatch(/ready/);
  });
});
