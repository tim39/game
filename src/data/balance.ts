import type { NpcTuning } from '../core/npc';
import type { WalkSpeeds } from '../core/walker';

/** Tuning numbers. The battle formulas, encounter rates, prices and the EXP curve join these in M3. */

/** How long the player takes to cross one tile, walking and running. */
export const FIELD_SPEEDS: WalkSpeeds = { walkMs: 240, runMs: 120 };

/** Going between maps fades to black and back, this long each way. */
export const MAP_FADE_MS = 250;

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
