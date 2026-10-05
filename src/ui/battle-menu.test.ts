import { describe, expect, test } from 'vitest';
import { startBattle, type BattleState } from '../core/battle/battle';
import type { Fighter } from '../core/battle/fighter';
import { DB, TUNING, gameWith } from '../core/battle/fixtures';
import type { Direction } from '../core/direction';
import { Rng } from '../core/rng';
import {
  LIST_ROWS,
  aimedAt,
  helpLine,
  listSpots,
  moveInGrid,
  openBattleMenu,
  previewAction,
  stepBattleMenu,
  type BattleMenu,
  type MenuInput,
  type MenuStep,
} from './battle-menu';

/**
 * A battle on the party's first turn, Rowan's: a preemptive strike puts the party first, and
 * Rowan is the fastest of them. Everyone knows every test skill.
 */
function battleWith(
  enemies: readonly string[],
  change?: (fighter: Fighter) => Fighter,
): BattleState {
  const battle = startBattle(
    { enemies, start: 'preemptive' },
    gameWith(),
    DB,
    TUNING,
    Rng.fromSeed(1),
  );
  return change ? { ...battle, fighters: battle.fighters.map(change) } : battle;
}

const NOTHING: MenuInput = { move: null, confirm: false, cancel: false };
const CONFIRM: MenuInput = { ...NOTHING, confirm: true };
const CANCEL: MenuInput = { ...NOTHING, cancel: true };
const move = (direction: Direction): MenuInput => ({ ...NOTHING, move: direction });

/** Steps the menu through each input in turn, and hands back the last step. */
function press(menu: BattleMenu, battle: BattleState, ...inputs: MenuInput[]): MenuStep {
  let step: MenuStep = { menu, action: null };
  for (const input of inputs) {
    expect(step.action).toBeNull();
    step = stepBattleMenu(step.menu, battle, input);
  }
  return step;
}

/** The label under the cursor on the menu's page. */
function selected(menu: BattleMenu): string | undefined {
  switch (menu.page) {
    case 'commands':
      return menu.commands[menu.cursor.commands]?.label;
    case 'skills':
    case 'items':
      return menu[menu.page][menu.cursor[menu.page]]?.label;
    case 'target':
      return aimedAt(menu).join(', ');
  }
}

describe('opening the menu', () => {
  test('offers the five commands, each skill with its MP cost, and items with their counts', () => {
    const battle = battleWith(['slime', 'wolf']);
    const menu = openBattleMenu(battle);
    expect(menu).toMatchObject({ actor: 'rowan', page: 'commands', aiming: null });
    expect(menu.commands).toEqual([
      { id: 'attack', label: 'Attack', enabled: true },
      { id: 'skill', label: 'Skill', enabled: true },
      { id: 'item', label: 'Item', enabled: true },
      { id: 'guard', label: 'Guard', enabled: true },
      { id: 'flee', label: 'Flee', enabled: true },
    ]);
    expect(menu.skills[0]).toEqual({
      command: { type: 'skill', skill: 'slash' },
      label: 'Slash',
      detail: '3',
      help: 'Slash, for the tests.',
      enabled: true,
    });
    expect(menu.skills).toHaveLength(Object.keys(DB.skills).length);
    // In the order the game lists them; nobody's down, so there's no one to use a Feather on.
    expect(menu.items.map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
      ['Potion', '3', true],
      ['Feather', '1', false],
      ['Fire Bomb', '2', true],
    ]);
  });

  test('greys out what can’t be used: skills without the MP, and fleeing a boss', () => {
    const battle = battleWith(['warden'], (fighter) =>
      fighter.id === 'rowan' ? { ...fighter, mp: 2 } : fighter,
    );
    const menu = openBattleMenu(battle);
    expect(menu.commands.find(({ id }) => id === 'flee')?.enabled).toBe(false);
    const skill = (label: string) => menu.skills.find((entry) => entry.label === label)?.enabled;
    expect(skill('Slash')).toBe(false); // 3 MP
    expect(skill('Tide Edge')).toBe(true); // 2 MP
    expect(skill('Jab')).toBe(true); // 0 MP
  });

  test('greys out Skill for someone who knows none, and Item when the party has none', () => {
    const battle = battleWith(['slime'], (fighter) =>
      fighter.id === 'rowan' ? { ...fighter, skills: [] } : fighter,
    );
    const menu = openBattleMenu({ ...battle, inventory: {} });
    expect(menu.commands.map(({ enabled }) => enabled)).toEqual([true, false, false, true, true]);
  });

  test("is the party's: it can't open on an enemy's turn", () => {
    const battle = startBattle({ enemies: ['wolf'] }, gameWith(), DB, TUNING, Rng.fromSeed(1));
    expect(() => openBattleMenu(battle)).toThrow("It's Wolf's turn, not the party's");
  });
});

