import type { BattleSetup } from './battle/battle';
import type { Rng } from './rng';
import type { EncounterTable } from './schema';

/**
 * Random battles (see Encounters in docs/DESIGN.md): how far the party walks between them, which
 * of an area's groups of enemies each is against, and who gets the jump. The field keeps a
 * countdown of steps to the next battle; each step takes some off it, more or less as the
 * Encounter rate option says, and the battle comes when it runs out.
 */

/** How often random battles come: never, half as often, as often as tuned, or twice as often. */
export const ENCOUNTER_RATES = ['off', 'low', 'normal', 'high'] as const;
export type EncounterRate = (typeof ENCOUNTER_RATES)[number];

/** The numbers random battles run on: ENCOUNTER_TUNING in src/data/balance.ts. */
export interface EncounterTuning {
  /** How many steps it is from one random battle to the next, at the Normal rate: from these. */
  readonly steps: readonly [min: number, max: number];
  /** How much of the countdown a step takes at each rate: 1 at Normal, half that at Low. */
  readonly rates: Readonly<Record<EncounterRate, number>>;
  /** The share of battles the party gets the jump in (a preemptive strike), and the enemies. */
  readonly preemptive: number;
  readonly ambush: number;
}

/** The countdown to the next random battle: a whole number of steps, at the Normal rate. */
export function encounterCountdown(rng: Rng, tuning: EncounterTuning): number {
  const [min, max] = tuning.steps;
  return rng.int(min, max);
}

/** The countdown once a step at `rate` has been taken. At 0 or below, the battle comes. */
export const countStep = (
  countdown: number,
  rate: EncounterRate,
  tuning: EncounterTuning,
): number => countdown - tuning.rates[rate];

/** Whether the next step at `rate` brings the battle. At Off, none ever does. */
export const battleDue = (
  countdown: number,
  rate: EncounterRate,
  tuning: EncounterTuning,
): boolean => tuning.rates[rate] > 0 && countStep(countdown, rate, tuning) <= 0;

/**
 * A random battle from an area's encounter table: one of its groups, each as likely as its weight,
 * with a preemptive strike or an ambush now and then. It draws on the Rng twice: for the group,
 * then for who gets the jump.
 */
export function rollEncounter(
  table: EncounterTable,
  rng: Rng,
  tuning: EncounterTuning,
): BattleSetup {
  const enemies = rng.weighted(
    table.groups.map((group) => ({ weight: group.weight ?? 1, value: group.enemies })),
  );
  const roll = rng.next();
  if (roll < tuning.preemptive) return { enemies, start: 'preemptive' };
  if (roll < tuning.preemptive + tuning.ambush) return { enemies, start: 'ambush' };
  return { enemies };
}
