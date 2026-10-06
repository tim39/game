import { expect, test } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../systems/settings';
import {
  OPTION_ROWS,
  canChange,
  openOptions,
  rowAt,
  stepOptions,
  valueText,
  type OptionsInput,
  type OptionsMenu,
} from './options-flow';

const NONE: OptionsInput = { move: null, confirm: false, cancel: false };
const UP: OptionsInput = { ...NONE, move: 'up' };
const DOWN: OptionsInput = { ...NONE, move: 'down' };
const LEFT: OptionsInput = { ...NONE, move: 'left' };
const RIGHT: OptionsInput = { ...NONE, move: 'right' };
const CONFIRM: OptionsInput = { ...NONE, confirm: true };
const CANCEL: OptionsInput = { ...NONE, cancel: true };

/** Steps the screen through inputs, from `settings`, and gives back where it ended up. */
function play(settings: Readonly<Settings>, ...inputs: OptionsInput[]) {
  let menu: OptionsMenu = openOptions();
  let close = false;
  for (const input of inputs) ({ menu, settings, close } = stepOptions(menu, input, settings));
  return { menu, settings, close };
}

/** Moves the cursor down to `row`, then presses `inputs`. */
const on = (row: (typeof OPTION_ROWS)[number], ...inputs: OptionsInput[]): OptionsInput[] => [
  ...Array.from({ length: OPTION_ROWS.indexOf(row) }, () => DOWN),
  ...inputs,
];

test('a row for each setting, the cursor going round them', () => {
  expect(OPTION_ROWS.map((row) => [row, valueText(row, DEFAULT_SETTINGS)])).toEqual([
    ['textSpeed', 'Normal'],
    ['battleSpeed', '1x'],
    ['encounterRate', 'Normal'],
    ['alwaysRun', 'Off'],
    ['musicVolume', '60%'],
    ['soundVolume', '80%'],
    ['screenShake', 'On'],
    ['reduceFlashing', 'Off'],
  ]);
  expect(rowAt(play(DEFAULT_SETTINGS, UP).menu)).toBe('reduceFlashing');
  expect(rowAt(play(DEFAULT_SETTINGS, UP, DOWN, DOWN).menu)).toBe('battleSpeed');
});

test('Left and Right change a setting, stopping at either end', () => {
  expect(play(DEFAULT_SETTINGS, RIGHT).settings.textSpeed).toBe('fast');
  expect(play(DEFAULT_SETTINGS, RIGHT, RIGHT).settings.textSpeed).toBe('fast');
  expect(play(DEFAULT_SETTINGS, LEFT, LEFT).settings.textSpeed).toBe('slow');
  expect(
    play(DEFAULT_SETTINGS, ...on('battleSpeed', RIGHT, RIGHT, RIGHT)).settings.battleSpeed,
  ).toBe(3);
  expect(
    play(DEFAULT_SETTINGS, ...on('encounterRate', LEFT, LEFT, LEFT)).settings.encounterRate,
  ).toBe('off');
  expect(play(DEFAULT_SETTINGS, ...on('alwaysRun', RIGHT)).settings.alwaysRun).toBe(true);
  expect(play(DEFAULT_SETTINGS, ...on('screenShake', LEFT)).settings.screenShake).toBe(false);
});

test('volumes go up and down in tenths, from off to full', () => {
  const louder = play(DEFAULT_SETTINGS, ...on('musicVolume', RIGHT, RIGHT, RIGHT, RIGHT, RIGHT));
  expect(louder.settings.musicVolume).toBe(1);
  expect(valueText('musicVolume', louder.settings)).toBe('100%');
  const off = play(
    DEFAULT_SETTINGS,
    ...on('soundVolume', ...Array.from({ length: 9 }, () => LEFT)),
  );
  expect(off.settings.soundVolume).toBe(0);
  // A volume between tenths moves from the nearest.
  expect(
    play({ ...DEFAULT_SETTINGS, musicVolume: 0.62 }, ...on('musicVolume', LEFT)).settings
      .musicVolume,
  ).toBe(0.5);
});

test('Confirm steps a setting on, round to the start', () => {
  expect(play(DEFAULT_SETTINGS, CONFIRM, CONFIRM).settings.textSpeed).toBe('slow');
  const flashing = on('reduceFlashing', CONFIRM);
  expect(play(DEFAULT_SETTINGS, ...flashing).settings.reduceFlashing).toBe(true);
  expect(play(DEFAULT_SETTINGS, ...flashing, CONFIRM).settings.reduceFlashing).toBe(false);
});

test('the debug menu’s 4x battles show, and Left brings them back to 3x', () => {
  const fastest = { ...DEFAULT_SETTINGS, battleSpeed: 4 };
  expect(valueText('battleSpeed', fastest)).toBe('4x');
  expect(play(fastest, ...on('battleSpeed', RIGHT)).settings).toBe(fastest);
  expect(play(fastest, ...on('battleSpeed', LEFT)).settings.battleSpeed).toBe(3);
  expect(play(fastest, ...on('battleSpeed', CONFIRM)).settings.battleSpeed).toBe(1);
});

test('nothing changed leaves the settings as they were, and Cancel closes the screen', () => {
  expect(play(DEFAULT_SETTINGS, DOWN, UP, LEFT, NONE).settings).toEqual({
    ...DEFAULT_SETTINGS,
    textSpeed: 'slow',
  });
  expect(play(DEFAULT_SETTINGS, DOWN, DOWN).settings).toBe(DEFAULT_SETTINGS);
  expect(play(DEFAULT_SETTINGS, CANCEL).close).toBe(true);
  expect(play(DEFAULT_SETTINGS, DOWN).close).toBe(false);
});

test('a setting can’t be changed past either end', () => {
  expect(canChange('textSpeed', DEFAULT_SETTINGS, -1)).toBe(true);
  expect(canChange('textSpeed', { ...DEFAULT_SETTINGS, textSpeed: 'fast' }, 1)).toBe(false);
  expect(canChange('screenShake', DEFAULT_SETTINGS, 1)).toBe(false);
  expect(canChange('musicVolume', { ...DEFAULT_SETTINGS, musicVolume: 0 }, -1)).toBe(false);
  expect(canChange('battleSpeed', { ...DEFAULT_SETTINGS, battleSpeed: 4 }, 1)).toBe(false);
});