describe('the command window', () => {
  const battle = battleWith(['slime']);
  const menu = openBattleMenu(battle);

  test('moves down the commands, across Guard and Flee, and round the ends', () => {
    const at = (...moves: Direction[]) => selected(press(menu, battle, ...moves.map(move)).menu);
    expect(at('down', 'down', 'down')).toBe('Guard');
    expect(at('down', 'down', 'down', 'right')).toBe('Flee');
    expect(at('down', 'down', 'down', 'right', 'right')).toBe('Guard');
    expect(at('down', 'down', 'down', 'right', 'up')).toBe('Item');
    expect(at('up')).toBe('Guard');
    expect(at('down', 'down', 'down', 'down')).toBe('Attack');
    // Left and Right do nothing on a row with one command.
    expect(at('right')).toBe('Attack');
  });

  test('Guard and Flee are taken at once', () => {
    expect(press(menu, battle, move('up'), CONFIRM).action).toEqual({ type: 'guard' });
    expect(press(menu, battle, move('up'), move('right'), CONFIRM).action).toEqual({
      type: 'flee',
    });
  });

  test('a command greyed out can’t be chosen, and Cancel does nothing here', () => {
    const boss = battleWith(['warden']);
    const step = press(openBattleMenu(boss), boss, move('up'), move('right'), CONFIRM, CANCEL);
    expect(step).toMatchObject({ action: null, menu: { page: 'commands' } });
    expect(selected(step.menu)).toBe('Flee');
  });
});

describe('aiming', () => {
  const battle = battleWith(['slime', 'wolf', 'slime']);
  const menu = openBattleMenu(battle);

  test('Attack goes on to the enemies, from the first, round the ends', () => {
    const aiming = press(menu, battle, CONFIRM).menu;
    expect(aiming.page).toBe('target');
    expect(selected(aiming)).toBe('slime-a');
    expect(helpLine(aiming, battle)).toBe('Slime A');
    const along = (...moves: Direction[]) =>
      selected(press(aiming, battle, ...moves.map(move)).menu);
    expect(along('right')).toBe('wolf-a');
    expect(along('down', 'down')).toBe('slime-b');
    expect(along('left')).toBe('slime-b');
    expect(along('up', 'up')).toBe('wolf-a');
  });

  test('Confirm attacks whoever is under the cursor', () => {
    expect(press(menu, battle, CONFIRM, move('right'), CONFIRM).action).toEqual({
      type: 'attack',
      target: 'wolf-a',
    });
  });

  test('Cancel goes back to where the command was chosen', () => {
    const back = press(menu, battle, CONFIRM, move('right'), CANCEL).menu;
    expect(back).toMatchObject({ page: 'commands', aiming: null });
    expect(selected(back)).toBe('Attack');
    const toItems = press(menu, battle, move('down'), move('down'), CONFIRM, CONFIRM, CANCEL);
    expect(toItems.menu.page).toBe('items');
    expect(selected(toItems.menu)).toBe('Potion');
  });

  test('only at the provoker, when provoked', () => {
    const provoked = battleWith(['slime', 'wolf'], (fighter) =>
      fighter.id === 'rowan'
        ? { ...fighter, statuses: { provoke: { turns: 2, from: 'wolf-a' } } }
        : fighter,
    );
    const aiming = press(openBattleMenu(provoked), provoked, CONFIRM, move('right')).menu;
    expect(selected(aiming)).toBe('wolf-a');
  });

  test('an item for an ally starts on the one worst hurt', () => {
    const hurt = battleWith(['slime'], (fighter) =>
      fighter.id === 'liora' ? { ...fighter, hp: 20 } : fighter,
    );
    const step = press(openBattleMenu(hurt), hurt, move('down'), move('down'), CONFIRM, CONFIRM);
    expect(selected(step.menu)).toBe('liora');
    expect(helpLine(step.menu, hurt)).toBe('Liora');
    expect(stepBattleMenu(step.menu, hurt, CONFIRM).action).toEqual({
      type: 'item',
      item: 'potion',
      target: 'liora',
    });
  });

  test('a skill on every enemy shows them all, and is used on no one in particular', () => {
    const skills = press(menu, battle, move('down'), CONFIRM).menu;
    expect(skills.page).toBe('skills');
    // Sweep is the second skill, beside Slash.
    const sweep = press(skills, battle, move('right')).menu;
    expect(selected(sweep)).toBe('Sweep');
    expect(helpLine(sweep, battle)).toBe('Sweep, for the tests.');
    const aiming = press(sweep, battle, CONFIRM).menu;
    expect(aimedAt(aiming)).toEqual(['slime-a', 'wolf-a', 'slime-b']);
    expect(helpLine(aiming, battle)).toBe('All enemies');
    // Moving does nothing: they're all aimed at.
    expect(aimedAt(press(aiming, battle, move('right')).menu)).toEqual(aimedAt(aiming));
    expect(stepBattleMenu(aiming, battle, CONFIRM).action).toEqual({
      type: 'skill',
      skill: 'sweep',
    });
  });

  test('a skill on its user shows them, and one on the party shows everyone standing', () => {
    const skills = press(menu, battle, move('down'), CONFIRM).menu;
    const indexOf = (skill: string) =>
      skills.skills.findIndex(({ command }) => command.type === 'skill' && command.skill === skill);
    const on = (skill: string) =>
      press({ ...skills, cursor: { ...skills.cursor, skills: indexOf(skill) } }, battle, CONFIRM);
    expect(aimedAt(on('focus').menu)).toEqual(['rowan']);
    expect(helpLine(on('focus').menu, battle)).toBe('Rowan');
    expect(aimedAt(on('bulwark').menu)).toEqual(['rowan', 'bram', 'liora']);
    expect(helpLine(on('bulwark').menu, battle)).toBe('The whole party');
  });

  test('a skill greyed out can’t be chosen', () => {
    const poor = battleWith(['slime'], (fighter) =>
      fighter.id === 'rowan' ? { ...fighter, mp: 0 } : fighter,
    );
    const step = press(openBattleMenu(poor), poor, move('down'), CONFIRM, CONFIRM);
    expect(step.menu.page).toBe('skills');
    expect(selected(step.menu)).toBe('Slash');
  });
});

