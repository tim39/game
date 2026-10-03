import { createGameState, type GameState } from '../core/state';
import { NEW_GAME } from '../data/new-game';

/**
 * The game being played. Scenes read `session.state`, and change it by swapping in what a core
 * operation returns: `session.state = setFlag(session.state, 'story.beacon-out')`. Loading a save
 * swaps in the saved state. See "Game state and saves" in docs/TECH.md.
 */
export const session: { state: GameState } = { state: createGameState(NEW_GAME) };

/** Drops the game being played, and starts again from the beginning. */
export function startNewGame(): void {
  session.state = createGameState(NEW_GAME);
}

/** Drops the game being played, and carries on from a saved one instead. */
export function loadGame(state: GameState): void {
  session.state = state;
}
