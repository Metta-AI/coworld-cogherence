"""Full hosted games with actual native players and failed local network requests."""

import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid

GAME, PLAYER, OUTPUT = [Path(value).resolve() for value in sys.argv[1:4]]
SOURCE = sys.argv[4]
ROOT = Path(__file__).resolve().parents[1]
TRAIN = ["canonical", "plain", "numbered", "questions", "reordered"]
DIRECT = TRAIN + ["heldout-briefing", "heldout-reference"]
baseline = None
wordings = []
for choice, prompt_seed in [(v, 0) for v in DIRECT] + [("mixed", i) for i in range(5)]:
    output = OUTPUT / f"{choice}-{prompt_seed}"
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    config = {
        "tokens": [str(seat) for seat in range(4)],
        "players": [{"name": f"Cog {seat + 1}"} for seat in range(4)],
        "seed": 17,
        "promptVariant": choice,
        "promptSeed": prompt_seed,
    }
    (output / "config.json").write_text(json.dumps(config))
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    with socket.socket() as endpoint:
        endpoint.bind(("127.0.0.1", 0))
        environment = dict(os.environ)
        for name in ("OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            environment.pop(name, None)
        environment.update(
            COGAME_HOST="127.0.0.1",
            COGAME_PORT=str(port),
            COGAME_CONFIG_URI=(output / "config.json").as_uri(),
            COGAME_RESULTS_URI=(output / "results.json").as_uri(),
            COGAME_SAVE_REPLAY_URI=(output / "replay.json").as_uri(),
            COGAME_SAVE_TRAJECTORY_URI=(output / "trajectory.jsonl").as_uri(),
            COWORLD_EPISODE_ID=str(uuid.uuid4()),
            COWORLD_GAME_VERSION="source-prompt-validation",
            COWORLD_SOURCE_REVISION=SOURCE,
            COWORLD_LLM_ENDPOINT=f"http://127.0.0.1:{endpoint.getsockname()[1]}",
            COWORLD_LLM_MODEL="closed-endpoint-validation",
        )
        processes, logs = [], []
        try:
            log = (output / "game.log").open("w")
            logs.append(log)
            game = subprocess.Popen(
                ["node", str(GAME)], cwd=ROOT, env=environment, stdout=log, stderr=log
            )
            processes.append(game)
            ready_deadline = time.monotonic() + 30
            while True:
                with socket.socket() as probe:
                    ready = probe.connect_ex(("127.0.0.1", port)) == 0
                if ready:
                    break
                assert game.poll() is None and time.monotonic() < ready_deadline
                time.sleep(0.02)
            for seat in range(4):
                log = (output / f"player-{seat}.log").open("w")
                logs.append(log)
                processes.append(
                    subprocess.Popen(
                        ["node", str(PLAYER)],
                        cwd=ROOT,
                        env=environment
                        | {
                            "COWORLD_PLAYER_WS_URL": f"ws://127.0.0.1:{port}/player?slot={seat}&token={seat}"
                        },
                        stdout=log,
                        stderr=log,
                    )
                )
            deadline = time.monotonic() + 960
            for process in processes:
                assert process.wait(timeout=max(1, deadline - time.monotonic())) == 0
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=5)
            for log in logs:
                log.close()
    artifact = output / "trajectory.jsonl"
    complete = json.loads(artifact.read_text())
    assert artifact.stat().st_mode & 0o777 == 0o600
    assert (
        complete["episode"]["status"] == "completed"
        and len(complete["decisions"]) == 800
    )
    trace = []
    systems = {}
    hashes = []
    counts = {"talk": 0, "orders": 0}
    selected = TRAIN[prompt_seed] if choice == "mixed" else choice
    for decision in complete["decisions"]:
        observation = decision["observation"]
        talk = observation.get("phase") == "talk"
        phase = "talk" if talk else "orders"
        counts[phase] += 1
        view = observation["view"] if talk else observation
        assert view.pop("prompt_selection") == {
            "bank": "cogherence-rules-v1",
            "variant": selected,
            "selection": choice,
            "seed": prompt_seed,
        }
        seat = int(decision["seat"])
        assert all(cog["energy"] == 0 for cog in view["cogs"] if cog["index"] != seat)
        assert (
            decision["action_status"] == "fallback"
            and decision["selected_attempt_id"] is None
        )
        attempts = decision["attempts"]
        assert len(attempts) == (1 if talk else 4)
        if not talk:
            terminal_failure = attempts[-1]
            assert terminal_failure["origin"] == "unknown"
            assert (
                not terminal_failure["accepted"]
                and terminal_failure["rejection_reason"]
            )
            assert (
                terminal_failure["request"] is None
                and terminal_failure["response"] == ""
            )
            assert terminal_failure["platform_call_id"] is None
            attempts = attempts[:-1]
        users = []
        for attempt in attempts:
            assert attempt["origin"] == "model" and not attempt["accepted"]
            assert (
                attempt["platform_call_id"] is None and attempt["raw_response"] is None
            )
            assert attempt["rejection_reason"]
            messages = attempt["prompt"]
            assert [message["role"] for message in messages] == ["system", "user"]
            assert attempt["request"]["messages"] == messages
            system, user = [message["content"] for message in messages]
            assert systems.setdefault(phase, system) == system
            assert "prompt_selection" not in user and "prompt_template" not in user
            hashes.append(
                {
                    "phase": phase,
                    "seat": seat,
                    "system_sha256": hashlib.sha256(system.encode()).hexdigest(),
                    "user_sha256": hashlib.sha256(user.encode()).hexdigest(),
                }
            )
            users.append(user)
        trace.append((observation, users, decision["executed_action"]))
    assert counts == {"talk": 400, "orders": 400} and len(hashes) == 1600
    results = json.loads((output / "results.json").read_text())
    assert results["scores"] == complete["episode"]["outcome"]["scores"]
    replay_text = (output / "replay.json").read_text()
    assert (
        "prompt_selection" not in replay_text and "prompt_template" not in replay_text
    )
    for system in systems.values():
        assert json.dumps(system, ensure_ascii=False)[1:-1] not in replay_text
    replay = json.loads(replay_text)
    snapshots = [frame for frame in replay["frames"] if frame["type"] == "snapshot"]
    assert snapshots
    outcome = trace, snapshots, results["scores"]
    if baseline is None:
        baseline = outcome
    assert outcome == baseline
    if choice == "mixed":
        assert systems == wordings[prompt_seed]
    else:
        assert systems not in wordings
        wordings.append(systems)
    (output / "prompt-hashes.json").write_text(json.dumps(hashes))
    (output / "prompt-hashes.json").chmod(0o600)
    print(
        choice,
        prompt_seed,
        "100 turns, 800 decisions, 1600 real failed requests; private request and public state parity PASS",
        results["scores"],
        flush=True,
    )
