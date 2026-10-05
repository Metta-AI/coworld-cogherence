// Canonical OpenRouter models for the per-seat autopilot picker.
export interface LlmModel {
  id: string;
  label: string;
  enabled: boolean;
}

export const LLM_MODELS: LlmModel[] = [
  { id: "anthropic/claude-opus-4.8", label: "Opus 4.8", enabled: true },
  { id: "anthropic/claude-opus-4.5", label: "Opus 4.5", enabled: true },
  { id: "anthropic/claude-opus-4.1", label: "Opus 4.1", enabled: true },
  { id: "anthropic/claude-sonnet-4.6", label: "Sonnet 4.6", enabled: true },
  { id: "anthropic/claude-sonnet-4", label: "Sonnet 4", enabled: true },
  { id: "anthropic/claude-haiku-4.5", label: "Haiku 4.5", enabled: true },
];

export const DEFAULT_LLM_MODEL = "anthropic/claude-opus-4.8";

export const isKnownModel = (id: string): boolean => LLM_MODELS.some((m) => m.id === id);
