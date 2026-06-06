// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SteeringPanel } from "./SteeringPanel";

describe("SteeringPanel", () => {
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

  it("loads the cog's current steering on mount", async () => {
    const { getByTestId } = render(<SteeringPanel cogId="cog2" />);
    await waitFor(() => expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious"));
    expect(calls[0]!.url).toBe("/cog/cog2/steering");
  });

  it("POSTs a persona edit when Apply is clicked", async () => {
    const { getByTestId, getByText } = render(<SteeringPanel cogId="cog0" />);
    await waitFor(() => expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious"));
    fireEvent.change(getByTestId("steer-persona"), { target: { value: "betray Bob now" } });
    fireEvent.click(getByText("Apply persona"));
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post!.init!.body as string)).toEqual({ persona: "betray Bob now" });
    });
  });

  it("POSTs a pause toggle immediately", async () => {
    const { getByRole } = render(<SteeringPanel cogId="cog1" />);
    await waitFor(() => expect(getByRole("checkbox")).toBeTruthy());
    fireEvent.click(getByRole("checkbox"));
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(JSON.parse(post!.init!.body as string)).toEqual({ paused: true });
    });
  });
});
