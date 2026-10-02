import type { WalkSpeeds } from '../core/walker';

/** Tuning numbers. The battle formulas, encounter rates, prices and the EXP curve join these in M3. */

/** How long the player takes to cross one tile, walking and running. */
export const FIELD_SPEEDS: WalkSpeeds = { walkMs: 240, runMs: 120 };

/** Going between maps fades to black and back, this long each way. */
export const MAP_FADE_MS = 250;
