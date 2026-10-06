import type { Box } from './battle-layout';
import { MENU_LAYOUT } from './main-menu-layout';
import { SHOP_ROWS } from './shop-flow';

const { main, frame, content, lineHeight, cursor } = MENU_LAYOUT;
const GAP = 4;
/** The commands panel holds Buy, Sell and Leave. */
const COMMANDS: Box = { ...MENU_LAYOUT.commands, height: 2 * content.y + 3 * lineHeight - 4 };
/** Under the commands, down to the bottom of the big panel. */
const INFO: Box = {
  x: COMMANDS.x,
  y: COMMANDS.y + COMMANDS.height + GAP,
  width: COMMANDS.width,
  height: main.y + main.height - (COMMANDS.y + COMMANDS.height + GAP),
};
/** Where the party's row starts in the big panel, under the list. */
const PARTY_TOP = content.y + SHOP_ROWS * lineHeight + 9;

/**
 * Where things go in a shop, in its own pixels: drawn at 2× like the main menu, in panels laid out
 * like its. The big panel has the list at the top and the party along the bottom, a column each:
 * who could wear the gear under the cursor, and how it would change their stats. At the top right
 * are the commands; under them, the gold, how many of the item the party has, and what it does,
 * or how many to buy or sell. Positions inside a panel are from its top-left corner.
 */
export const SHOP_LAYOUT = {
  main,
  commands: COMMANDS,
  info: INFO,
  frame,
  content,
  lineHeight,
  cursor,
  /** The line between the list and the party, from the top of the big panel. */
  divider: PARTY_TOP - 5,
  /**
   * The party: a column each, spread evenly across the panel, their sprite at the top and up to
   * `lines` lines of stat changes under it, `lineHeight` apart.
   */
  party: { top: PARTY_TOP, sprite: 16, gap: 2, lines: 3, lineHeight: 10 },
  /** How many lines the info panel holds. */
  infoLines: Math.floor((INFO.height - 2 * content.y) / lineHeight),
} as const;
