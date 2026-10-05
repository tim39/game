import { encounterCountdown } from '../core/encounters';
import { Rng } from '../core/rng';
import { ENCOUNTER_TUNING } from '../data/balance';

/**
 * The countdown to the next random battle, in steps at the Normal rate, and the luck random
 * battles are drawn from (see src/core/encounters.ts). It carries on across maps and battles, but
 * isn't saved: a game loaded starts with a fresh countdown.
 */
export interface EncounterClock {
  rng: Rng;
  countdown: number;
}

/** A clock with its luck from `seed`, and a countdown drawn from it. */
function clockFrom(seed: number | string): EncounterClock {
  const rng = Rng.fromSeed(seed);
  return { rng, countdown: encounterCountdown(rng, ENCOUNTER_TUNING) };
}

/** The game's: its luck comes from when the page was opened. */
export const encounters: EncounterClock = clockFrom(Date.now());

/** Starts the luck over from `seed`, with a fresh countdown: for tests, through `window.__game`. */
export function reseedEncounters(seed: number | string): void {
  Object.assign(encounters, clockFrom(seed));
}
