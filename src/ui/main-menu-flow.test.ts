import { describe, expect, test } from 'vitest';
import { DB as BATTLE_DB, TUNING, gameWith } from '../core/battle/fixtures';
import type { GameDb } from '../core/db';
import { castSkill, useItem } from '../core/field-use';
import type { ExpCurve } from '../core/levels';
import { memberVitals } from '../core/party';
import { equip, setLevel, setVitals, unequip, type GameState, type Vitals } from '../core/state';
import { MENU_TEXT } from '../data/ui-text';
import {
  LIST_ROWS,
  aimedAt,
  entriesOf,
  gearComparison,
  openMainMenu,
  partySummary,
  settleMainMenu,
  shownPage,
  statusSkills,
  stepMainMenu,
  type MainMenu,
  type MainMenuInput,
  type MenuAction,
  type MenuWorld,
} from './main-menu-flow';

/** The battle engine's test content, with armor and an accessory to wear too. */
const DB: GameDb = {
  ...BATTLE_DB,
  items: {
    ...BATTLE_DB.items,
    'leather-vest': {
      name: 'Leather Vest',
      description: 'Light armor.',
      kind: 'armor',
      armor: 'light',
      price: 50,
      stats: { def: 3 },
    },
    'swift-ring': {
      name: 'Swift Ring',
      description: 'An accessory.',
      kind: 'accessory',
      price: 200,
      stats: { spd: 2 },
    },
  },
};

const CURVE: ExpCurve = { maxLevel: 5, scale: 10, power: 2 };

/** Rowan, Bram and Liora (100, 150 and 80 HP), carrying a bit of everything. */
const world = (state?: GameState): MenuWorld => ({
  state:
    state ??
    gameWith(['rowan', 'bram', 'liora'], {
      potion: 2,
      feather: 1,
      'fire-bomb': 1,
      'flame-sword': 1,
      'leather-vest': 1,
      shard: 1,
    }),
  db: DB,
  curve: CURVE,
});

function hurt(game: MenuWorld, id: string, set: Partial<Vitals>): MenuWorld {
  const { now, most } = memberVitals(game.state, id, DB);
  return { ...game, state: setVitals(game.state, id, { ...now, ...set }, most) };
}

const NONE: MainMenuInput = { move: null, confirm: false, cancel: false, menu: false };
const UP: MainMenuInput = { ...NONE, move: 'up' };
const DOWN: MainMenuInput = { ...NONE, move: 'down' };
const LEFT: MainMenuInput = { ...NONE, move: 'left' };
const RIGHT: MainMenuInput = { ...NONE, move: 'right' };
const CONFIRM: MainMenuInput = { ...NONE, confirm: true };
const CANCEL: MainMenuInput = { ...NONE, cancel: true };
const MENU: MainMenuInput = { ...NONE, menu: true };

/** Steps the menu through inputs, and gives back where it ended up and what it asked for last. */
function play(menu: MainMenu, game: MenuWorld, ...inputs: MainMenuInput[]) {
  let action: MenuAction | null = null;
  for (const input of inputs) ({ menu, action } = stepMainMenu(menu, input, game));
  return { menu, action };
}

/** Does what the menu asked, as the scene does, and settles the menu with it. */
function apply(menu: MainMenu, game: MenuWorld, action: MenuAction | null) {
  let { state } = game;
  switch (action?.type) {
    case 'use':
      state = useItem(state, action.item, action.on, DB);
      break;
    case 'cast':
      state = castSkill(state, action.member, action.skill, action.on, DB, TUNING);
      break;
    case 'equip':
      state = equip(state, action.member, action.item, DB);
      break;
    case 'unequip':
      state = unequip(state, action.member, action.slot);
      break;
    case 'options':
    case 'save':
    case 'close':
    case undefined:
      throw new Error(`Nothing to do for ${JSON.stringify(action)}`);
  }
  const after = { ...game, state };
  return { menu: settleMainMenu(menu, after), game: after };
}

const lines = (menu: MainMenu, game: MenuWorld) =>
  entriesOf(shownPage(menu).page, game).map(({ label, detail, enabled }) => [
    label,
    detail,
    enabled,
  ]);

