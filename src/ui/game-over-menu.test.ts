import { describe, expect, test } from 'vitest';
import {
  GAME_OVER_CHOICES,
  canChoose,
  openGameOverMenu,
  stepGameOverMenu,
  type GameOverInput,
  type GameOverMenu,
} from './game-over-menu';

const NONE: GameOverInput = { move: 0, confirm: false };
const DOWN: GameOverInput = { ...NONE, move: 1 };
const UP: GameOverInput = { ...NONE, move: -1 };
const CONFIRM: GameOverInput = { ...NONE, confirm: true };

/** Steps the menu through inputs, and gives back where it ended up and what was chosen last. */
function play(menu: GameOverMenu, ...inputs: GameOverInput[]) {
  let chosen: ReturnType<typeof stepGameOverMenu>['chosen'] = null;
  for (const input of inputs) ({ menu, chosen } = stepGameOverMenu(menu, input));
  return { menu, chosen };
}

describe('the Game Over menu', () => {
  test('offers Retry battle, Load save and Title, and opens on Retry battle', () => {
    expect(GAME_OVER_CHOICES).toEqual(['retry', 'load', 'title']);
    expect(openGameOverMenu(true)).toEqual({ cursor: 0, canLoad: true });
    expect(play(openGameOverMenu(false), CONFIRM).chosen).toBe('retry');
  });

  test('can load a save only once there is one', () => {
    expect(canChoose(openGameOverMenu(true), 'load')).toBe(true);
    expect(canChoose(openGameOverMenu(false), 'load')).toBe(false);
    for (const choice of ['retry', 'title'] as const) {
      expect(canChoose(openGameOverMenu(false), choice)).toBe(true);
    }
  });

  test('Confirm makes the choice under the cursor', () => {
    expect(play(openGameOverMenu(true), DOWN, CONFIRM)).toEqual({
      menu: { cursor: 1, canLoad: true },
      chosen: 'load',
    });
    expect(play(openGameOverMenu(true), DOWN, DOWN, CONFIRM).chosen).toBe('title');
  });

  test('Load save, greyed out, can be pointed at but not chosen', () => {
    const { menu, chosen } = play(openGameOverMenu(false), DOWN, CONFIRM);
    expect(menu.cursor).toBe(1);
    expect(chosen).toBeNull();
    expect(play(menu, DOWN, CONFIRM).chosen).toBe('title');
  });

  test('the cursor goes round from the last choice to the first, and back', () => {
    const menu = openGameOverMenu(true);
    expect(play(menu, UP).menu.cursor).toBe(2);
    expect(play(menu, DOWN, DOWN, DOWN).menu.cursor).toBe(0);
    expect(play(menu, UP, UP).menu.cursor).toBe(1);
  });

  test('a press in the same frame as a move picks what was on screen', () => {
    expect(play(openGameOverMenu(true), { move: 1, confirm: true })).toEqual({
      menu: { cursor: 0, canLoad: true },
      chosen: 'retry',
    });
  });

  test('nothing pressed changes nothing, and makes no sound', () => {
    const menu = openGameOverMenu(true);
    expect(stepGameOverMenu(menu, NONE)).toEqual({ menu, chosen: null, sound: null });
  });

  test('the cursor clicks as it moves, a choice confirms, and one greyed out buzzes', () => {
    const menu = openGameOverMenu(false);
    expect(stepGameOverMenu(menu, DOWN).sound).toBe('cursor');
    expect(stepGameOverMenu(menu, UP).sound).toBe('cursor');
    expect(stepGameOverMenu(menu, CONFIRM).sound).toBe('confirm');
    const onLoad = play(menu, DOWN).menu;
    expect(stepGameOverMenu(onLoad, CONFIRM)).toMatchObject({ chosen: null, sound: 'buzzer' });
    const saved = play(openGameOverMenu(true), DOWN).menu;
    expect(stepGameOverMenu(saved, CONFIRM)).toMatchObject({ chosen: 'load', sound: 'confirm' });
  });
});
