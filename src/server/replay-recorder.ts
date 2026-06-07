// Records the live game's global frame stream (the exact ServerMessage[] a
// /global/ws client sees) so a finished game can be re-watched in the replay
// client — same frames, same renderer. Subscribes to the runner (board frames),
// the hub (act-prompts), and the bus (chat). On an operator reset (a snapshot
// whose turn moves backwards) it drops the abandoned game and records the new one.
import type { ServerMessage } from "../shared/protocol";
import { COGHERENCE_VERSION } from "../shared/version";
import type { Replay } from "../shared/replay";
import type { GameRunner } from "./game-runner";
import type { ActPromptHub } from "./act-prompt-hub";
import type { MessageBus } from "./message-bus";

export class ReplayRecorder {
  private frames: ServerMessage[] = [];
  private lastSnapshotTurn = 0;

  constructor(
    runner: GameRunner,
    private readonly meta: { seed: number; agents: string[]; turns: number },
    deps?: { hub?: ActPromptHub; bus?: MessageBus },
  ) {
    runner.onUpdate((m) => this.record(m));
    deps?.hub?.onRecord((e) =>
      this.record({ type: "actPrompt", cogId: e.cogId, turn: e.turn, phase: e.phase, content: e.content }),
    );
    deps?.bus?.onPost((message) => this.record({ type: "message", message }));
  }

  private record(m: ServerMessage): void {
    if (m.type === "snapshot") {
      if (m.snapshot.turn < this.lastSnapshotTurn) this.frames = []; // reset: start the new game's recording
      this.lastSnapshotTurn = m.snapshot.turn;
    }
    this.frames.push(m);
  }

  /** Have we captured anything yet? (false → fall back to the bundled replay.) */
  get isEmpty(): boolean {
    return this.frames.length === 0;
  }

  /** The recorded global frame stream, for backfilling a freshly-connected client
   *  with the WHOLE game so far (scrubber spans turn 1 → now). Read-only view. */
  framesView(): readonly ServerMessage[] {
    return this.frames;
  }

  /** The recorded game as a replay envelope the client's parseReplay accepts. */
  doc(): Replay {
    return {
      meta: { version: COGHERENCE_VERSION, seed: this.meta.seed, agents: this.meta.agents, turns: this.meta.turns },
      frames: [...this.frames],
    };
  }
}
