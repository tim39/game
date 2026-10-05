import type { EncounterRate } from '../core/encounters';

/**
 * The player's preferences. The Options screen (M5) will let them change these and keep them in
 * localStorage under `fifth-flame:settings`; until then they keep the defaults set at boot.
 */
export interface Settings {
  /** Run without holding Run, and walk while holding it. On by default on phones and tablets. */
  alwaysRun: boolean;
  /** How loud the music plays, from 0 (off) to 1. */
  musicVolume: number;
  /** How loud sound effects play, from 0 (off) to 1. */
  soundVolume: number;
  /**
   * How fast battles play out, as a multiple of `BATTLE_PACING`: 1 is normal. The Options screen
   * will offer 1×, 2× and 3×; the debug menu and `window.__game` 4×.
   */
  battleSpeed: number;
  /**
   * How often random battles come: Off, Low (half as often), Normal or High (twice as often). The
   * Options screen will offer it; until then, the debug menu and `window.__game`.
   */
  encounterRate: EncounterRate;
}

export const settings: Settings = {
  alwaysRun: false,
  musicVolume: 0.6,
  soundVolume: 0.8,
  battleSpeed: 1,
  encounterRate: 'normal',
};
