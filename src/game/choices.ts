import { ALIGN_MAX_ENERGY, alignEnergyCost } from "../shared/engine/constants.js";
import { distance } from "../shared/engine/hex.js";
import type { Order } from "../shared/engine/orders.js";
import type { CoghereView } from "./game.js";

type Candidate = { key: string; description: string; orders: Order[] };

export function candidates(view: CoghereView, seat: number): Candidate[] {
  const own = view.cogs[seat]!;
  const owned = view.tiles.filter((tile) => tile.alignment === own.id);
  const choices: Candidate[] = [{ key: "hold", description: "Hold: spend no energy and place no bid", orders: [] }];
  for (const energy of [1, 3, 5, 10, 20]) {
    if (energy <= own.energy) {
      choices.push({ key: `bid_${energy}`, description: `Bid ${energy} energy for this turn's heart`, orders: [{ type: "bid", energy }] });
    }
  }
  for (const tile of (owned.length > 1 ? owned : []).filter((t) => t.coherence > 0 && t.density >= 1).slice(0, 8)) {
    choices.push({
      key: `exploit_${tile.q}_${tile.r}`,
      description: `Exploit owned ${tile.mineral} tile (${tile.q},${tile.r}); coherence ${tile.coherence}, density ${tile.density.toFixed(1)}`,
      orders: [{ type: "exploit", tile: `${tile.q},${tile.r}` }],
    });
  }
  if (owned.length > 0) {
    const nearby = view.tiles
      .filter((tile) => tile.alignment !== own.id)
      .map((tile) => ({ tile, distance: Math.min(...owned.map((home) => distance(home, tile))) }))
      .filter(({ distance }) => alignEnergyCost(2, distance) <= Math.min(own.energy, ALIGN_MAX_ENERGY))
      .sort((a, b) => a.distance - b.distance || b.tile.density - a.tile.density)
      .slice(0, 16);
    for (const { tile, distance } of nearby) {
      const cost = alignEnergyCost(2, distance);
      choices.push({
        key: `align_${tile.q}_${tile.r}`,
        description: `Align ${tile.mineral} tile (${tile.q},${tile.r}) with force 2; cost ${cost} energy, density ${tile.density.toFixed(1)}, current coherence ${tile.coherence}`,
        orders: [{ type: "align", tile: `${tile.q},${tile.r}`, force: 2 }],
      });
    }
  }
  return choices;
}
