import type { BattleTuning } from '../core/battle/tuning';
import type { ExpCurve } from '../core/levels';
import type { NpcTuning } from '../core/npc';
import type { BuffMultipliers } from '../core/stats';
import type { WalkSpeeds } from '../core/walker';

/** Tuning numbers. Encounter rates join these in M4. */

/**
 * The EXP curve: reaching level L takes 12 × (L − 1)^2.5 EXP in all, rounded, up to level 30.
 * Level 2 takes 12, level 5 takes 384, level 10 takes 2,916 and level 30 takes 54,347. Each level
 * takes more than the last, so later enemies give more EXP. They're tuned to bring the party to
 * each area at its target level (see Levels in docs/DESIGN.md).
 */
export const EXP_CURVE: ExpCurve = { maxLevel: 30, scale: 12, power: 2.5 };

/** ATK, DEF, MAG and RES Up and Down multiply that stat by these (see Status effects). */
export const BUFF_MULTIPLIERS: BuffMultipliers = { up: 1.25, down: 0.75 };

/**
 * The battle rules' numbers (see Battle system in docs/DESIGN.md). An action's delay is
 * round(rank × 1000 / (SPD + 10)): a Normal action at SPD 10 takes 50, and at SPD 40 takes 20.
 */
export const BATTLE_TUNING: BattleTuning = {
  delay: { k: 1000, c: 10 },
  ranks: { quick: 0.7, normal: 1, slow: 1.4, 'very-slow': 2 },
  startCt: [0.4, 1],
  haste: 0.6,
  slow: 1.6,
  weak: 1.5,
  resist: 0.5,
  critChance: 0.05,
  crit: 1.5,
  guard: 0.5,
  buffs: BUFF_MULTIPLIERS,
  variance: [0.9, 1.1],
  maxDamage: 9999,
  stagger: 0.25,
  bossStagger: 0.5,
  poison: 0.08,
  regen: 0.08,
  blindMiss: 0.5,
  turns: {
    regen: 3,
    sleep: 3,
    silence: 3,
    blind: 3,
    haste: 3,
    slow: 3,
    'atk-up': 3,
    'atk-down': 3,
    'def-up': 3,
    'def-down': 3,
    'mag-up': 3,
    'mag-down': 3,
    'res-up': 3,
    'res-down': 3,
    provoke: 2,
  },
  bossSlow: 0.5,
  flee: { base: 0.5, perSpd: 0.02, min: 0.2, max: 0.95 },
};

/** How long the player takes to cross one tile, walking and running. */
export const FIELD_SPEEDS: WalkSpeeds = { walkMs: 240, runMs: 120 };

/** Going between maps fades to black and back, this long each way. */
export const MAP_FADE_MS = 250;

/** Music crossfades this long: the new track fades in as the old one fades out. */
export const MUSIC_FADE_MS = 1000;

/**
 * A sound effect asked for again within this long of the last time plays only once, so a cursor
 * moving fast through a menu doesn't stack its clicks.
 */
export const SOUND_REPEAT_MS = 50;

/**
 * How NPCs move: a slower step than the player's, a pause of 1.5–4 s before each wander, and how
 * long they keep looking at the player after being bumped into.
 */
export const NPC_TUNING: NpcTuning = { stepMs: 360, pauseMs: [1500, 4000], lookMs: 3000 };

/**
 * How fast dialogue types out, in characters a second: a full box of about 140 characters in under
 * three seconds. Confirm shows the rest at once. The Options screen (M5) will offer other speeds.
 */
export const TEXT_SPEED = 50;