describe('the commands', () => {
  test('are Items, Skills, Equip, Status, Options and Save', () => {
    const menu = openMainMenu();
    expect(lines(menu, world())).toEqual([
      ['Items', '', true],
      ['Skills', '', true],
      ['Equip', '', true],
      ['Status', '', true],
      ['Options', '', true],
      ['Save', '', true],
    ]);
    // Options and Save ask the scene to open their screens.
    expect(play(menu, world(), UP, UP, CONFIRM).action).toEqual({ type: 'options' });
    expect(play(menu, world(), UP, CONFIRM).action).toEqual({ type: 'save' });
  });

  test('close the menu with Cancel; Menu closes it from any page', () => {
    expect(play(openMainMenu(), world(), CANCEL).action).toEqual({ type: 'close' });
    const deep = play(openMainMenu(), world(), DOWN, CONFIRM, CONFIRM).menu;
    expect(shownPage(deep).page).toEqual({ kind: 'skills', member: 'rowan' });
    expect(play(deep, world(), MENU).action).toEqual({ type: 'close' });
    // Cancel goes back a page at a time, to the cursor as it was.
    const back = play(deep, world(), CANCEL, CANCEL).menu;
    expect(back.pages).toEqual([{ page: { kind: 'commands' }, cursor: 1, top: 0 }]);
  });
});

describe('Items', () => {
  test('lists what the party carries, greying out what would do nothing for anyone now', () => {
    const game = world();
    const menu = play(openMainMenu(), game, CONFIRM).menu;
    expect(shownPage(menu).page).toEqual({ kind: 'items' });
    expect(lines(menu, game)).toEqual([
      ['Potion', '2', false],
      ['Feather', '1', false],
      ['Fire Bomb', '1', false],
      ['Flame Sword', '1', false],
      ['Shard', '1', false],
      ['Leather Vest', '1', false],
    ]);
    const hurtRowan = hurt(game, 'rowan', { hp: 30 });
    expect(lines(menu, hurtRowan)[0]).toEqual(['Potion', '2', true]);
  });

  test('go on whoever they’d help, again and again, until there’s nobody or none left', () => {
    let game = hurt(world(), 'rowan', { hp: 30 });
    let { menu } = play(openMainMenu(), game, CONFIRM, CONFIRM);
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'item-on', item: 'potion' }, cursor: 0 });
    expect(lines(menu, game).map(([, , enabled]) => enabled)).toEqual([true, false, false]);
    expect(aimedAt(menu, game)).toEqual(['rowan']);
    // Bram and Liora are full: the cursor goes to them, but Confirm does nothing.
    expect(play(menu, game, DOWN, CONFIRM).action).toBeNull();

    const used = play(menu, game, CONFIRM);
    expect(used.action).toEqual({ type: 'use', item: 'potion', on: ['rowan'] });
    ({ menu, game } = apply(used.menu, game, used.action));
    // 80 of 100 HP: still someone to help, and a Potion left.
    expect(shownPage(menu).page).toEqual({ kind: 'item-on', item: 'potion' });
    ({ menu, game } = apply(menu, game, play(menu, game, CONFIRM).action));
    // Full, and the Potions are gone: back to the list, without them.
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'items' }, cursor: 0 });
    expect(lines(menu, game)[0]).toEqual(['Feather', '1', false]);
  });

  test('start aimed at the first who can use it, and run out back to the list', () => {
    let game = hurt(world(), 'bram', { hp: 0 });
    let { menu } = play(openMainMenu(), game, CONFIRM, DOWN, CONFIRM);
    expect(shownPage(menu)).toMatchObject({
      page: { kind: 'item-on', item: 'feather' },
      cursor: 1,
    });
    expect(aimedAt(menu, game)).toEqual(['bram']);
    ({ menu, game } = apply(menu, game, play(menu, game, CONFIRM).action));
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'items' } });
    expect(lines(menu, game).map(([label]) => label)).not.toContain('Feather');
  });
});

