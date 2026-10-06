import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import type { Box } from './battle-layout';

/** The main menu is drawn at 2×, like the world, the battle and the save menu. */
export const MENU_SCALE = 2;
export const MENU_WIDTH = GAME_WIDTH / MENU_SCALE;
export const MENU_HEIGHT = GAME_HEIGHT / MENU_SCALE;

const MARGIN = 6;
const GAP = 4;
/** The commands, and the gold, play time and place under them, down the right. */
const SIDE = 100;
const COMMANDS_HEIGHT = 86;
/** The panels are the pack's choice box, nine-sliced at its frame; text starts this far in. */
const FRAME = 5;
const INSET = { x: 4, y: 2 } as const;
const CONTENT = { x: FRAME + INSET.x, y: FRAME + INSET.y } as const;
const MAIN: Box = {
  x: MARGIN,
  y: MARGIN,
  width: MENU_WIDTH - 2 * MARGIN - SIDE - GAP,
  height: MENU_HEIGHT - 2 * MARGIN,
};
const INFO: Box = {
  x: MENU_WIDTH - MARGIN - SIDE,
  y: MARGIN + COMMANDS_HEIGHT + GAP,
  width: SIDE,
  height: MENU_HEIGHT - 2 * MARGIN - COMMANDS_HEIGHT - GAP,
};
/** Room for the ▶ before a line that can be chosen. */
const CURSOR = 5;
const PORTRAIT = 38;
/** Where a member's lines start, beside their portrait, and how wide they are. */
const MEMBER_TEXT = CONTENT.x + CURSOR + PORTRAIT + 5;
const MEMBER_WIDTH = MAIN.width - CONTENT.x - MEMBER_TEXT;

/**
 * Where things go on the main menu, in its own pixels (the 320×180 screen it's drawn on at 2×):
 * the party, or the page open, in the big panel on the left; the commands at the top right; and
 * under them, the gold, the play time and the place, or what the thing under the cursor is or
 * does. Positions inside a panel are from its top-left corner.
 */
export const MENU_LAYOUT = {
  main: MAIN,
  commands: { x: MENU_WIDTH - MARGIN - SIDE, y: MARGIN, width: SIDE, height: COMMANDS_HEIGHT },
  info: INFO,
  frame: FRAME,
  /** Where text starts inside a panel's frame. */
  content: CONTENT,
  /** Lines of text, 8 pixels tall. */
  lineHeight: 12,
  cursor: CURSOR,
  /** How many lines the info panel holds. */
  infoLines: 5,
  /**
   * A party member's row: their portrait, beside the ▶, and three lines (name and level; HP and
   * MP; EXP to the next level). Rows are `height` apart, the first at `top`.
   */
  member: { top: 6, height: 39, portrait: PORTRAIT, textX: MEMBER_TEXT, lines: [2, 14, 26] },
  /** In a member's lines, from their left: where each part starts, or ends for numbers. */
  memberColumns: {
    name: 0,
    levelRight: MEMBER_WIDTH,
    hpLabel: 0,
    hpRight: 74,
    mpLabel: 80,
    mpRight: MEMBER_WIDTH,
  },
  /** Where a list starts: at the top, or under the row of the member it's about. */
  listTop: { alone: CONTENT.y, underMember: 49 },
  /** The stats, in two columns of four, under a list on Equip and on Status. */
  stats: {
    top: { equip: 101, status: 65 },
    column: 93,
    nowRight: 46,
    arrow: 50,
    afterRight: 76,
  },
  /** On Status: the EXP line under the member's row, and their gear under the stats. */
  status: { exp: 49, equipment: 119, itemX: 50 },
  /** How wide text may be, in font pixels, for `npm run validate`. */
  room: {
    /** A member's name, before their level. */
    name: MEMBER_WIDTH - 40,
    /** An item's or skill's name, in a list, before its count or MP cost. */
    listLabel: MAIN.width - 2 * CONTENT.x - CURSOR - 24,
    /** A line in the info panel: a description wraps over its lines. */
    info: INFO.width - 2 * CONTENT.x,
  },
} as const;
