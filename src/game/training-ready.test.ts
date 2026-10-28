import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { afterEach, expect, it, vi } from "vitest";
import { runCoworldPlayer } from "@cogweb/coworld";
import { runCoworldGame } from "../coworld/server.js";
import { cogherenceModule } from "./game.js";
import { makeLlmDecide, makeLlmTalk } from "./llm-player.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("completes the real four-seat production loop with exact private attempts and redacted public replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cogherence-training-"));
  vi.stubEnv("COGAME_RESULTS_URI", join(directory, "results.json"));
  vi.stubEnv("COGAME_SAVE_REPLAY_URI", join(directory, "replay.json"));
  vi.stubEnv("COGAME_SAVE_TRAJECTORY_URI", join(directory, "trajectory.jsonl"));
  const calls: Array<{ id: string; request: unknown; response: unknown }> = [];
  const seatCalls = new Map<string, number>();
  const inference = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const id = randomUUID();
      const slot = String(req.headers["x-coworld-player-slot"]);
      const request = JSON.parse(body);
      const isTalk = request.messages[1].content.includes("NEGOTIATION");
      const key = `${slot}:${isTalk ? "talk" : "orders"}`;
      const seen = seatCalls.get(key) ?? 0;
      seatCalls.set(key, seen + 1);
      const text = isTalk
        ? JSON.stringify({
            messages: [
              { to: "public", text: `public talk ${slot}` },
              { to: `cog${(Number(slot) + 1) % 4}`, text: `private talk ${slot}` },
            ],
          })
        : slot === "0" && seen === 0
          ? '{"orders":"invalid"}'
          : slot === "1" && seen === 0
            ? '{"bid":999999}'
            : "{}";
      const response = {
        model: "fixture/cogherence",
        choices: [{ message: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
      calls.push({ id, request: JSON.parse(body), response });
      res.writeHead(200, { "content-type": "application/json", "X-Softmax-Llm-Call-Id": id });
      res.end(JSON.stringify(response));
    });
  });
  await new Promise<void>((resolve) => inference.listen(0, "127.0.0.1", resolve));
  const address = inference.address();
  if (typeof address === "string" || address === null)
    throw new Error("Fixture requires an IP listener");
  vi.stubEnv("COWORLD_LLM_ENDPOINT", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("COWORLD_LLM_MODEL", "fixture/cogherence");
  const host = await runCoworldGame({
    host: "127.0.0.1",
    port: 0,
    config: {
      tokens: Array.from({ length: 4 }, (_, seat) => `fixture-${seat}`),
      players: Array.from({ length: 4 }, (_, seat) => ({ name: `Fixture policy ${seat + 1}` })),
      seed: 7,
      promptVariant: "mixed",
      promptSeed: 3,
    },
  });
  let bridgeProcess: ChildProcessWithoutNullStreams | undefined;
  try {
    const decide = makeLlmDecide();
    const talk = makeLlmTalk();
    const players = host.playerUrls.map((connect) =>
      runCoworldPlayer({ module: cogherenceModule, connect, decide, talk }),
    );
    const [result] = await Promise.all([host.finished, Promise.all(players)]);
    expect(result.scores).toHaveLength(4);
    const trajectory = JSON.parse(await readFile(join(directory, "trajectory.jsonl"), "utf8"));
    expect(trajectory.episode).toMatchObject({
      status: "completed",
      game: "cogherence",
      seed_family: "7",
    });
    expect(trajectory.decisions).toHaveLength(800);
    expect(calls).toHaveLength(802);
    const byId = new Map(calls.map((call) => [call.id, call]));
    // Use the public subprocess protocol with the same dispatched roster labels.
    // Default-only names would silently change observations and native prompts.
    bridgeProcess = spawn(process.execPath, ["--import", "tsx", "src/game/training-bridge.ts"], {
      env: { ...process.env, COGHERENCE_SEAT_NAMES_JSON: JSON.stringify(
        Array.from({ length: 4 }, (_, seat) => `Fixture policy ${seat + 1}`),
      ) },
    });
    const bridgeExit = new Promise<number | null>((resolve) => bridgeProcess!.once("exit", resolve));
    bridgeProcess.stderr.pipe(process.stderr);
    const bridgeLines = createInterface({ input: bridgeProcess.stdout })[Symbol.asyncIterator]();
    const command = async (value: unknown) => {
      bridgeProcess!.stdin.write(JSON.stringify(value) + "\n");
      const line = await bridgeLines.next();
      if (line.done) throw new Error("Training bridge exited before replying");
      return JSON.parse(line.value);
    };
    let bridgeObservation = await command({ kind: "reset", seed: "7", players: 4,
      promptVariant: "mixed", promptSeed: 3 });
    for (const decision of trajectory.decisions) {
      expect(decision.visibility).toBe("private");
      expect(decision.action_status).toBe("accepted");
      expect(decision.attempts).toHaveLength([1, 3].includes(decision.decision_index) ? 2 : 1);
      for (const attempt of decision.attempts) {
        expect(attempt.inference_mode).toBe("text_action");
        expect(attempt.request).toEqual(byId.get(attempt.platform_call_id)!.request);
        expect(attempt.raw_response).toBe(
          JSON.stringify(byId.get(attempt.platform_call_id)!.response),
        );
        expect(attempt.prompt).toEqual(attempt.request.messages);
        const observation = bridgeObservation;
        if (observation.kind !== "decision") throw new Error("Bridge ended before hosted loop");
        const { prompt_template, ...bridgeView } = observation.semantic_view;
        const { prompt_selection, ...nativeView } = decision.observation.phase === "talk"
          ? decision.observation.view : decision.observation;
        expect(prompt_selection).toEqual({
          bank: "cogherence-rules-v3", variant: "questions", selection: "mixed", seed: 3,
        });
        expect(prompt_template).toEqual({
          ...prompt_selection,
          system_sha256: createHash("sha256").update(observation.messages[0]!.content).digest("hex"),
          user_sha256: createHash("sha256").update(observation.messages[1]!.content).digest("hex"),
        });
        expect(bridgeView).toEqual(nativeView);
        expect(observation.messages).toEqual(attempt.prompt);
        const applied = await command({ kind: "step", decision_id: observation.decision_id,
          response: attempt.response });
        bridgeObservation = applied.observation;
        expect(applied.kind).toBe(attempt.accepted ? "accepted" : "rejected");
        if (applied.kind === "accepted") expect(applied.action).toEqual(decision.executed_action);
      }
      const attempt = decision.attempts.at(-1);
      expect(attempt.parsed_action).toEqual(decision.executed_action);
      expect(
        (decision.observation.phase === "talk"
          ? decision.observation.view
          : decision.observation
        ).cogs
          .filter((cog: { index: number }) => cog.index !== Number(decision.seat))
          .every((cog: { energy: number }) => cog.energy === 0),
      ).toBe(true);
    }
    expect(bridgeObservation.kind).toBe("terminal");
    bridgeProcess.stdin.end();
    expect(await bridgeExit).toBe(0);
    expect((await stat(join(directory, "trajectory.jsonl"))).mode & 0o777).toBe(0o600);
    const replay = JSON.parse(await readFile(join(directory, "replay.json"), "utf8"));
    const prompts = replay.frames.filter((frame: { type: string }) => frame.type === "actPrompt");
    expect(prompts).toHaveLength(400);
    for (const frame of prompts)
      for (const attempt of frame.actPrompt.attempts)
        expect(attempt).toEqual({
          prompt: "",
          response: "",
          error: attempt.error === null ? null : "Private player decision failed",
        });
    expect(JSON.stringify(replay)).not.toContain("private doctrine");
    expect(JSON.stringify(replay)).not.toContain("raw_response");
    expect(JSON.stringify(replay)).not.toContain("private talk");
    expect(JSON.stringify(replay)).toContain("public talk");
  } finally {
    bridgeProcess?.kill();
    await host.close();
    await new Promise<void>((resolve, reject) =>
      inference.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 60000);
