// Stable per-cog palette + display names by index; neutral tiles use a CSS var (--neutral).
// Neon-glass observatory palette (brightened from the engine seats) so each Cog's
// territory glows distinctly on near-black: Alice red, Bob green, Carol blue,
// David orange, Erin violet, Frank cyan.
const COG_COLORS = ["#ff2e63", "#36e07f", "#4d7cff", "#ff9838", "#c061ff", "#42d4f4"];
export const cogColor = (index: number): string => COG_COLORS[index % COG_COLORS.length]!;

// Friendly names for the roster, one per seat (the game seats 3-6 Cogs). The
// engine still keys Cogs by stable ids (cog0..cogN); this is display only.
const COG_NAMES = ["Alice", "Bob", "Carol", "David", "Erin", "Frank"];
export const cogName = (index: number): string => COG_NAMES[index] ?? `Cog ${index + 1}`;
