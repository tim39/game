import type { Direction } from '../core/direction';

/** Where a new game begins: the test map until Saltmere's map is drafted (M1). */
export const NEW_GAME_START: { map: string; x: number; y: number; facing: Direction } = {
  map: 'test-shore',
  x: 9,
  y: 6,
  facing: 'down',
};
