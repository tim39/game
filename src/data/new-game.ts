import type { Direction } from '../core/direction';

/** Where a new game begins: Saltmere, at Tamsin's door, until the opening (M2) says otherwise. */
export const NEW_GAME_START: { map: string; x: number; y: number; facing: Direction } = {
  map: 'saltmere',
  x: 7,
  y: 6,
  facing: 'down',
};
