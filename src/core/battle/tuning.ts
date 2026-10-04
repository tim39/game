import type { BuffMultipliers } from '../stats';
import type { Rank, Status } from './terms';

/**
 * The numbers the battle rules run on (see Battle system in docs/DESIGN.md). They're tuning, so
 * they're passed in: BATTLE_TUNING in src/data/balance.ts, or simpler ones in tests.
 */
export interface BattleTuning {
  /**
   * An action's delay, the time until its user's next turn, is round(rank × k / (SPD + c)), with
   * Haste or Slow multiplying it before it's rounded.
   */
  readonly delay: { readonly k: number; readonly c: number };
  /** What each rank multiplies a delay by. */
  readonly ranks: Readonly<Record<Rank, number>>;
  /** Each fighter's first turn comes after their Normal delay times a random number from these. */
  readonly startCt: readonly [min: number, max: number];
  /** What Haste and Slow multiply a fighter's delays by. */
  readonly haste: number;
  readonly slow: number;
  /** What damage is multiplied by on a weakness, and on an element resisted. */
  readonly weak: number;
  readonly resist: number;
  /** Physical hits are critical this share of the time, which multiplies their damage by `crit`. */
  readonly critChance: number;
  readonly crit: number;
  /** What Guard multiplies damage taken by. */
  readonly guard: number;
  /** What ATK, DEF, MAG and RES Up and Down multiply those stats by. */
  readonly buffs: BuffMultipliers;
  /** Damage and healing are multiplied by a random number from these. */
  readonly variance: readonly [min: number, max: number];
  /** The most damage, or healing, one hit can do. */
  readonly maxDamage: number;
  /**
   * Hitting a weakness pushes the target back by this share of their Normal delay, and a boss by
   * `bossStagger` of that.
   */
  readonly stagger: number;
  readonly bossStagger: number;
  /** Poison takes this share of max HP at the start of each turn, and Regen gives it. */
  readonly poison: number;
  readonly regen: number;
  /** A Blinded fighter's physical attacks miss this share of the time. */
  readonly blindMiss: number;
  /** How many of the fighter's own turns each status lasts. Poison lasts until it's cured. */
  readonly turns: Readonly<Record<Exclude<Status, 'poison'>, number>>;
  /** Slow lasts this share as long on a boss, rounded up. */
  readonly bossSlow: number;
  /**
   * The chance of fleeing: base + perSpd × (the party's average SPD − the enemies'), kept from min
   * to max.
   */
  readonly flee: {
    readonly base: number;
    readonly perSpd: number;
    readonly min: number;
    readonly max: number;
  };
}
