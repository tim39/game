import { GAME_WIDTH } from '../systems/display';

/** The save menu is drawn at 2×, like the world and the dialogue box. */
export const SAVE_MENU_SCALE = 2;

/**
 * Where things go on the save menu, in its own pixels (the 320×180 screen it's drawn on at 2×).
 * Each slot is a panel cut from the pack's `ChoiceBox.png`, like the choice box: the slot's name,
 * the party, then where the game was saved and the leader's level, and on the right the play time
 * and when it was saved.
 */
export const SAVE_MENU = {
  /** The heading, "Save" or "Load". */
  title: { x: 12, y: 6 },
  panel: {
    x: 10,
    /** The first panel's top. */
    top: 18,
    width: GAME_WIDTH / SAVE_MENU_SCALE - 20,
    height: 34,
    /** Between one panel and the next. */
    gap: 3,
    /** The art's frame, corners included, which the panel is sliced at. */
    frame: 5,
  },
  /** From a panel's left edge: the ▶ cursor, the slot's name and the party's sprites. */
  cursorX: 9,
  labelX: 15,
  partyX: 64,
  /** The party's sprites are 16 pixels square, side by side, centred on the panel. */
  spriteSize: 16,
  /** Where the place and the leader's level go, and how wide a place's name can be. */
  placeX: 132,
  placeWidth: 92,
  /**
   * The play time and the time saved end here, from the panel's left edge: as far in from its
   * right edge as the slot's name is from its left, which keeps them clear of the touch controls'
   * B button on most phones.
   */
  rightX: 283,
  /** The two lines of text, from a panel's top. */
  lineY: [8, 20],
  /** Halfway between them, for a line on its own. */
  middleY: 14,
  /** The line at the bottom: what Confirm and Cancel do, or what just happened. */
  hintY: 168,
} as const;

/** The top of the `index`th slot's panel. */
export const panelTop = (index: number): number =>
  SAVE_MENU.panel.top + index * (SAVE_MENU.panel.height + SAVE_MENU.panel.gap);
