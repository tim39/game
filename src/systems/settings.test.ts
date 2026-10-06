import { beforeEach, expect, test } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
  settings,
  type Settings,
  type SettingsStorage,
} from './settings';

/** localStorage, as far as settings go. */
class FakeStorage implements SettingsStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

beforeEach(() => {
  Object.assign(settings, DEFAULT_SETTINGS);
});

const CHANGED: Settings = {
  textSpeed: 'fast',
  battleSpeed: 3,
  encounterRate: 'low',
  alwaysRun: true,
  musicVolume: 0.3,
  soundVolume: 0,
  screenShake: false,
  reduceFlashing: true,
};

test('settings kept as JSON read back as they were', () => {
  expect(parseSettings(JSON.stringify(CHANGED), DEFAULT_SETTINGS)).toEqual(CHANGED);
});

test('anything missing, or that makes no sense, is left as the defaults', () => {
  const kept = {
    textSpeed: 'fast',
    battleSpeed: 9,
    encounterRate: 'sometimes',
    musicVolume: 1.5,
    soundVolume: 0,
    screenShake: 'no',
    reduceFlashing: true,
  };
  expect(parseSettings(JSON.stringify(kept), DEFAULT_SETTINGS)).toEqual({
    ...DEFAULT_SETTINGS,
    textSpeed: 'fast',
    soundVolume: 0,
    reduceFlashing: true,
  });
  // The debug menu's 4x lasts, but nothing faster.
  expect(parseSettings('{"battleSpeed":4}', DEFAULT_SETTINGS).battleSpeed).toBe(4);
  expect(parseSettings('{"battleSpeed":2.5}', DEFAULT_SETTINGS).battleSpeed).toBe(1);
  for (const broken of [null, 'not JSON', '[1, 2]', '"fast"', 'null']) {
    expect(parseSettings(broken, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  }
});

test('loading says whether any were kept; saving keeps them for next time', () => {
  const storage = new FakeStorage();
  // A first visit on a phone: its defaults run.
  expect(loadSettings(storage, { ...DEFAULT_SETTINGS, alwaysRun: true })).toBe(false);
  expect(settings).toEqual({ ...DEFAULT_SETTINGS, alwaysRun: true });

  Object.assign(settings, CHANGED, { alwaysRun: false });
  saveSettings(storage);
  expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? '')).toEqual({ ...CHANGED, alwaysRun: false });
  Object.assign(settings, DEFAULT_SETTINGS);
  // What was kept beats the phone's defaults.
  expect(loadSettings(storage, { ...DEFAULT_SETTINGS, alwaysRun: true })).toBe(true);
  expect(settings).toEqual({ ...CHANGED, alwaysRun: false });
});

test('without storage, or with storage the browser blocks, the settings last until the page closes', () => {
  const blocked: SettingsStorage = {
    getItem: () => {
      throw new Error('Blocked');
    },
    setItem: () => {
      throw new Error('Blocked');
    },
  };
  expect(loadSettings(blocked)).toBe(false);
  expect(loadSettings(null)).toBe(false);
  expect(settings).toEqual(DEFAULT_SETTINGS);
  expect(() => saveSettings(blocked)).not.toThrow();
  expect(() => saveSettings(null)).not.toThrow();
});