describe('Skills', () => {
  test('ask whose, list theirs with MP costs, and heal whoever needs it', () => {
    let game = hurt(world(), 'bram', { hp: 50 });
    let { menu } = play(openMainMenu(), game, DOWN, CONFIRM);
    expect(shownPage(menu).page).toEqual({ kind: 'whose', command: 'skills' });
    expect(aimedAt(menu, game)).toEqual(['rowan']);
    ({ menu } = play(menu, game, UP, CONFIRM));
    expect(shownPage(menu).page).toEqual({ kind: 'skills', member: 'liora' });
    const skills = lines(menu, game);
    expect(skills.find(([label]) => label === 'Slash')).toEqual(['Slash', '3', false]);
    expect(skills.find(([label]) => label === 'Heal')).toEqual(['Heal', '4', true]);

    const heal = skills.findIndex(([label]) => label === 'Heal');
    ({ menu } = play(menu, game, ...Array.from({ length: heal }, () => DOWN), CONFIRM));
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'skill-on', skill: 'heal' }, cursor: 1 });
    const { action } = play(menu, game, CONFIRM);
    expect(action).toEqual({ type: 'cast', member: 'liora', skill: 'heal', on: ['bram'] });
    ({ game } = apply(menu, game, action));
    // 50 + 40, by Liora's MAG of 20, and 4 MP less.
    expect(partySummary(game).map(({ hp, mp }) => [hp, mp])).toEqual([
      [100, 20],
      [90, 10],
      [80, 46],
    ]);
  });

  test('aimed at everyone, take them all at once, with no one to pick', () => {
    const game = hurt(hurt(world(), 'rowan', { hp: 50 }), 'liora', { hp: 40 });
    const page = { kind: 'skill-on', member: 'liora', skill: 'mend-all' } as const;
    const menu: MainMenu = { pages: [{ page, cursor: 0, top: 0 }] };
    expect(aimedAt(menu, game)).toEqual(['rowan', 'liora']);
    expect(play(menu, game, DOWN).menu).toBe(menu);
    const { action } = play(menu, game, CONFIRM);
    expect(action).toEqual({
      type: 'cast',
      member: 'liora',
      skill: 'mend-all',
      on: ['rowan', 'liora'],
    });
    expect(partySummary(apply(menu, game, action).game).map(({ hp }) => hp)).toEqual([70, 150, 60]);
  });

  test('Left and Right go round the party', () => {
    const game = world();
    const { menu } = play(openMainMenu(), game, DOWN, CONFIRM, CONFIRM);
    const whose = (inputs: MainMenuInput[]) => shownPage(play(menu, game, ...inputs).menu).page;
    expect(whose([RIGHT])).toEqual({ kind: 'skills', member: 'bram' });
    expect(whose([RIGHT, RIGHT, RIGHT])).toEqual({ kind: 'skills', member: 'rowan' });
    expect(whose([LEFT])).toEqual({ kind: 'skills', member: 'liora' });
  });
});

describe('Equip', () => {
  test('shows each slot, and the gear that fits it, with the stats it would make', () => {
    let game = world();
    let { menu } = play(openMainMenu(), game, DOWN, DOWN, CONFIRM, CONFIRM);
    expect(shownPage(menu).page).toEqual({ kind: 'equip', member: 'rowan' });
    expect(lines(menu, game)).toEqual([
      ['Weapon', '-', true],
      ['Armor', '-', true],
      ['Accessory', '-', true],
    ]);
    ({ menu } = play(menu, game, CONFIRM));
    expect(shownPage(menu).page).toEqual({ kind: 'gear', member: 'rowan', slot: 'weapon' });
    // Only the Flame Sword fits; there's nothing on to remove.
    expect(lines(menu, game)).toEqual([
      ['Flame Sword', '1', true],
      ['Remove', '', false],
    ]);
    expect(gearComparison(menu, game)).toMatchObject({ now: { atk: 20 }, after: { atk: 25 } });

    const { menu: back, action } = play(menu, game, CONFIRM);
    expect(action).toEqual({ type: 'equip', member: 'rowan', item: 'flame-sword' });
    ({ menu, game } = apply(back, game, action));
    expect(shownPage(menu).page).toEqual({ kind: 'equip', member: 'rowan' });
    expect(lines(menu, game)[0]).toEqual(['Weapon', 'Flame Sword', true]);

    // Now it can come off, which the comparison shows too.
    ({ menu } = play(menu, game, CONFIRM));
    expect(lines(menu, game)).toEqual([['Remove', '', true]]);
    expect(gearComparison(menu, game)).toMatchObject({ now: { atk: 25 }, after: { atk: 20 } });
    const taken = play(menu, game, CONFIRM);
    expect(taken.action).toEqual({ type: 'unequip', member: 'rowan', slot: 'weapon' });
  });

  test('only offers what the member can wear', () => {
    const game = world();
    // Bram fights with an axe: the Flame Sword isn't for him, though the vest is.
    const { menu } = play(openMainMenu(), game, DOWN, DOWN, CONFIRM, DOWN, CONFIRM);
    expect(shownPage(menu).page).toEqual({ kind: 'equip', member: 'bram' });
    expect(lines(play(menu, game, CONFIRM).menu, game)).toEqual([['Remove', '', false]]);
    expect(lines(play(menu, game, DOWN, CONFIRM).menu, game)).toEqual([
      ['Leather Vest', '1', true],
      ['Remove', '', false],
    ]);
  });
});

