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
}

export const settings: Settings = { alwaysRun: false, musicVolume: 0.6, soundVolume: 0.8 };
