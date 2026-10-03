export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const isDirection = (value: string): value is Direction =>
  (DIRECTIONS as readonly string[]).includes(value);

/** The cell offset one step in each direction. */
export const STEP: Readonly<Record<Direction, readonly [dx: number, dy: number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** The way to face to look from one cell towards another: along whichever axis is further. */
export function directionTowards(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Direction {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