test('Status shows one member at a time, going round the party', () => {
  const game = world();
  const { menu } = play(openMainMenu(), game, DOWN, DOWN, DOWN, CONFIRM, CONFIRM);
  expect(shownPage(menu).page).toEqual({ kind: 'status', member: 'rowan' });
  expect(lines(menu, game)).toEqual([]);
  expect(play(menu, game, CONFIRM).action).toBeNull();
  expect(shownPage(play(menu, game, LEFT).menu).page).toEqual({
    kind: 'status',
    member: 'liora',
  });
});

test('Status lists the skills a member knows, and how many more there are than it has lines for', () => {
  const game = world();
  const all = statusSkills(game, 'rowan', Infinity);
  expect(all.length).toBeGreaterThan(4);
  expect(statusSkills(game, 'rowan', all.length)).toEqual(all);
  expect(statusSkills(game, 'rowan', 4)).toEqual([
    ...all.slice(0, 3),
    MENU_TEXT.moreSkills(all.length - 3),
  ]);
  const rowan = DB.characters.rowan;
  if (!rowan) throw new Error('The test content has no Rowan');
  const unskilled = { ...rowan, skills: [] };
  const db = { ...DB, characters: { ...DB.characters, rowan: unskilled } };
  expect(statusSkills({ ...game, db }, 'rowan', 4)).toEqual([MENU_TEXT.noSkills]);
});

test('long lists scroll to keep the cursor in view', () => {
  // Everyone in the tests knows every test skill: more than the 9 lines the list shows.
  const game = world();
  let { menu } = play(openMainMenu(), game, DOWN, CONFIRM, CONFIRM);
  const count = lines(menu, game).length;
  expect(count).toBeGreaterThan(LIST_ROWS.skills);
  ({ menu } = play(menu, game, ...Array.from({ length: 9 }, () => DOWN)));
  expect(shownPage(menu)).toMatchObject({ cursor: 9, top: 1 });
  ({ menu } = play(menu, game, ...Array.from({ length: count - 9 }, () => DOWN)));
  expect(shownPage(menu)).toMatchObject({ cursor: 0, top: 0 });
  ({ menu } = play(menu, game, UP));
  expect(shownPage(menu)).toMatchObject({ cursor: count - 1, top: count - 9 });
});

test('the party summary has each member’s level, HP, MP and EXP to their next level', () => {
  let game = hurt(world(), 'bram', { hp: 12, mp: 3 });
  expect(partySummary(game)).toEqual([
    { id: 'rowan', name: 'Rowan', level: 1, hp: 100, maxHp: 100, mp: 20, maxMp: 20, next: 10 },
    { id: 'bram', name: 'Bram', level: 1, hp: 12, maxHp: 150, mp: 3, maxMp: 10, next: 10 },
    { id: 'liora', name: 'Liora', level: 1, hp: 80, maxHp: 80, mp: 50, maxMp: 50, next: 10 },
  ]);
  game = { ...game, state: setLevel(game.state, 'rowan', 5, CURVE) };
  expect(partySummary(game)[0]).toMatchObject({ level: 5, next: null });
});

