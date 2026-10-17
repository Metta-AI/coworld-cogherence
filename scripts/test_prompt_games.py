"""Complete production-bridge games compare private talk, retries, orders, and outcomes."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

BUNDLE = str(Path(sys.argv[1]).resolve())
TRAIN = ["canonical", "plain", "numbered", "questions", "reordered"]
DIRECT = TRAIN + ["heldout-briefing", "heldout-reference"]


def request(process, command):
    process.stdin.write(json.dumps(command) + "\n")
    process.stdin.flush()
    line = process.stdout.readline()
    assert line, process.poll()
    return json.loads(line)


with subprocess.Popen(
    ["node", BUNDLE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
) as process:
    for seed in ("17", "946001"):
        baseline = None
        direct_systems = []
        for choice, prompt_seed in [(v, 0) for v in DIRECT] + [
            ("mixed", i) for i in range(5)
        ]:
            obs = request(
                process,
                {
                    "kind": "reset",
                    "seed": seed,
                    "players": 4,
                    "split": "validation",
                    "promptVariant": choice,
                    "promptSeed": prompt_seed,
                },
            )
            trace = []
            systems = {}
            retried = False
            while obs["kind"] == "decision":
                seat = obs["seat"]
                view = obs["semantic_view"]
                meta = view.pop("prompt_template")
                selected = TRAIN[prompt_seed] if choice == "mixed" else choice
                assert (
                    meta["bank"],
                    meta["variant"],
                    meta["selection"],
                    meta["seed"],
                ) == ("cogherence-rules-v1", selected, choice, prompt_seed)
                messages = obs["messages"]
                for message in messages:
                    assert (
                        meta[message["role"] + "_sha256"]
                        == hashlib.sha256(message["content"].encode()).hexdigest()
                    )
                system, user = [message["content"] for message in messages]
                talk = "messages" in obs["action_schema"]["properties"]
                assert systems.setdefault(talk, system) == system
                assert "prompt_template" not in user and "prompt_selection" not in user
                for other in view["cogs"]:
                    if other["index"] != seat:
                        assert other["energy"] == 0 and all(
                            v == 0 for v in other["treasury"].values()
                        )
                for sender in range(4):
                    if seat not in (sender, (sender + 1) % 4):
                        assert f"SECRET-{sender}" not in user
                if not talk and not retried:
                    failed = request(
                        process,
                        {
                            "kind": "step",
                            "decision_id": obs["decision_id"],
                            "response": "not JSON",
                        },
                    )
                    assert failed["kind"] == "rejected"
                    obs = failed["observation"]
                    assert obs["decision_id"] == len(trace)
                    retried = True
                    continue
                if talk:
                    action = {
                        "messages": [
                            {"to": "public", "text": f"PUBLIC-{seat}"},
                            {
                                "to": view["cogs"][(seat + 1) % 4]["id"],
                                "text": f"SECRET-{seat}",
                            },
                        ]
                    }
                else:
                    me = view["cogs"][seat]
                    holds = any(tile["alignment"] == me["id"] for tile in view["tiles"])
                    action = {"bid": 1} if me["energy"] >= 1 and holds else {}
                result = request(
                    process,
                    {
                        "kind": "step",
                        "decision_id": obs["decision_id"],
                        "response": json.dumps(action),
                    },
                )
                assert result["kind"] == "accepted", result
                trace.append((view, user, obs["inbox"], result["action"]))
                obs = result["observation"]
                assert len(trace) <= 800
            assert obs["kind"] == "terminal" and len(trace) == 800 and len(systems) == 2
            assert retried
            outcome = trace, obs
            if baseline is None:
                baseline = outcome
            assert outcome == baseline
            if choice == "mixed":
                assert systems == direct_systems[prompt_seed]
            else:
                assert systems not in direct_systems
                direct_systems.append(systems)
            print(
                seed,
                choice,
                prompt_seed,
                "100 turns, 800 decisions, private DMs/retry/hash/action/outcome parity PASS",
                obs["scores"],
                flush=True,
            )
    process.stdin.close()
    process.stdout.close()
    assert process.wait(timeout=5) == 0

for invalid in [
    {"promptVariant": v}
    for v in ("heldout-briefing", "heldout-reference", "unknown", "mixed")
] + [{"promptVariant": "mixed", "promptSeed": value} for value in (-1, True, 1.5)]:
    result = subprocess.run(
        ["node", BUNDLE],
        input=json.dumps({"kind": "reset", "seed": "17", "players": 4} | invalid)
        + "\n",
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0 and not result.stdout

if len(sys.argv) == 4:
    processes = [
        subprocess.Popen(
            ["node", str(Path(bundle).resolve())],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        for bundle in sys.argv[2:4]
    ]
    try:
        for seed in ("17", "946001"):
            observations = [
                request(p, {"kind": "reset", "seed": seed, "players": 4})
                for p in processes
            ]
            count = 0
            while observations[0]["kind"] == "decision":
                assert observations[0] == observations[1]
                encodings = [request(p, {"kind": "encode"}) for p in processes]
                assert encodings[0] == encodings[1]
                assert (
                    len(encodings[0]["values"]) == 1308
                    and len(encodings[0]["actions"]) == 30
                )
                legal = [
                    action for action in encodings[0]["actions"] if action is not None
                ]
                action = legal[count % len(legal)]
                results = [
                    request(
                        p,
                        {
                            "kind": "step",
                            "decision_id": count,
                            "response": json.dumps(action),
                        },
                    )
                    for p in processes
                ]
                assert results[0] == results[1] and results[0]["kind"] == "accepted"
                observations = [result["observation"] for result in results]
                count += 1
            assert count == 400 and observations[0] == observations[1]
            print(seed, "original/current numeric 100-turn comparison PASS", flush=True)
    finally:
        for process in processes:
            process.stdin.close()
            process.stdout.close()
            assert process.wait(timeout=5) == 0
