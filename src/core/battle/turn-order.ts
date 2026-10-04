import type { Fighter, Side } from './fighter';
import type { Rank } from './terms';
import type { BattleTuning } from './tuning';

/**
 * The turn order (see Turn order in docs/DESIGN.md). Every fighter has a CT, the time until their
 * turn: the lowest goes next, and that much time passes for everyone. After acting, a fighter's CT
 * becomes the delay of what they did.
 */

/**
 * How long an action of `rank` makes a fighter with `spd` wait for their next turn:
 * round(rank × k / (SPD + c)), multiplied by `speed` (Haste's or Slow's) before it's rounded, and
 * at least 1.
 */
export function delay(spd: number, rank: Rank, speed: number, tuning: BattleTuning): number {
  const { k, c } = tuning.delay;
  return Math.max(1, Math.round((tuning.ranks[rank] * k * speed) / (spd + c)));
}

/**
 * A fighter's Normal delay, without Haste or Slow: their first turn comes after some of it, and
 * staggers and Delay push them back by a share of it.
 */
export const normalDelay = (fighter: Fighter, tuning: BattleTuning): number =>
  delay(fighter.stats.spd, 'normal', 1, tuning);

/** What decides whose turn comes first. */
export interface TurnKey {
  readonly ct: number;
  readonly spd: number;
  readonly side: Side;
  readonly slot: number;
}

export const turnKey = (fighter: Fighter): TurnKey => ({
  ct: fighter.ct,
  spd: fighter.stats.spd,
  side: fighter.side,
  slot: fighter.slot,
});

/**
 * Orders turns: the lowest CT goes first, and of fighters due at once, the higher SPD, then the
 * party before the enemies, then whoever's further left. The order never comes down to chance.
 */
export const byTurn = (a: TurnKey, b: TurnKey): number =>
  a.ct - b.ct || b.spd - a.spd || sideOrder(a.side) - sideOrder(b.side) || a.slot - b.slot;

const sideOrder = (side: Side): number => (side === 'party' ? 0 : 1);
