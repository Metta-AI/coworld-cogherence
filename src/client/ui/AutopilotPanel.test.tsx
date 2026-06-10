// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { AutopilotPanel } from "./AutopilotPanel";

describe("AutopilotPanel", () => {
  let calls: Array<{ url: string; init?: RequestInit }>;

  beforeEach(() => {
    calls = [];
    let state = { persona: "be cautious", paused: false };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === "POST") state = { ...state, ...JSON.parse(init.body as string) };
        return Promise.resolve({ json: () => Promise.resolve(state) } as Response);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the cog's current guidance on mount", async () => {
    const { getByTestId } = render(<AutopilotPanel cogId="cog2" />);
    await waitFor(() => expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious"));
    expect(calls[0]!.url).toBe("/cog/cog2/steering");
  });

  it("POSTs the guidance when Send Guidance is clicked", async () => {
    const { getByTestId, getByText } = render(<AutopilotPanel cogId="cog0" />);
    await waitFor(() => expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious"));
    fireEvent.change(getByTestId("steer-persona"), { target: { value: "betray Bob now" } });
    fireEvent.click(getByText("Send Guidance"));
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post!.init!.body as string)).toEqual({ persona: "betray Bob now" });
    });
  });

  it("unchecking Enabled benches the cog (paused: true) immediately", async () => {
    const { getByRole } = render(<AutopilotPanel cogId="cog1" />);
    await waitFor(() => expect((getByRole("checkbox") as HTMLInputElement).checked).toBe(true)); // enabled = !paused
    fireEvent.click(getByRole("checkbox"));
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(JSON.parse(post!.init!.body as string)).toEqual({ paused: true });
    });
  });

  it("manual mode lists pending actions, cancels by index, and Ready fires onReady", async () => {
    const onCancel = vi.fn();
    const onReady = vi.fn();
    // manual: the steering fetch reports paused: true
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve({ json: () => Promise.resolve({ persona: "", paused: true, standingBid: 0 }) } as Response);
      }),
    );
    const pending = [
      { type: "align" as const, tile: "3,-4", force: 2 },
      { type: "exploit" as const, tile: "0,0" },
    ];
    const { getByTestId, getAllByText } = render(
      <AutopilotPanel cogId="cog0" pending={pending} onCancelPending={onCancel} onReady={onReady} />,
    );
    await waitFor(() => expect(getByTestId("pending-actions").textContent).toContain("Align(3,-4, force=2)"));
    expect(getByTestId("pending-actions").textContent).toContain("Exploit(0,0)");
    fireEvent.click(getAllByText("✕")[1]!);
    expect(onCancel).toHaveBeenCalledWith(1);
    // the bid field edits the PERSISTENT standing bid (steering POST), not the queue
    fireEvent.change(getByTestId("bid-input"), { target: { value: "7" } });
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post!.init!.body as string)).toEqual({ standingBid: 7 });
    });
    fireEvent.click(getByTestId("ready-btn"));
    expect(onReady).toHaveBeenCalled();
  });

  it("autopilot mode shows the guidance controls, not the queue", async () => {
    const { getByTestId, queryByTestId, getByText } = render(<AutopilotPanel cogId="cog0" pending={[]} />);
    await waitFor(() => expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious"));
    expect(getByText("Send Guidance")).toBeTruthy();
    expect(queryByTestId("pending-actions")).toBeNull();
    expect(queryByTestId("ready-btn")).toBeNull();
  });

  it("after Ready, shows the frozen committed orders and a Committed chip (no controls)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ persona: "", paused: true }) } as Response)),
    );
    const committed = { orders: [{ type: "align" as const, tile: "1,0", force: 2 }], notes: ["5e"], total: 5 };
    const { getByTestId, queryByTestId, queryByText } = render(
      <AutopilotPanel cogId="cog0" pending={[]} committed={committed} />,
    );
    await waitFor(() => expect(getByTestId("committed-chip")).toBeTruthy());
    expect(getByTestId("pending-actions").textContent).toContain("Align(1,0, force=2) · 5e");
    expect(queryByTestId("ready-btn")).toBeNull(); // the standing-bid field stays editable
    expect(queryByText("✕")).toBeNull(); // frozen — no cancels
  });

  it("is read-only off the latest turn: shows state, offers no controls", async () => {
    const { queryByRole, queryByText, getByText } = render(<AutopilotPanel cogId="cog0" atLatest={false} />);
    await waitFor(() => expect(getByText(/autopilot/)).toBeTruthy());
    expect(getByText("be cautious")).toBeTruthy(); // the current directive, displayed
    expect(queryByRole("checkbox")).toBeNull();
    expect(queryByText("Send Guidance")).toBeNull();
  });
});
