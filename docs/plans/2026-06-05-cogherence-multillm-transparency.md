# Cogherence Multi-LLM + Transparency (Phase B) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run live LLM Cogs on the Phase-A server and surface, in the dashboard, exactly what each Cog's model saw and decided each turn (the act-prompt transparency layer).

**Architecture:** `GameRunner` already drives any `Agent` (incl. `llmAgent`) through its commit barrier, so live LLM play needs no runner change. Transparency is a **decoupled side-channel**: an `ActPromptHub` (a bounded per-cog log + a subscribe hook). The LLM agent reports `{turn, prompt, decision}` to the hub on each commit; the websocket layer fans `actPrompt` frames out (global + the acting cog) and HTTP serves the recent list; the client stores them and a `PromptsPanel` renders them. No game-specific coupling.

**Tech Stack:** TypeScript (ESM, strict), vitest (+jsdom for the panel), zod (the new frame), express/ws (existing). Mirrors `cogame-polis` (`coworld/prompt-log.ts`, `PromptsPanel`). Design: [2026-06-05-cogherence-live-dashboard-design.md](2026-06-05-cogherence-live-dashboard-design.md) §6/§8.

---

## Conventions
kebab-case; zod at boundaries; fail-loud except the LLM fail-safe; module header comments; commit per green step. Server code imports only `src/shared` + `src/agents`.

---

## Task B1: `actPrompt` protocol frame
**Files:** Modify `src/shared/protocol.ts`, `src/shared/protocol.test.ts`

**Step 1: Failing test**
```ts
it("validates an actPrompt frame", () =>
  expect(() =>
    serverMessageSchema.parse({ type: "actPrompt", cogId: "cog0", turn: 3, phase: "commit", content: "you saw X -> bid 2" }),
  ).not.toThrow());
```
**Step 2:** Run → FAIL.
**Step 3:** Add to the `serverMessageSchema` union:
```ts
z.object({ type: z.literal("actPrompt"), cogId: z.string(), turn: z.number().int(), phase: phaseSchema, content: z.string() }).strict(),
```
**Step 4:** Run → PASS; full suite green (existing replay frames unaffected).
**Step 5:** Commit `"feat: actPrompt protocol frame"`.

---

## Task B2: `ActPromptHub` — per-cog log + subscribe
**Files:** Create `src/server/act-prompt-hub.ts`, `src/server/act-prompt-hub.test.ts`

**Step 1: Failing test**
```ts
import { describe, it, expect, vi } from "vitest";
import { ActPromptHub } from "./act-prompt-hub";

describe("ActPromptHub", () => {
  it("records and lists recent entries per cog (bounded)", () => {
    const hub = new ActPromptHub(2); // cap 2
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
    hub.record({ cogId: "cog0", turn: 2, phase: "commit", content: "b" });
    hub.record({ cogId: "cog0", turn: 3, phase: "commit", content: "c" });
    expect(hub.list("cog0").map((e) => e.content)).toEqual(["b", "c"]); // oldest evicted
    expect(hub.list("cog1")).toEqual([]);
  });
  it("notifies subscribers on record", () => {
    const hub = new ActPromptHub();
    const fn = vi.fn();
    hub.onRecord(fn);
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
    expect(fn).toHaveBeenCalledWith({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement**
```ts
// src/server/act-prompt-hub.ts
// A decoupled transparency channel: a bounded per-cog buffer of "what the brain
// saw + decided", plus a subscribe hook the websocket layer fans out. Not tied to
// the game runner — agents report here directly.
import type { CogId, Phase } from "../shared/engine/types";

export interface ActPromptEntry { cogId: CogId; turn: number; phase: Phase; content: string; }
type Sub = (e: ActPromptEntry) => void;

export class ActPromptHub {
  private byCog = new Map<CogId, ActPromptEntry[]>();
  private subs: Sub[] = [];
  constructor(private readonly cap = 50) {}

