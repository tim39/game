import type { Box } from './battle-layout';
import { MENU_LAYOUT, MENU_WIDTH } from './main-menu-layout';
import { OPTION_ROWS } from './options-flow';

const { frame, content, cursor, lineHeight } = MENU_LAYOUT;
const WIDTH = 240;
/** The rows are a little further apart than lines of text, to leave room for the volume bars. */
const ROW = 13;
/** The first row, under the title. */
const FIRST_ROW = content.y + lineHeight + 4;
const PANEL: Box = {
  x: (MENU_WIDTH - WIDTH) / 2,
  y: 8,
  width: WIDTH,
  height: FIRST_ROW + (OPTION_ROWS.length - 1) * ROW + 8 + content.y,
};
/** Two lines of help under the panel. */
const HELP: Box = {
  x: PANEL.x,
  y: PANEL.y + PANEL.height + 4,
  width: WIDTH,
  height: 2 * content.y + lineHeight + 8,
};
/**
 * Each value sits between ◀ and ▶, to the right of its name: short of the panel's right edge, where
 * a 16:9 phone's touch controls cover it.
 */
const VALUE = { left: 112, right: 202 };

/**
 * Where things go on the Options screen, in its own pixels (drawn at 2× like the main menu): the
 * settings in a panel, a row each with its name at the left and its value between arrows at the
 * right, and what the one under the cursor does in a panel under it. Positions inside a panel are
 * from its top-left corner.
 */
export const OPTIONS_LAYOUT = {
  panel: PANEL,
  help: HELP,
  frame,
  content,
  cursor,
  lineHeight,
  firstRow: FIRST_ROW,
  row: ROW,
  value: VALUE,
  /** A volume's bar: ten segments, each `width` wide and `gap` apart, centred between the arrows. */
  bar: { width: 6, gap: 2, height: 6 },
  /** How wide text may be, in font pixels, for the tests. */
  room: {
    label: VALUE.left - content.x - cursor - 4,
    value: VALUE.right - VALUE.left - 2 * 8,
    help: WIDTH - 2 * content.x,
    helpLines: 2,
  },
} as const;
