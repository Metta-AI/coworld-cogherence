// Stable per-cog palette by index; neutral tiles use a CSS var (--neutral).
const COG_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4"];
export const cogColor = (index: number): string => COG_COLORS[index % COG_COLORS.length]!;