describe('sounds', () => {
  const sound = (menu: MainMenu, game: MenuWorld, input: MainMenuInput) =>
    stepMainMenu(menu, input, game).sound;

  test('the cursor clicks, choosing confirms, and Cancel and Menu go back', () => {
    const game = world();
    const menu = openMainMenu();
    expect(sound(menu, game, DOWN)).toBe('cursor');
    expect(sound(menu, game, UP)).toBe('cursor');
    expect(sound(menu, game, CONFIRM)).toBe('confirm');
    expect(sound(menu, game, CANCEL)).toBe('cancel');
    expect(sound(menu, game, MENU)).toBe('cancel');
    expect(sound(menu, game, NONE)).toBeNull();
    // Save and Options open their screens.
    expect(sound(play(menu, game, UP).menu, game, CONFIRM)).toBe('confirm');
    expect(sound(play(menu, game, UP, UP).menu, game, CONFIRM)).toBe('confirm');
    const skills = play(menu, game, DOWN, CONFIRM, CONFIRM).menu;
    expect(sound(skills, game, RIGHT)).toBe('cursor');
    expect(sound(skills, game, CANCEL)).toBe('cancel');
    expect(sound(skills, game, MENU)).toBe('cancel');
  });

  test('using something, or changing gear, confirms', () => {
    const game = hurt(world(), 'rowan', { hp: 30 });
    const potion = play(openMainMenu(), game, CONFIRM, CONFIRM).menu;
    expect(stepMainMenu(potion, CONFIRM, game)).toMatchObject({
      action: { type: 'use' },
      sound: 'confirm',
    });
    const weapons = play(openMainMenu(), game, DOWN, DOWN, CONFIRM, CONFIRM, CONFIRM).menu;
    expect(stepMainMenu(weapons, CONFIRM, game)).toMatchObject({
      action: { type: 'equip' },
      sound: 'confirm',
    });
  });

  test('choosing what does nothing for anyone now buzzes', () => {
    const game = world();
    // Everyone is full, so a Potion would help nobody.
    const items = play(openMainMenu(), game, CONFIRM).menu;
    expect(sound(items, game, CONFIRM)).toBe('buzzer');
    const hurtRowan = hurt(game, 'rowan', { hp: 30 });
    expect(sound(items, hurtRowan, CONFIRM)).toBe('confirm');
    // Bram is full.
    const onBram = play(items, hurtRowan, CONFIRM, DOWN).menu;
    expect(sound(onBram, hurtRowan, CONFIRM)).toBe('buzzer');
    // Rowan wears no weapon to remove.
    const remove = play(openMainMenu(), game, DOWN, DOWN, CONFIRM, CONFIRM, CONFIRM, DOWN).menu;
    expect(lines(remove, game)[1]).toEqual(['Remove', '', false]);
    expect(sound(remove, game, CONFIRM)).toBe('buzzer');
  });

  test('with nowhere to go, the cursor stays quiet', () => {
    // Aimed at everyone it helps, there's no one to choose between.
    const hurtRowan = hurt(world(), 'rowan', { hp: 50 });
    const page = { kind: 'skill-on', member: 'liora', skill: 'mend-all' } as const;
    const all: MainMenu = { pages: [{ page, cursor: 0, top: 0 }] };
    expect(sound(all, hurtRowan, DOWN)).toBeNull();
    // A party of one has no one else to go round to, and Status nothing to choose.
    const alone = world(gameWith(['rowan'], { potion: 1 }));
    const status = play(openMainMenu(), alone, DOWN, DOWN, DOWN, CONFIRM, CONFIRM).menu;
    expect(shownPage(status).page).toEqual({ kind: 'status', member: 'rowan' });
    expect(sound(status, alone, RIGHT)).toBeNull();
    expect(sound(status, alone, DOWN)).toBeNull();
    expect(sound(status, alone, CONFIRM)).toBeNull();
    const whose = play(openMainMenu(), alone, DOWN, CONFIRM).menu;
    expect(sound(whose, alone, DOWN)).toBeNull();
  });
});
