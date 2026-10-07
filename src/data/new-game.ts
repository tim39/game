import type { NewGame } from '../core/state';

/**
 * How a new game begins: Rowan alone, up and about between the beds in Tamsin's house in Saltmere,
 * on the morning of the Kindling. The opening plays as it starts (`saltmere/opening`).
 */
export const NEW_GAME: NewGame = {
  location: { map: 'saltmere-tamsin', x: 2, y: 2, facing: 'down' },
  party: ['rowan'],
};
