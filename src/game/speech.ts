import type { ObservedMessage } from "@cogweb/core";
import type { TalkLine } from "@cogweb/coworld";
import { extractJson } from "@cogweb/llm";
import { SEND_MESSAGES_FORMAT, sendMessagesSchema } from "../agents/llm/negotiate.js";
import { MAX_TURNS } from "../shared/engine/constants.js";
import { cogherenceAutopilot, cogherenceGame, type CoghereView } from "./game.js";

export const renderTalk = (
  view: CoghereView,
  seat: number,
  messages: ObservedMessage[],
): string => {
  const me = view.cogs[seat];
  const lines: string[] = [
    `Turn ${view.turn}/${MAX_TURNS}. You are ${me?.id ?? `seat ${seat}`}. NEGOTIATION (free-flowing cheap talk — it is not a turn phase).`,
  ];
  if (me)
    lines.push(
      `Your treasury: C${me.treasury.C} O${me.treasury.O} Ge${me.treasury.Ge} S${me.treasury.S} (${me.energy} energy stored).`,
    );
  lines.push("Hearts — " + view.cogs.map((c) => `${c.id}:${c.hearts}`).join(" "));
  if (messages.length > 0) {
    lines.push("Recent messages you can see:");
    for (const m of messages.slice(-12)) {
      const fromId = view.cogs[m.from]?.id ?? `seat ${m.from}`;
      const scope = m.to === "public" ? "(public)" : "(to you)";
      lines.push(`  ${fromId} ${scope}: ${m.text}`);
    }
  } else {
    lines.push("(no messages yet)");
  }
  const others = view.cogs
    .filter((_, i) => i !== seat)
    .map((c) => c.id)
    .join(", ");
  lines.push(
    `\nSend public messages (to "public") or private DMs (to a cog id like "${others.split(", ")[0] ?? "cog1"}") to form alliances, propose mineral trades, bluff, or threaten — nothing is binding, and you can betray later. Others: ${others}. Return JSON with your messages (empty list to stay silent). One or two sentences each.`,
  );
  return lines.join("\n");
};

export function renderSpeechMessages(view: CoghereView, seat: number, messages: ObservedMessage[]) {
  return [
    {
      role: "system" as const,
      content:
        cogherenceAutopilot.systemPrompt({ game: cogherenceGame, seat }) +
        `\nReturn JSON matching this schema: ${JSON.stringify(SEND_MESSAGES_FORMAT.inputSchema)}`,
    },
    { role: "user" as const, content: renderTalk(view, seat, messages) },
  ];
}
export function speechSchema(view: CoghereView, seat: number) {
  return sendMessagesSchema.superRefine((input, context) => {
    for (const [index, post] of (input.messages ?? []).entries()) {
      if (
        post.to !== "public" &&
        !view.cogs.some((cog) => cog.id === post.to && cog.index !== seat)
      )
        context.addIssue({
          code: "custom",
          path: ["messages", index, "to"],
          message: "Recipient must be public or another cog's id",
        });
    }
  });
}
export function normalizePosts(input: unknown, view: CoghereView, seat: number): TalkLine[] {
  return (speechSchema(view, seat).parse(input).messages ?? [])
    .slice(0, 2)
    .filter((post) => post.text.trim())
    .map((post) => {
      const recipient =
        post.to === "public" ? null : view.cogs.find((cog) => cog.id === post.to)!.index;
      return { text: post.text.trim(), to: recipient };
    });
}
export function parseSpeechResponse(response: string, view: CoghereView, seat: number): TalkLine[] {
  return normalizePosts(extractJson(response), view, seat);
}
