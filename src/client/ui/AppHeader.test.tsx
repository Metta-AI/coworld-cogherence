// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { AppHeader } from "./AppHeader";
import { toSnapshot } from "../../shared/snapshot";
import { newGame } from "../../shared/engine/game";

const snap = toSnapshot(newGame(7, 4));
const status = { turn: 1, phase: "negotiate" as const, finished: false, cogCount: 4, clientCount: 1, pending: [], done: [] };
const nav = { view: "global" as const, cogId: null, live: true, cogs: [{ id: "cog0", index: 0 }] };

describe("AppHeader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the live badge only when live (connected); replay shows a plain badge", () => {
    const replay = render(<AppHeader snapshot={snap} status={status} connected={false} {...nav} />);
    expect(replay.queryByTestId("live-badge")).toBeNull();
    const live = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(live.getByTestId("live-badge").textContent).toMatch(/live/);
  });

  it("the badge reflects a paused game (the scrubber transport drives pause/resume)", () => {
    const { getByTestId } = render(<AppHeader snapshot={snap} status={{ ...status, paused: true }} connected={true} {...nav} />);
    expect(getByTestId("live-badge").textContent).toMatch(/paused/);
  });

  it("renders the view-switcher dropdown showing the current view", () => {
    const { getByTestId } = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(getByTestId("view-switcher").textContent).toMatch(/Global/);
  });
});
