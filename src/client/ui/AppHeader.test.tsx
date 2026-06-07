// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
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

  it("shows the reset button only when live (connected)", () => {
    const replay = render(<AppHeader snapshot={snap} status={status} connected={false} {...nav} />);
    expect(replay.queryByTestId("reset-btn")).toBeNull();
    const live = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(live.getByTestId("reset-btn")).toBeTruthy();
  });

  it("POSTs /reset when the reset button is clicked", () => {
    const fetchMock = vi.fn(() => Promise.resolve({} as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    fireEvent.click(getByTestId("reset-btn"));
    expect(fetchMock).toHaveBeenCalledWith("/reset", { method: "POST" });
  });

  it("renders the view-switcher dropdown showing the current view", () => {
    const { getByTestId } = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(getByTestId("view-switcher").textContent).toMatch(/Global/);
  });
});
