// The Coworld player WebSocket protocol (game ⇄ player), spoken over
// `/player?slot=&token=`. There is NO negotiate phase: the game asks each player
// for committed orders once per turn, and chat is fully ASYNCHRONOUS — a player
// may send a message at any time, and the game pushes others' visible messages
// to it live. The protocol is game-owned (see the spec in docs/); a league may
// substitute a third-party player image, so:
//   - game → player frames are trusted (same types, serialized as JSON), and
//   - player → game frames are UNTRUSTED and validated with zod on receipt.
import { z } from "zod";
import { OrderSchema } from "../shared/engine/orders";
import type { GameState, CogId } from "../shared/engine/types";
import type { Message } from "../shared/messages";

/** An AgentView on the wire — `state` is a per-slot redacted GameState, and
 *  `messages` is the chat visible to this player so far (public + its DMs). */
export interface PlayerView {
  state: GameState;
  me: CogId;
  messages: Message[];
}

/** Final standings for the Coworld `results` artifact (slot-ordered). */
export interface CoworldResults {
  /** Hearts per slot, indexed by player slot. */
  scores: number[];
  /** Winning slot index, or null for an empty/no-winner game. */
  winner: number | null;
  /** Turns actually played. */
  turns: number;
}

/** Game → player. Trusted: the game serializes these directly. */
export type GameToPlayer =
  | {
      type: "hello";
      /** This player's slot index and resolved cog identity. */
      slot: number;
      you: CogId;
      name: string;
      /** Every slot's identity, so a player can address DMs by cog id. */
      players: Array<{ slot: number; id: CogId; name: string }>;
      seed: number;
      maxTurns: number;
    }
  | { type: "commit"; turn: number; view: PlayerView }
  | { type: "message"; message: Message } // live async push of a visible chat message
  | { type: "final"; results: CoworldResults };

/** Player → game. Untrusted: validated before anything reaches the engine/bus. */
export const playerToGameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commit_result"), turn: z.number().int(), orders: z.array(OrderSchema) }).strict(),
  // An async chat message the player can send at any time. `to` is "public" or a cog id.
  z.object({ type: z.literal("message"), to: z.string().min(1), text: z.string().min(1) }).strict(),
]);
export type PlayerToGame = z.infer<typeof playerToGameSchema>;
export type CommitResult = Extract<PlayerToGame, { type: "commit_result" }>;
export type PlayerMessage = Extract<PlayerToGame, { type: "message" }>;

/** Parse an untrusted inbound player frame; null on anything malformed. */
export function parsePlayerMessage(raw: unknown): PlayerToGame | null {
  const r = playerToGameSchema.safeParse(raw);
  return r.success ? r.data : null;
}
