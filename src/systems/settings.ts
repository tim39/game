/**
 * The player's preferences. The Options screen (M5) will let them change these and keep them in
 * localStorage under `fifth-flame:settings`; until then they keep the defaults set at boot.
 */
export interface Settings {
  /** Run without holding Run, and walk while holding it. On by default on phones and tablets. */
  alwaysRun: boolean;
}

export const settings: Settings = { alwaysRun: false };
