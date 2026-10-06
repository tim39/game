/** What the Game Over screen offers, top to bottom. */
export const GAME_OVER_CHOICES = ['retry', 'load', 'title'] as const;
export type GameOverChoice = (typeof GAME_OVER_CHOICES)[number];

/**
 * The Game Over screen's menu without the drawing: Retry battle, Load save and Title, and the
 * cursor. See src/scenes/game-over.ts.
 */
export interface GameOverMenu {
  readonly cursor: number;
  /** Whether any save slot holds anything: until one does, Load save is greyed out. */
  readonly canLoad: boolean;
}

/** One frame's input: `move` is -1 for up, 1 for down. */
export interface GameOverInput {
  readonly move: -1 | 0 | 1;
  readonly confirm: boolean;
}

/** Opens on Retry battle, what someone who has just lost most likely wants. */
export const openGameOverMenu = (canLoad: boolean): GameOverMenu => ({ cursor: 0, canLoad });

/** Whether a choice can be made now: Load save only once there's a save to load. */
export const canChoose = (menu: GameOverMenu, choice: GameOverChoice): boolean =>
  choice !== 'load' || menu.canLoad;

/**
 * Moves the cursor, round from the last choice to the first, or with Confirm makes the choice
 * under it, if it can be made. There's no going back from a Game Over, so Cancel does nothing.
 */
export function stepGameOverMenu(
  menu: GameOverMenu,
  input: GameOverInput,
): { menu: GameOverMenu; chosen: GameOverChoice | null } {
  // Confirm first, so a press in the same frame as a move picks what was on screen.
  if (input.confirm) {
    const choice = GAME_OVER_CHOICES[menu.cursor];
    return { menu, chosen: choice !== undefined && canChoose(menu, choice) ? choice : null };
  }
  if (input.move === 0) return { menu, chosen: null };
  const count = GAME_OVER_CHOICES.length;
  return { menu: { ...menu, cursor: (menu.cursor + input.move + count) % count }, chosen: null };
}
