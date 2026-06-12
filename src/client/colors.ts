// Stable per-cog palette + display names by index; neutral tiles use a CSS var (--neutral).
// Neon-glass observatory palette (brightened from the engine seats) so each Cog's
// territory glows distinctly on near-black: Alice red, Bob green, Carol blue,
// David orange, Erin violet, Frank cyan.
const COG_COLORS = ["#ff2e63", "#36e07f", "#4d7cff", "#ff9838", "#c061ff", "#42d4f4"];
export const cogColor = (index: number): string => COG_COLORS[index % COG_COLORS.length]!;

// Names live in the engine now (cogs can be claimed/created by name at
// runtime); the feed hydrates this registry from every snapshot, and the
// engine's default roster is the fallback before the first frame lands.
import { defaultCogName } from "../shared/engine/board";

let liveNames: readonly string[] = [];
/** Hydrate display names from a snapshot (index-ordered). */
export const setCogNames = (names: readonly string[]): void => {
  liveNames = names;
};
export const cogName = (index: number): string => liveNames[index] ?? defaultCogName(index);
