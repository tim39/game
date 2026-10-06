import { ENCOUNTER_RATES, type EncounterRate } from '../core/encounters';

/**
 * The player's preferences, which the Options screen changes (see Screens in docs/DESIGN.md). They
 * last between sessions, kept in localStorage under `fifth-flame:settings` apart from any save, so
 * they hold for every game in this browser: `loadSettings` reads them at boot, and the Options
 * screen keeps them with `saveSettings` as it closes.
 */

/** How fast dialogue types out; TEXT_SPEED in balance.ts says how many characters a second. */
export const TEXT_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];

/** The battle speeds the Options screen offers. The debug menu and `window.__game` go up to 4. */
export const BATTLE_SPEEDS = [1, 2, 3] as const;
const FASTEST_BATTLES = 4;

/** Volumes go up and down in tenths, from 0 (off) to 1. */
export const VOLUME_STEPS = 10;

export interface Settings {
  /** How fast dialogue types out. */
  textSpeed: TextSpeed;
  /** How fast battles play out, as a multiple of `BATTLE_PACING`: 1 is normal. */
  battleSpeed: number;
  /** How often random battles come: Off, Low (half as often), Normal or High (twice as often). */
  encounterRate: EncounterRate;
  /** Run without holding Run, and walk while holding it. On by default on phones and tablets. */
  alwaysRun: boolean;
  /** How loud the music plays, from 0 (off) to 1. */
  musicVolume: number;
  /** How loud sound effects play, from 0 (off) to 1. */
  soundVolume: number;
  /** The screen shakes at a critical hit and when a figure is struck hard. */
  screenShake: boolean;
  /** Fewer, gentler flashes: no white flash into a battle, and hits flash once, softly. */
  reduceFlashing: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  textSpeed: 'normal',
  battleSpeed: 1,
  encounterRate: 'normal',
  alwaysRun: false,
  musicVolume: 0.6,
  soundVolume: 0.8,
  screenShake: true,
  reduceFlashing: false,
};

export const settings: Settings = { ...DEFAULT_SETTINGS };

/** Where the settings are kept in localStorage. */
export const SETTINGS_KEY = 'fifth-flame:settings';

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Settings read back from what was kept: each that's there and makes sense, and the rest as in
 * `defaults`, so a setting added since, or a broken one, never stops the game.
 */
export function parseSettings(text: string | null, defaults: Readonly<Settings>): Settings {
  let kept: unknown = null;
  try {
    kept = text === null ? null : JSON.parse(text);
  } catch {
    // Not JSON: the defaults, then.
  }
  const read = typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>) : {};
  const flag = (value: unknown, otherwise: boolean) =>
    typeof value === 'boolean' ? value : otherwise;
  const volume = (value: unknown, otherwise: number) =>
    typeof value === 'number' && value >= 0 && value <= 1 ? value : otherwise;
  const speed = read.battleSpeed;
  return {
    textSpeed: oneOf(read.textSpeed, TEXT_SPEEDS) ?? defaults.textSpeed,
    battleSpeed:
      typeof speed === 'number' && Number.isInteger(speed) && speed >= 1 && speed <= FASTEST_BATTLES
        ? speed
        : defaults.battleSpeed,
    encounterRate: oneOf(read.encounterRate, ENCOUNTER_RATES) ?? defaults.encounterRate,
    alwaysRun: flag(read.alwaysRun, defaults.alwaysRun),
    musicVolume: volume(read.musicVolume, defaults.musicVolume),
    soundVolume: volume(read.soundVolume, defaults.soundVolume),
    screenShake: flag(read.screenShake, defaults.screenShake),
    reduceFlashing: flag(read.reduceFlashing, defaults.reduceFlashing),
  };
}

/**
 * Reads the settings kept in `storage` into `settings`, over `defaults`. Returns whether any were
 * kept, so a first visit can pick defaults for the device.
 */
export function loadSettings(
  storage: SettingsStorage | null,
  defaults: Readonly<Settings> = DEFAULT_SETTINGS,
): boolean {
  let text: string | null = null;
  try {
    text = storage?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    // Storage the browser won't let the game read: the defaults, then.
  }
  Object.assign(settings, parseSettings(text, defaults));
  return text !== null;
}

/** Keeps the settings in `storage` for next time. Where it can't, they last until the page closes. */
export function saveSettings(storage: SettingsStorage | null): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage that's full, or blocked: nothing to be done.
  }
}

/** localStorage, or null where the browser won't let the game have it (some privacy settings). */
export function browserStorage(): SettingsStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): T | undefined {
  return choices.find((choice) => choice === value);
}
