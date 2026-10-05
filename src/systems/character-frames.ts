import type { Direction } from '../core/direction';
import { walkPhase, type Walker } from '../core/walker';

/** Character sheets have a column per direction, in this order, and a row per pose. */
const COLUMN: Readonly<Record<Direction, number>> = { down: 0, up: 1, left: 2, right: 3 };
const COLUMNS = 4;

/**
 * The walk cycle: rows 0–3 go feet together, stride, feet together, other stride. Short sheets
 * (Tamsin's, the child's) have only the first two rows.
 */
const WALK_ROWS = 4;

/** The frame to draw for a walker, on a character sheet with `rows` rows. */
export function characterFrame(walker: Walker, rows: number): number {
  const phase = walkPhase(walker);
  const row = phase === null ? 0 : phase % Math.min(rows, WALK_ROWS);
  return row * COLUMNS + COLUMN[walker.facing];
}

/** How many rows a character sheet has, from its frame count. */
export const sheetRows = (frames: number): number => Math.floor(frames / COLUMNS);

/** A frame of a character sheet: a pose's row, facing one way. */
const frameAt = (row: number, facing: Direction): number => row * COLUMNS + COLUMN[facing];

/**
 * The poses characters take in battle, as frames of a full 7-row sheet: facing left, at the
 * enemies, they stand, walk (the walk cycle's four rows), strike (the attack row), leap (the jump
 * row) and use something (the special row's second frame), and they fall (its first); facing
 * right, they run away.
 */
export const BATTLE_POSES = {
  stand: frameAt(0, 'left'),
  walk: [0, 1, 2, 3].map((row) => frameAt(row, 'left')),
  strike: frameAt(4, 'left'),
  leap: frameAt(5, 'left'),
  use: 6 * COLUMNS + 1,
  down: 6 * COLUMNS,
  run: [0, 1, 2, 3].map((row) => frameAt(row, 'right')),
} as const;
