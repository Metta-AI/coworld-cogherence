import { MAX_TURNS } from '../shared/engine/constants.js'
import { MINERALS } from '../shared/engine/types.js'
import type { CoghereView } from './game.js'
import { candidates } from './choices.js'

const PLAYERS = 4
const TILES = 127
const ACTIONS = 30

/** Encode only the ordinary private seat view and its current legal catalog. */
export function numericEncoding(view: CoghereView, seat: number, decisionId: number) {
  if (view.tiles.length !== TILES) throw new Error(`Expected ${TILES} visible tiles`)
  const values = [seat / PLAYERS, view.turn / MAX_TURNS]
  for (let index = 0; index < 6; index++) {
    const cog = view.cogs[index]
    values.push(
      (cog?.hearts ?? 0) / MAX_TURNS,
      (cog?.energy ?? 0) / 1000,
      ...MINERALS.map((mineral) => (cog?.treasury[mineral] ?? 0) / 1000)
    )
  }
  for (const tile of [...view.tiles].sort((a, b) => a.q - b.q || a.r - b.r)) {
    values.push(
      tile.q / 6,
      tile.r / 6,
      ...MINERALS.map((mineral) => Number(tile.mineral === mineral)),
      view.cogs.findIndex((cog) => cog.id === tile.alignment) / 6,
      tile.coherence / 10,
      tile.density / 10,
      tile.density0 / 10
    )
  }
  const actions: Array<{ choice: string } | null> = candidates(view, seat).map((choice) => ({ choice: choice.key }))
  if (actions.length > ACTIONS) throw new Error('Candidate catalog exceeded fixed numeric action space')
  actions.push(...Array.from({ length: ACTIONS - actions.length }, () => null))
  return { decision_id: decisionId, values, actions }
}
