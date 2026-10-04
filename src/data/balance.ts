import type { ExpCurve } from '../core/levels';
import type { NpcTuning } from '../core/npc';
import type { BuffMultipliers } from '../core/stats';
import type { WalkSpeeds } from '../core/walker';

/** Tuning numbers. The battle formulas, encounter rates and prices join these in M3. */

/**
 * The EXP curve: reaching level L takes 12 × (L − 1)^2.5 EXP in all, rounded, up to level 30.
 * Level 2 takes 12, level 5 takes 384, level 10 takes 2,916 and level 30 takes 54,347. Each level
 * takes more than the last, so later enemies give more EXP. They're tuned to bring the party to
 * each area at its target level (see Levels in docs/DESIGN.md).
 */
export const EXP_CURVE: ExpCurve = { maxLevel: 30, scale: 12, power: 2.5 };

/** ATK, DEF, MAG and RES Up and Down multiply that stat by these (see Status effects). */
export const BUFF_MULTIPLIERS: BuffMultipliers = { up: 1.25, down: 0.75 };

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
