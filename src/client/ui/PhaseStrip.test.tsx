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

  it("shows ready count + countdown during commit", () => {
    const future = Date.now() + 8000;
    const { getByTestId } = render(<PhaseStrip status={status({ phase: "commit", phaseDeadlineAt: future })} />);
    const text = getByTestId("phase-strip").textContent ?? "";
    expect(text).toMatch(/2\/4 ready/);
    expect(text).toMatch(/\d+s/); // a seconds countdown
  });

  it("shows a countdown during a deadlined negotiate phase, but no ready count", () => {
    const future = Date.now() + 12000;
    const { getByTestId } = render(<PhaseStrip status={status({ phase: "negotiate", phaseDeadlineAt: future })} />);
    const text = getByTestId("phase-strip").textContent ?? "";
    expect(text).toMatch(/\d+s/); // countdown shows here too (it's the long cog-facing window)
    expect(text).not.toMatch(/ready/); // ready count is Commit-only
  });

  it("shows no meta when there's no deadline", () => {
    const { getByTestId } = render(<PhaseStrip status={status({ phase: "negotiate", phaseDeadlineAt: undefined })} />);
    expect(getByTestId("phase-strip").textContent).not.toMatch(/ready|\ds/);
  });
});