  record(e: ActPromptEntry): void {
    const list = this.byCog.get(e.cogId) ?? [];
    list.push(e);
    if (list.length > this.cap) list.shift();
    this.byCog.set(e.cogId, list);
    for (const s of this.subs) s(e);
  }
  list(cogId: CogId): ActPromptEntry[] {
    return [...(this.byCog.get(cogId) ?? [])];
  }
  onRecord(fn: Sub): () => void {
    this.subs.push(fn);
    return () => (this.subs = this.subs.filter((s) => s !== fn));
  }
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: ActPromptHub (bounded per-cog log + subscribe)"`.

---

## Task B3: LLM agent reports its prompt + decision
**Files:** Modify `src/agents/llm/llm-agent.ts`, `src/agents/llm/llm-agent.test.ts`

Add an optional reporter to `llmDecide`/`llmAgent`. On each commit it reports the rendered user prompt + a one-line decision summary. Pure-ish: the reporter is injected (a fake in tests, the hub in production).

**Step 1: Failing test**
```ts
it("reports the prompt + decision to the reporter", async () => {
  const reports: { turn: number; content: string }[] = [];
  const orders = await llmDecide(view, fake(toolUse({ bid: 4 })), {
    report: (turn, content) => reports.push({ turn, content }),
  });
  expect(orders).toContainEqual({ type: "bid", energy: 4 });
  expect(reports).toHaveLength(1);
  expect(reports[0]!.content).toMatch(/Your treasury/); // the prompt the model saw
  expect(reports[0]!.content).toMatch(/bid/); // the decision summary
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** — extend `llmDecide(view, client, opts?: { report?: (turn: number, content: string) => void })`. Build `content = user + "\n\n→ decided: " + JSON.stringify(orders)`; call `opts.report?.(view.state.turn, content)` before returning. Extend `llmAgent(id, client, opts?)` to thread `report` into each `commit`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: llm agent reports act-prompt (prompt + decision)"`.

---

## Task B4: Wire the hub into the server (ws broadcast + http + agents)
**Files:** Modify `src/server/websocket.ts`, `src/server/http.ts`, `src/server/runtime.ts`, `src/cli.ts` (buildAgents); add focused tests.

- **runtime:** `startServer` creates an `ActPromptHub`, passes a `report` to LLM agents (via a new `buildAgents(specs, seed, { hub })` option or a `reporter` arg), and hands the hub to `attachWebsockets` + `createApp`.
- **websocket:** subscribe to `hub.onRecord` → broadcast `{type:"actPrompt",...}` to global clients and to the matching `/cog/:id/ws` client. On connect, replay that cog's `hub.list(id)` (cog sockets) so the panel has history.
- **http:** `GET /cog/:id/act-prompts` → `hub.list(id)`.
- **buildAgents:** accept an optional `report` callback; pass it to `llmAgent`.

**Tests:** (a) ws test — after `hub.record(...)`, a connected `/global/ws` client receives an `actPrompt` frame; (b) http test — `GET /cog/cog0/act-prompts` returns recorded entries.
**Steps:** failing tests → implement → green → Commit `"feat: serve act-prompts over ws + http"`.

---

## Task B5: Client — store act-prompts + `PromptsPanel`
**Files:** Modify `src/client/net/feed.ts` (+test); create `src/client/PromptsPanel.tsx` (+test); modify `src/client/App.tsx`

- **feed:** extend `FeedStore` with `actPrompts: Record<CogId, ActPromptEntry[]>`; on an `actPrompt` frame, append (bounded). Notify.
- **PromptsPanel:** given the store's actPrompts, render the latest entry per cog (cog name + turn + the prompt/decision content in a `<pre>`), so a spectator sees what each brain saw. data-testid="prompts".
- **App:** in live mode, render `<PromptsPanel>` below the HUD. (Replay mode: actPrompts can also ride in replays later; for now only live.)

**Tests:** feed applies an `actPrompt` frame into `store.actPrompts`; `<PromptsPanel>` renders an entry's content (jsdom).
**Steps:** failing → implement → green → Commit `"feat: PromptsPanel — live LLM transparency in the dashboard"`.

---

## Task B6: Verify live LLM transparency end-to-end
**Files:** none (verification) — optionally a short Playwright assertion gated off real Bedrock.

- Run `npm run serve:llm -- --agents llm,greedy,greedy,greedy --turns 4 --pace 1500` and open `/?live`; confirm the board advances and the PromptsPanel shows cog0's prompt+decision. (Needs AWS creds; document it. The unit + fake-client tests already prove the pipeline without network.)
- Commit any doc/readme updates: `"docs: phase B — live multi-LLM transparency"`.

---

## Milestones
- **M1 (B1–B3):** the transparency data path (frame + hub + agent reporting) — pure, fully unit-tested.
- **M2 (B4):** server fan-out (ws + http).
- **M3 (B5–B6):** the dashboard panel + live verification.

## Notes for the executor
- Keep the hub decoupled from `GameRunner` — agents report directly; ws fans out both `runner.onUpdate` and `hub.onRecord`.
- The full dedicated per-cog page (`index-cog.html`, `/cog/:id` routing, ViewSwitcher) is deferred to a later refinement; Phase B surfaces transparency in the existing dashboard.
- Phase C adds the negotiation message bus + chat feed (reuses the hub pattern for messages).
