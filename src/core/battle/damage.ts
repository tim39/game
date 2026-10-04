import type { Reaction } from './terms';
import type { BattleTuning } from './tuning';

/**
 * Damage and healing (see Damage in docs/DESIGN.md). Physical hits pit ATK against DEF, magical
 * ones MAG against RES, and healing goes by MAG, each with buffs and debuffs already applied.
 */

/**
 * A hit's damage before anything multiplies it: power × A² / (A + D). It never reaches 0 while
 * the attack stat is above it, and gives defense gentle diminishing returns.
 */
export function baseDamage(power: number, attack: number, defense: number): number {
  return attack + defense === 0 ? 0 : (power * attack * attack) / (attack + defense);
}

/** Healing before the variance: power × MAG × 2. */
export const baseHealing = (power: number, mag: number): number => power * mag * 2;

/** What multiplies a hit besides its power and the stats, as the battle engine rolls it. */
export interface HitFactors {
  /** How the target takes the hit's element: `normal` for a hit without one. */
  readonly reaction: Reaction;
  readonly critical: boolean;
  /** Whether the target is guarding. */
  readonly guarded: boolean;
  /** The variance roll, a number from 0.9 to 1.1 with the game's tuning. */
  readonly variance: number;
}

/**
 * The damage a hit does, from its base: multiplied by the element's reaction, a critical hit and
 * Guard, then the variance, and rounded. It's at least 1 and at most the cap, except against an
 * immunity, which takes none. An element absorbed counts as normal here: the target heals by the
 * damage instead.
 */
export function finalDamage(base: number, factors: HitFactors, tuning: BattleTuning): number {
  const { reaction, critical, guarded, variance } = factors;
  if (reaction === 'immune') return 0;
  const element = reaction === 'weak' ? tuning.weak : reaction === 'resist' ? tuning.resist : 1;
  const crit = critical ? tuning.crit : 1;
  const guard = guarded ? tuning.guard : 1;
  return capped(Math.round(base * element * crit * guard * variance), tuning);
}

/** The healing a skill does, from its base: multiplied by the variance and rounded, 1 at least. */
export const finalHealing = (base: number, variance: number, tuning: BattleTuning): number =>
  capped(Math.round(base * variance), tuning);

const capped = (amount: number, tuning: BattleTuning): number =>
  Math.min(tuning.maxDamage, Math.max(1, amount));
