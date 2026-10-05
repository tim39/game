import { ICON_SIZE } from '../systems/asset-manifest';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { DIALOGUE_BOX_ON_SCREEN } from './dialogue-layout';

/**
 * Where things go on the battle screen (see Battle system in docs/DESIGN.md), in its own pixels:
 * it's drawn at 2×, like the world and the UI, so the screen is 320×180 of them. The timeline goes
 * across the top; the banner, for what's being done and what the cursor is on, just under it; the
 * enemies stand on the left and the party on the right; and the command window and the party's
 * status sit along the bottom, together where the dialogue box goes, which the touch controls keep
 * clear of.
 */
export const BATTLE_SCALE = 2;
export const BATTLE_WIDTH = GAME_WIDTH / BATTLE_SCALE;
export const BATTLE_HEIGHT = GAME_HEIGHT / BATTLE_SCALE;

/** A rectangle on the battle screen. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A point on the battle screen: where a fighter's feet are. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const BOTTOM: Box = {
  x: DIALOGUE_BOX_ON_SCREEN.x / BATTLE_SCALE,
  y: DIALOGUE_BOX_ON_SCREEN.y / BATTLE_SCALE,
  width: DIALOGUE_BOX_ON_SCREEN.width / BATTLE_SCALE,
  height: DIALOGUE_BOX_ON_SCREEN.height / BATTLE_SCALE,
};
const COMMANDS_WIDTH = 84;
const GAP = 2;
/** The panels are the pack's choice box, nine-sliced at its frame; text starts this far in. */
const FRAME = 5;
const INSET = { x: 4, y: 2 } as const;
const STATUS_WIDTH = BOTTOM.width - COMMANDS_WIDTH - GAP;
/** Skill and item lists show two to a row, in the status panel's place. */
const LIST_COLUMN = (STATUS_WIDTH - 2 * (FRAME + INSET.x)) / 2;
/** Room for the ▶ before a command, skill or item. */
const CURSOR = 5;

export const BATTLE_LAYOUT = {
  /**
   * The timeline across the top: a tile for whose turn it is, then, past a ▸, a tile for each of
   * the turns after it, `gap` apart. A tile is a fighter's icon in a frame.
   */
  timeline: { x: BOTTOM.x, y: 2, tile: 20, icon: ICON_SIZE, after: 14, gap: 7 },
  /** The banner: what's being done, or what the cursor is on. Under the timeline. */
  banner: { x: BOTTOM.x, y: 24, width: BOTTOM.width, height: 18 } satisfies Box,
  /** The command window, at the bottom left. */
  commands: { ...BOTTOM, width: COMMANDS_WIDTH } satisfies Box,
  /** The party's HP, MP and statuses, beside it, or a skill or item list in their place. */
  status: {
    x: BOTTOM.x + COMMANDS_WIDTH + GAP,
    y: BOTTOM.y,
    width: STATUS_WIDTH,
    height: BOTTOM.height,
  } satisfies Box,
  frame: FRAME,
  /** Text starts this far inside a panel's frame, across and down. */
  inset: INSET,
  /** Lines of text in a panel, 8 pixels tall. */
  lineHeight: 12,
  /** Room for the ▶ before a command, skill or item. */
  cursor: CURSOR,
  /** In the command window, from the text's left edge: where Flee starts, beside Guard. */
  secondCommand: 40,
  /**
   * In the status panel, from the text's left edge: where each part of a party member's line
   * starts, or ends for the numbers, which are right-aligned. MP shows just what's left.
   */
  statusColumns: { name: 0, hpLabel: 36, hpRight: 106, mpLabel: 112, mpRight: 145, tags: 151 },
  /** Each column of a skill or item list, and where its cost or count ends, from its left edge. */
  listColumn: { width: LIST_COLUMN, detailRight: LIST_COLUMN - 6 },
  /**
   * How wide text can be, in font pixels: a party member's name in the status panel, a skill's or
   * an item's name in its list, beside its cost or count, and the help line in the banner, which
   * says what a skill or item does.
   */
  room: {
    name: 34,
    listLabel: LIST_COLUMN - CURSOR - 6 - 14 - 3,
    help: BOTTOM.width - 2 * (FRAME + INSET.x),
  },
  /** Where enemies stand: spread across the left of the field, round this middle. */
  enemies: { middle: 88, spacing: 32, width: 120, back: 80, front: 100, alone: 92 },
  /**
   * Where the party stands: down the right of the field, every other one a step forward, further
   * apart the fewer there are.
   */
  party: { x: 258, stagger: 12, middle: 86, spread: 42, spacing: 22 },
  /** How far forward a party member steps when their turn comes. */
  stepForward: 14,
} as const;

/** Where the timeline's `index`th tile goes, by its top-left corner: whose turn it is first. */
export function timelineSpot(index: number): Point {
  const { x, y, tile, after, gap } = BATTLE_LAYOUT.timeline;
  return { x: index === 0 ? x : x + tile + after + (index - 1) * (tile + gap), y };
}

/**
 * Where each of `count` enemies stands, left to right: evenly across the left of the field, closer
 * together the more there are, every other one further forward. One stands alone in the middle.
 */
export function enemySpots(count: number): Point[] {
  const { middle, spacing, width, back, front, alone } = BATTLE_LAYOUT.enemies;
  if (count === 1) return [{ x: middle, y: alone }];
  const gap = Math.min(spacing, Math.floor(width / count));
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(middle + (index - (count - 1) / 2) * gap),
    y: index % 2 === 0 ? back : front,
  }));
}

/** Where each of `count` party members stands, top to bottom, every other one a step forward. */
export function partySpots(count: number): Point[] {
  const { x, stagger, middle, spread, spacing } = BATTLE_LAYOUT.party;
  const gap = count > 1 ? Math.min(spacing, Math.floor(spread / (count - 1))) : 0;
  return Array.from({ length: count }, (_, index) => ({
    x: x - (index % 2) * stagger,
    y: Math.round(middle + (index - (count - 1) / 2) * gap),
  }));
}