describe('previewAction', () => {
  const battle = battleWith(['slime', 'wolf']);
  const menu = openBattleMenu(battle);
  const preview = (...inputs: MenuInput[]) => {
    const { menu: moved } = press(menu, battle, ...inputs);
    return previewAction(moved, battle);
  };

  test('on the command window: Attack at the first enemy, Guard and Flee, and nothing for lists', () => {
    expect(preview()).toEqual({ type: 'attack', target: 'slime-a' });
    expect(preview(move('down'))).toBeUndefined();
    expect(preview(move('down'), move('down'))).toBeUndefined();
    expect(preview(move('up'))).toEqual({ type: 'guard' });
    expect(preview(move('up'), move('right'))).toEqual({ type: 'flee' });
  });

  test('in a list: what’s under the cursor, aimed where the cursor will start', () => {
    expect(preview(move('down'), CONFIRM)).toEqual({
      type: 'skill',
      skill: 'slash',
      target: 'slime-a',
    });
    // Sweep, beside it, works on every enemy.
    expect(preview(move('down'), CONFIRM, move('right'))).toEqual({
      type: 'skill',
      skill: 'sweep',
    });
    const hurt = battleWith(['slime'], (fighter) =>
      fighter.id === 'bram' ? { ...fighter, hp: 10 } : fighter,
    );
    const items = press(openBattleMenu(hurt), hurt, move('down'), move('down'), CONFIRM).menu;
    expect(previewAction(items, hurt)).toEqual({ type: 'item', item: 'potion', target: 'bram' });
  });

  test('while aiming: the action at whoever is under the cursor', () => {
    expect(preview(CONFIRM, move('right'))).toEqual({ type: 'attack', target: 'wolf-a' });
  });

  test('nothing for what can’t be used now', () => {
    const boss = battleWith(['warden'], (fighter) =>
      fighter.id === 'rowan' ? { ...fighter, mp: 0 } : fighter,
    );
    const moved = press(openBattleMenu(boss), boss, move('up'), move('right')).menu;
    expect(previewAction(moved, boss)).toBeUndefined();
    const skills = press(openBattleMenu(boss), boss, move('down'), CONFIRM).menu;
    expect(previewAction(skills, boss)).toBeUndefined();
  });
});

describe('lists', () => {
  const battle = battleWith(['slime']);
  const skills = press(openBattleMenu(battle), battle, move('down'), CONFIRM).menu;

  test('scroll to keep the cursor in view, a row at a time, and round the ends', () => {
    const down = (times: number) =>
      press(skills, battle, ...Array<MenuInput>(times).fill(move('down'))).menu;
    expect(down(LIST_ROWS - 1).top.skills).toBe(0);
    expect(down(LIST_ROWS).top.skills).toBe(1);
    expect(down(LIST_ROWS).cursor.skills).toBe(LIST_ROWS * 2);
    // Up from the top goes round to the last row.
    const last = press(skills, battle, move('up')).menu;
    const rows = Math.ceil(skills.skills.length / 2);
    expect(Math.floor(last.cursor.skills / 2)).toBe(rows - 1);
    expect(last.top.skills).toBe(rows - LIST_ROWS);
    // And back down to the top.
    expect(press(last, battle, move('down')).menu.top.skills).toBe(0);
  });

  test('Cancel goes back to the command window, on the command it opened from', () => {
    const back = press(skills, battle, move('down'), CANCEL).menu;
    expect(back.page).toBe('commands');
    expect(selected(back)).toBe('Skill');
    // The list remembers where it was.
    expect(press(back, battle, CONFIRM).menu.cursor.skills).toBe(2);
  });
});

describe('moveInGrid', () => {
  test('moves round a list two to a row, onto the nearest entry of a short last row', () => {
    const spots = listSpots(5, 2);
    expect(moveInGrid(spots, 0, 'right')).toBe(1);
    expect(moveInGrid(spots, 1, 'right')).toBe(0);
    expect(moveInGrid(spots, 3, 'down')).toBe(4);
    expect(moveInGrid(spots, 4, 'down')).toBe(0);
    expect(moveInGrid(spots, 1, 'up')).toBe(4);
    expect(moveInGrid(spots, 4, 'right')).toBe(4);
  });

  test('leaves a cursor that is off the grid where it is', () => {
    expect(moveInGrid([], 0, 'down')).toBe(0);
  });
});
