// Stable per-cog palette + display names by index; neutral tiles use a CSS var (--neutral).
const COG_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4"];
export const cogColor = (index: number): string => COG_COLORS[index % COG_COLORS.length]!;

// Friendly names for the roster, one per seat (the game seats 3-6 Cogs). The
// engine still keys Cogs by stable ids (cog0..cogN); this is display only.
const COG_NAMES = ["Alice", "Bob", "Carol", "David", "Erin", "Frank"];
export const cogName = (index: number): string => COG_NAMES[index] ?? `Cog ${index + 1}`;
