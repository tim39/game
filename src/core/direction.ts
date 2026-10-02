export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** The cell offset one step in each direction. */
export const STEP: Readonly<Record<Direction, readonly [dx: number, dy: number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
