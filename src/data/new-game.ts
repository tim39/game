import type { NewGame } from '../core/state';

/** How a new game begins: Rowan alone at Tamsin's door in Saltmere, until the opening exists. */
export const NEW_GAME: NewGame = {
  location: { map: 'saltmere', x: 7, y: 6, facing: 'down' },
  party: ['rowan'],
};
