#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (index % 2 === 0) pairs.push([value, values[index + 1]]);
  return pairs;
}, []));
for (const name of ["--replay", "--result", "--trace", "--source-revision", "--episode-id", "--output"]) {
  if (!args[name]) throw new Error(`missing ${name}`);
}
if (!/^[0-9a-f]{40}$/.test(args["--source-revision"])) throw new Error("source revision must be a full Git SHA");
execFileSync("git", ["cat-file", "-e", `${args["--source-revision"]}^{commit}`],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "ignore" });

const [replay, result, traceText, packageJson] = await Promise.all([
  readFile(args["--replay"], "utf8").then(JSON.parse),
  readFile(args["--result"], "utf8").then(JSON.parse),
  readFile(args["--trace"], "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);
assert.equal(replay.protocol, "cogweb.replay.v1");
assert.ok(Array.isArray(replay.frames));
assert.ok(Array.isArray(result.scores) && result.scores.length > 0);
const terminal = replay.frames.findLast((frame) => frame.type === "status")?.status;
assert.equal(terminal?.phase, "finished");
assert.deepEqual(result.scores, result.scores.map((_, seat) => terminal.scores[String(seat)]));

const attempts = replay.frames.filter((frame) => frame.type === "actPrompt").map((frame) => frame.actPrompt);
const talkEvents = replay.frames.filter((frame) => frame.type === "event" && frame.event.kind === "talk").map((frame) => frame.event);
const trace = traceText.split("\n").filter(Boolean).map((line) => JSON.parse(line));
assert.ok(trace.length > 0, "model trace is empty");
const seats = new Set(trace.map((row) => row.seat));
assert.equal(seats.size, 1, "one player trace must contain one seat");
const seat = [...seats][0];
const seatAttempts = attempts.filter((attempt) => attempt.seat === seat);
const typedRows = trace.filter((row) => row.kind === "typed_decision");
const languageRows = trace.filter((row) => row.kind === "language_message");
assert.equal(typedRows.length, seatAttempts.length, "model trace does not cover every host decision");
assert.equal(languageRows.length, talkEvents.filter((event) => event.seat === seat).length,
  "model trace does not cover every public message");
assert.deepEqual(seatAttempts.map((attempt) => attempt.turn),
  Array.from({ length: terminal.turn - 1 }, (_, index) => index + 1));
assert.ok(seatAttempts.every((attempt) => !attempt.usedFallback && attempt.attempts.length === 1 &&
  attempt.attempts[0].error === null), "episode contains a rejected or fallback decision");
const source = args["--source-revision"];
const episodeId = args["--episode-id"];
const gameVersion = packageJson.version;

const decisions = [];
const decisionIds = new Set();
for (const row of trace) {
  assert.ok(Number.isSafeInteger(row.turn) && row.turn > 0);
  const decisionId = `seat:${seat}:turn:${row.turn}:${row.kind}`;
  assert.ok(!decisionIds.has(decisionId), `duplicate model trace decision ${decisionId}`);
  decisionIds.add(decisionId);
  let executedAction;
  let visibility;
  let observation;
  let prompt = row.request;
  let response = row.response;
  if (row.kind === "typed_decision") {
    const accepted = attempts.filter((attempt) => attempt.seat === seat && attempt.turn === row.turn &&
      !attempt.usedFallback && attempt.attempts.some((candidate) => candidate.error === null &&
        isJsonDecision(candidate.response, row.decision)));
    assert.equal(accepted.length, 1, `typed decision ${decisionId} is absent from validated replay`);
    executedAction = row.decision;
    visibility = "private";
    observation = row.request.state;
  } else if (row.kind === "language_message") {
    assert.ok(row.text, `empty language message ${decisionId}`);
    const published = talkEvents.filter((event) => event.seat === seat && event.turn === row.turn && event.text === row.text);
    assert.equal(published.length, 1, `language message ${decisionId} is absent from public replay`);
    executedAction = { to: "public", text: row.text };
    visibility = "mixed";
    observation = JSON.parse(row.request.messages[1].content);
    prompt = row.request.messages;
    response = row.text;
  } else {
    throw new Error(`unknown model trace kind ${row.kind}`);
  }
  decisions.push({
    schema_version: "1", event_type: "decision", event_id: randomUUID(), episode_id: episodeId,
    decision_id: decisionId, decision_index: 0, game: "coworld-cogherence",
    game_version: gameVersion, source_revision: source, seat: String(seat), visibility,
    observation, prompt,
    attempts: [{ attempt_id: `${decisionId}:model`, policy: row.model, origin: "model",
      response, parsed_action: executedAction, accepted: true,
      ...(row.latency_ms === undefined ? {} : { latency_ms: row.latency_ms }) }],
    selected_attempt_id: `${decisionId}:model`, executed_action: executedAction,
    action_status: "accepted", terminal: false,
    turn: row.turn, kind: row.kind,
  });
}
decisions.sort((left, right) => left.turn - right.turn ||
  (left.kind === "typed_decision" ? -1 : 1));
for (const [index, decision] of decisions.entries()) {
  decision.decision_index = index;
  decision.terminal = index === decisions.length - 1;
  delete decision.turn;
  delete decision.kind;
}
const complete = {
  schema_version: "1",
  episode: {
    schema_version: "1", event_type: "episode", event_id: randomUUID(), episode_id: episodeId,
    game: "coworld-cogherence", game_version: gameVersion, source_revision: source,
    status: "completed", outcome: { scores: result.scores }, participant_outcomes: { scores: result.scores },
  },
  decisions,
};
const file = await open(args["--output"], "wx", 0o600);
try {
  await file.writeFile(`${JSON.stringify(complete)}\n`);
} finally {
  await file.close();
}
process.stdout.write(`${JSON.stringify({ episode_id: episodeId, decisions: decisions.length })}\n`);

function isJsonDecision(response, expected) {
  const parsed = JSON.parse(response);
  assert.ok(parsed && typeof parsed === "object");
  return isDeepStrictEqual(parsed, expected);
}
