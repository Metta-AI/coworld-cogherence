// Cheap-talk messages between Cogs: public broadcasts + private DMs. Pure data —
// the engine never reads them (they don't affect resolution); they are the
// political side-channel the dashboard surfaces (design §9).
import type { CogId } from "./engine/types";

/** "public" (everyone) or a specific cog id (a DM). */
export type Audience = "public" | CogId;

export interface Message {
  seq: number;
  turn: number;
  from: CogId;
  to: Audience;
  text: string;
}

/** A cog sees a message iff it's public, or it sent it, or it's the recipient. */
export function messageVisibleToCog(m: Message, cog: CogId): boolean {
  return m.to === "public" || m.from === cog || m.to === cog;
}
