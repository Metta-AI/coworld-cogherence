// The send_messages tool the model fills during the Negotiate phase, a zod
// validator, and a parser to Post[]. Malformed input -> [] (stay silent): the
// agent never throws.
import { z } from "zod";
import type { Post } from "../types";
import type { ToolDef } from "./tool-client";

export const sendMessagesSchema = z.object({
  messages: z.array(z.object({ to: z.string(), text: z.string().min(1) })).optional(),
});

export const SEND_MESSAGES_TOOL: ToolDef = {
  name: "send_messages",
  description: "Send negotiation messages this turn. Call exactly once. Use an empty list to stay silent.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            to: { type: "string", description: "'public' to broadcast to everyone, or a cog id like 'cog1' for a private DM" },
            text: { type: "string", description: "one or two sentences" },
          },
          required: ["to", "text"],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

/** Parse raw tool input into Post[]; returns [] (stay silent) on malformed input. */
export function parsePosts(input: unknown): Post[] {
  const r = sendMessagesSchema.safeParse(input);
  if (!r.success) return [];
  return (r.data.messages ?? []).map((m) => ({ to: m.to, text: m.text }));
}
