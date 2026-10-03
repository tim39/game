import type { ChestText } from '../core/chest';
import { itemName } from './items';

/** Player-facing text that isn't dialogue: prompts, hints and system messages. */
export const UI_TEXT = {
  /** Under the title screen's menu, for a keyboard and for the touch controls. */
  chooseWithKeys: 'Z or Enter to choose',
  chooseWithTouch: 'A to choose',
  /** Covers the game on a phone held upright, where the game is too small to play. */
  turnSideways: 'Turn your phone sideways to play.',
} as const;

/**
 * The save menu: saving in a slot from the field, and loading one from the title screen's
 * Continue. `slot` is `autosave` or a slot's number.
 */
export const SAVE_MENU_TEXT = {
  title: { save: 'Save', load: 'Load' },
  slot: (slot: 'autosave' | number) => (slot === 'autosave' ? 'Autosave' : `Slot ${slot}`),
  empty: 'Empty',
  damaged: "Can't be loaded",
  newer: 'Saved by a newer version',
  level: (level: number) => `Lv ${level}`,
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  /** Asked before saving over a slot that holds something, with Yes and No to pick from. */
  overwrite: (slot: string) => `Save over ${slot}?`,
  yes: 'Yes',
  no: 'No',
  saved: (slot: string) => `Saved in ${slot}.`,
  failed: "Couldn't save: the browser wouldn't keep it.",
  /** What Confirm and Cancel do, for a keyboard and for the touch controls. */
  hint: {
    keys: { save: 'Z: save   X: back', load: 'Z: load   X: back' },
    touch: { save: 'A: save   B: back', load: 'A: load   B: back' },
  },
} as const;

/** What opening a chest says, in the plain box signs use: what was inside, or that it's empty. */
export const CHEST_TEXT: ChestText = {
  speaker: 'sign',
  found: (contents) =>
    'gold' in contents ? `Found ${contents.gold} gold!` : `Found ${itemName(contents.item)}!`,
  empty: 'The chest is empty.',
};
