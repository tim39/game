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

/** What opening a chest says, in the plain box signs use: what was inside, or that it's empty. */
export const CHEST_TEXT: ChestText = {
  speaker: 'sign',
  found: (contents) =>
    'gold' in contents ? `Found ${contents.gold} gold!` : `Found ${itemName(contents.item)}!`,
  empty: 'The chest is empty.',
};
