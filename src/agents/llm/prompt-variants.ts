import { z } from "zod";
import { MAX_TURNS } from "../../shared/engine/constants.js";

export const PROMPT_BANK = "cogherence-rules-v3";
export const trainingPromptVariants = ["canonical", "plain", "numbered", "questions", "reordered"] as const;
export const promptVariants = [...trainingPromptVariants, "heldout-briefing", "heldout-reference"] as const;
export const promptConfigFields = {
  promptVariant: z.enum([...promptVariants, "mixed"]).optional(),
  promptSeed: z.number().int().nonnegative().safe().optional(),
};
const configSchema = z.object(promptConfigFields).superRefine((config, context) => {
  if (config.promptVariant === "mixed" && config.promptSeed === undefined)
    context.addIssue({ code: "custom", path: ["promptSeed"], message: "Mixed wording requires an explicit promptSeed" });
});

export function resolvePromptSelection(config: unknown = {}) {
  const parsed = configSchema.parse(config);
  const selection = parsed.promptVariant ?? "canonical";
  const seed = parsed.promptSeed ?? 0;
  const variant = selection === "mixed" ? trainingPromptVariants[seed % 5]! : selection;
  return { bank: PROMPT_BANK, variant, selection, seed };
}
export type PromptSelection = ReturnType<typeof resolvePromptSelection>;

export const introductions = {
  canonical: `You are a Cog in **Cogherence**, a mixed-motive game on a hex lattice. Four Cogs compete to hold the most **hearts** at turn ${MAX_TURNS}; one heart is auctioned each turn.`,
  plain: `You play one of four Cogs in **Cogherence**, a mixed-motive game on a hex lattice. Compete to hold the most **hearts** at turn ${MAX_TURNS}. Each turn auctions one heart.`,
  numbered: `Cogherence briefing:\n1. You are one of four Cogs in a mixed-motive game on a hex lattice.\n2. Compete to hold the most hearts at turn ${MAX_TURNS}.\n3. One heart is auctioned every turn.`,
  questions: `What is your role? One of four Cogs in **Cogherence**, a mixed-motive game on a hex lattice.\nWhat wins? Holding the most hearts at turn ${MAX_TURNS}.\nWhat is offered each turn? One heart at auction.`,
  reordered: `One heart is auctioned each turn, and four Cogs compete to hold the most hearts at turn ${MAX_TURNS}. You are one of those Cogs in **Cogherence**, a mixed-motive game on a hex lattice.`,
  "heldout-briefing": `Take the role of a Cog in **Cogherence**. This mixed-motive contest takes place on a hex lattice with four Cogs. Your objective is to hold the most hearts at turn ${MAX_TURNS}; a single heart goes to auction each turn.`,
  "heldout-reference": `Cogherence reference\nRole: one of four Cogs.\nSetting: a mixed-motive game on a hex lattice.\nObjective: hold the most hearts at turn ${MAX_TURNS}.\nAuction: one heart every turn.`,
};
