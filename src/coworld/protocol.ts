// The Coworld player WebSocket protocol (game ⇄ player), spoken over
// `/player?slot=&token=`. It mirrors the in-process `Agent` interface: each turn
// the game asks for negotiation posts, then for committed orders, sending the
// player its redacted `AgentView`. The protocol is game-owned (see the spec in
// docs/); a league may substitute a third-party player image, so:
//   - game → player frames are trusted (same types, serialized as JSON), and
//   - player → game frames are UNTRUSTED and validated with zod on receipt.
import { z } from "zod";
import { OrderSchema } from "../shared/engine/orders";
import type { GameState, CogId } from "../shared/engine/types";
import type { Message } from "../shared/messages";

/** An AgentView on the wire — `state` is a per-slot redacted GameState. */
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
  | { type: "negotiate"; turn: number; view: PlayerView }
  | { type: "commit"; turn: number; view: PlayerView }
  | { type: "final"; results: CoworldResults };

/** A negotiation post: `to` is "public" or a cog id (a DM). */
const postSchema = z.object({ to: z.string().min(1), text: z.string() }).strict();

/** Player → game. Untrusted: validated before anything reaches the engine. */
export const playerToGameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("negotiate_result"), turn: z.number().int(), posts: z.array(postSchema) }).strict(),
  z.object({ type: z.literal("commit_result"), turn: z.number().int(), orders: z.array(OrderSchema) }).strict(),
]);
export type PlayerToGame = z.infer<typeof playerToGameSchema>;
export type NegotiateResult = Extract<PlayerToGame, { type: "negotiate_result" }>;
export type CommitResult = Extract<PlayerToGame, { type: "commit_result" }>;

/** Parse an untrusted inbound player frame; null on anything malformed. */
export function parsePlayerMessage(raw: unknown): PlayerToGame | null {
  const r = playerToGameSchema.safeParse(raw);
  return r.success ? r.data : null;
}
