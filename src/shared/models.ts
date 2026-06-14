// Bedrock models the operator can drive a Cog's autopilot with (the dashboard's
// per-seat model picker). `enabled` reflects whether the local/dev AWS account
// (softmax-org) has cleared the Anthropic use-case form for the model — disabled
// ones 404 with ResourceNotFoundException until the form is submitted, so the
// picker can flag them. Opus + Sonnet 4.x are cleared on softmax-org; Haiku 4.5
// still needs the form.
export interface BedrockModel {
  id: string;
  label: string;
  enabled: boolean;
}

export const BEDROCK_MODELS: BedrockModel[] = [
  { id: "us.anthropic.claude-opus-4-8", label: "Opus 4.8", enabled: true },
  { id: "us.anthropic.claude-opus-4-5-20251101-v1:0", label: "Opus 4.5", enabled: true },
  { id: "us.anthropic.claude-opus-4-1-20250805-v1:0", label: "Opus 4.1", enabled: true },
  { id: "us.anthropic.claude-sonnet-4-6", label: "Sonnet 4.6 — needs form", enabled: false },
  { id: "us.anthropic.claude-sonnet-4-20250514-v1:0", label: "Sonnet 4 — needs form", enabled: false },
  { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Haiku 4.5 — needs form", enabled: false },
];

/** Default autopilot model. Opus is cleared on softmax-org (the dev/host account);
 *  Sonnet/Haiku 404 with a use-case-form error there until the form is submitted. */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-opus-4-8";

export const isKnownModel = (id: string): boolean => BEDROCK_MODELS.some((m) => m.id === id);
