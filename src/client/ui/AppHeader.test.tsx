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

  it("shows the live menu only when live (connected); replay shows a plain badge", () => {
    const replay = render(<AppHeader snapshot={snap} status={status} connected={false} {...nav} />);
    expect(replay.queryByTestId("live-menu")).toBeNull();
    const live = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(live.getByTestId("live-menu")).toBeTruthy();
  });

  it("the live menu pauses and resets a running game", () => {
    const fetchMock = vi.fn(() => Promise.resolve({} as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    fireEvent.click(getByTestId("live-menu").querySelector("button")!);
    fireEvent.click(getByTestId("lm-pause"));
    expect(fetchMock).toHaveBeenCalledWith("/pause", { method: "POST" });
    fireEvent.click(getByTestId("live-menu").querySelector("button")!); // reopen (menu closes on pick)
    fireEvent.click(getByTestId("lm-reset"));
    expect(fetchMock).toHaveBeenCalledWith("/reset", { method: "POST" });
  });

  it("the live menu's pause control resumes a paused game", () => {
    const fetchMock = vi.fn(() => Promise.resolve({} as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(<AppHeader snapshot={snap} status={{ ...status, paused: true }} connected={true} {...nav} />);
    fireEvent.click(getByTestId("live-menu").querySelector("button")!);
    fireEvent.click(getByTestId("lm-pause"));
    expect(fetchMock).toHaveBeenCalledWith("/resume", { method: "POST" });
  });

  it("renders the view-switcher dropdown showing the current view", () => {
    const { getByTestId } = render(<AppHeader snapshot={snap} status={status} connected={true} {...nav} />);
    expect(getByTestId("view-switcher").textContent).toMatch(/Global/);
  });
});
