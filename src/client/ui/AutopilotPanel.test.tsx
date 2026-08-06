// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { BotSpec, ClientMessage } from "@cogweb/protocol";
import { AutopilotPanel } from "./AutopilotPanel";

const auto = (guidance = "be cautious"): BotSpec => ({ model: null, guidance, autopilot: true });
const manual = (guidance = ""): BotSpec => ({ model: null, guidance, autopilot: false });

describe("AutopilotPanel", () => {
  it("shows the seat's current guidance from the bot spec", () => {
    const { getByTestId } = render(<AutopilotPanel seat={2} bot={auto()} send={() => {}} />);
    expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious");
  });

  it("sends setGuidance when Send Guidance is clicked", () => {
    const sent: ClientMessage[] = [];
    const { getByTestId, getByText } = render(<AutopilotPanel seat={0} bot={auto()} send={(m) => sent.push(m)} />);
    fireEvent.change(getByTestId("steer-persona"), { target: { value: "betray Bob now" } });
    fireEvent.click(getByText("Send Guidance"));
    expect(sent).toContainEqual({ type: "setGuidance", seat: 0, guidance: "betray Bob now" });
  });

  it("unchecking Enabled benches the cog (setAutopilot on:false)", () => {
    const sent: ClientMessage[] = [];
    const { getByRole } = render(<AutopilotPanel seat={1} bot={auto()} send={(m) => sent.push(m)} />);
    expect((getByRole("checkbox") as HTMLInputElement).checked).toBe(true); // enabled = autopilot on
    fireEvent.click(getByRole("checkbox"));
    expect(sent).toContainEqual({ type: "setAutopilot", seat: 1, on: false });
  });

  it("shows an explicit ON/OFF state pill so the toggle's state is legible", () => {
    const on = render(<AutopilotPanel seat={0} bot={auto()} send={() => {}} />);
    expect(on.container.querySelector(".steer-state")?.textContent).toBe("ON");
    const off = render(<AutopilotPanel seat={0} bot={manual()} send={() => {}} />);
    expect(off.container.querySelector(".steer-state")?.textContent).toBe("OFF");
  });

  it("sends setModel when the model dropdown changes", () => {
    const sent: ClientMessage[] = [];
    const { getByTestId } = render(<AutopilotPanel seat={3} bot={{ model: null, guidance: "", autopilot: true }} send={(m) => sent.push(m)} />);
    const select = getByTestId("steer-model") as HTMLSelectElement;
    const opt = select.querySelector("option:not([disabled])") as HTMLOptionElement;
    fireEvent.change(select, { target: { value: opt.value } });
    expect(sent).toContainEqual({ type: "setModel", seat: 3, model: opt.value });
  });

  it("manual mode lists pending actions, cancels by index, and Ready fires onReady", () => {
    const onCancel = vi.fn();
    const onReady = vi.fn();
    const pending = [
      { type: "align" as const, tile: "3,-4", force: 2 },
      { type: "exploit" as const, tile: "0,0" },
    ];
    const { getByTestId, getAllByText } = render(
      <AutopilotPanel seat={0} bot={manual()} send={() => {}} pending={pending} onCancelPending={onCancel} onReady={onReady} />,
    );
    expect(getByTestId("pending-actions").textContent).toContain("Align(3,-4, force=2)");
    expect(getByTestId("pending-actions").textContent).toContain("Exploit(0,0)");
    fireEvent.click(getAllByText("✕")[1]!);
    expect(onCancel).toHaveBeenCalledWith(1);
    fireEvent.click(getByTestId("ready-btn"));
    expect(onReady).toHaveBeenCalled();
  });

  it("autopilot mode shows the guidance controls, not the queue", () => {
    const { getByTestId, queryByTestId, getByText } = render(<AutopilotPanel seat={0} bot={auto()} send={() => {}} pending={[]} />);
    expect((getByTestId("steer-persona") as HTMLTextAreaElement).value).toBe("be cautious");
    expect(getByText("Send Guidance")).toBeTruthy();
    expect(queryByTestId("pending-actions")).toBeNull();
    expect(queryByTestId("ready-btn")).toBeNull();
  });

  it("after Ready, shows the frozen committed orders and a Committed chip (no controls)", () => {
    const committed = { orders: [{ type: "align" as const, tile: "1,0", force: 2 }], notes: ["5e"], total: 5 };
    const { getByTestId, queryByTestId, queryByText } = render(
      <AutopilotPanel seat={0} bot={manual()} send={() => {}} pending={[]} committed={committed} />,
    );
    expect(getByTestId("committed-chip")).toBeTruthy();
    expect(getByTestId("pending-actions").textContent).toContain("Align(1,0, force=2) · 5e");
    expect(queryByTestId("ready-btn")).toBeNull();
    expect(queryByText("✕")).toBeNull(); // frozen — no cancels
  });

  it("is read-only off the latest turn: shows state, offers no controls", () => {
    const { queryByRole, queryByText, getByText } = render(<AutopilotPanel seat={0} bot={auto()} send={() => {}} atLatest={false} />);
    expect(getByText(/autopilot/)).toBeTruthy();
    expect(getByText("be cautious")).toBeTruthy(); // the current directive, displayed
    expect(queryByRole("checkbox")).toBeNull();
    expect(queryByText("Send Guidance")).toBeNull();
  });
});
