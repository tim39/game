import type { Direction } from '../core/direction';
import { ENCOUNTER_RATES } from '../core/encounters';
import { OPTIONS_TEXT } from '../data/ui-text';
import { BATTLE_SPEEDS, TEXT_SPEEDS, VOLUME_STEPS, type Settings } from '../systems/settings';

/**
 * The Options screen without the drawing (see Screens in docs/DESIGN.md): a row for each setting.
 * Up and Down go from row to row, round from the last to the first; Left and Right change the one
 * under the cursor, stopping at either end, and Confirm steps it on, round to the start. Cancel
 * closes the screen. `stepOptions` hands back the settings as they now are, for the scene to put
 * in place.
 */

export const OPTION_ROWS = [
  'textSpeed',
  'battleSpeed',
  'encounterRate',
  'alwaysRun',
  'musicVolume',
  'soundVolume',
  'screenShake',
  'reduceFlashing',
] as const satisfies readonly (keyof Settings)[];
export type OptionRow = (typeof OPTION_ROWS)[number];

/** Where the cursor is. */
export interface OptionsMenu {
  readonly cursor: number;
}

/** One frame's input. Menu closes the screen, as Cancel does. */
export interface OptionsInput {
  readonly move: Direction | null;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

export const openOptions = (): OptionsMenu => ({ cursor: 0 });

/** The row under the cursor. */
export const rowAt = (menu: OptionsMenu): OptionRow => OPTION_ROWS[menu.cursor] ?? 'textSpeed';

/**
 * What a press does: moves the cursor, changes the setting under it, or closes the screen. Changes
 * come back as new settings; those not changed are the same object.
 */
export function stepOptions(
  menu: OptionsMenu,
  input: OptionsInput,
  current: Readonly<Settings>,
): { menu: OptionsMenu; settings: Readonly<Settings>; close: boolean } {
  const still = { menu, settings: current, close: false };
  if (input.cancel) return { ...still, close: true };
  const row = rowAt(menu);
  if (input.confirm) return { ...still, settings: stepped(row, current, 1, true) };
  switch (input.move) {
    case 'up':
    case 'down': {
      const step = input.move === 'down' ? 1 : -1;
      const cursor = (menu.cursor + step + OPTION_ROWS.length) % OPTION_ROWS.length;
      return { ...still, menu: { cursor } };
    }
    case 'left':
    case 'right':
      return { ...still, settings: stepped(row, current, input.move === 'right' ? 1 : -1, false) };
    case null:
      return still;
  }
}

/** A setting's value as the screen shows it: `Normal`, `2x`, `On`. Volumes show as a bar instead. */
export function valueText(row: OptionRow, current: Readonly<Settings>): string {
  switch (row) {
    case 'textSpeed':
      return OPTIONS_TEXT.textSpeeds[current.textSpeed];
    case 'battleSpeed':
      return OPTIONS_TEXT.battleSpeed(current.battleSpeed);
    case 'encounterRate':
      return OPTIONS_TEXT.encounterRates[current.encounterRate];
    case 'alwaysRun':
    case 'screenShake':
    case 'reduceFlashing':
      return current[row] ? OPTIONS_TEXT.on : OPTIONS_TEXT.off;
    case 'musicVolume':
    case 'soundVolume':
      return OPTIONS_TEXT.volume(volumeStep(current[row]));
  }
}

/** Whether Left (`by` -1) or Right (1) would change a setting, or it's as far as it goes that way. */
export const canChange = (row: OptionRow, current: Readonly<Settings>, by: 1 | -1): boolean =>
  stepped(row, current, by, false) !== current;

/** A volume in tenths, from 0 to VOLUME_STEPS, as its bar shows it. */
export const volumeStep = (volume: number): number => Math.round(volume * VOLUME_STEPS);

/**
 * A setting moved `by` one choice along its choices: to either end and no further, or with `wrap`,
 * round from the last to the first. Unchanged, it's `current` itself.
 */
function stepped(
  row: OptionRow,
  current: Readonly<Settings>,
  by: 1 | -1,
  wrap: boolean,
): Readonly<Settings> {
  const choices = choicesOf(row);
  const value = current[row];
  const at =
    typeof value === 'number' && (row === 'musicVolume' || row === 'soundVolume')
      ? volumeStep(value)
      : choices.findIndex((choice) => choice === value);
  let next: string | number | boolean | undefined;
  if (at < 0) {
    // A value the screen doesn't offer (the debug menu's 4x battles): Left brings it back to the
    // nearest it does, and Confirm round to the first.
    next = by < 0 ? choices.at(-1) : wrap ? choices[0] : undefined;
  } else {
    const index = wrap
      ? (at + by + choices.length) % choices.length
      : Math.max(0, Math.min(choices.length - 1, at + by));
    next = choices[index];
  }
  if (next === undefined || next === value) return current;
  return { ...current, [row]: next };
}

/** What a setting can be, in order. */
function choicesOf(row: OptionRow): readonly (string | number | boolean)[] {
  switch (row) {
    case 'textSpeed':
      return TEXT_SPEEDS;
    case 'battleSpeed':
      return BATTLE_SPEEDS;
    case 'encounterRate':
      return ENCOUNTER_RATES;
    case 'alwaysRun':
    case 'screenShake':
    case 'reduceFlashing':
      return [false, true];
    case 'musicVolume':
    case 'soundVolume':
      return Array.from({ length: VOLUME_STEPS + 1 }, (_, step) => step / VOLUME_STEPS);
  }
}
