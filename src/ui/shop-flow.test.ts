import { describe, expect, test } from 'vitest';
import { DB as BATTLE_DB, gameWith } from '../core/battle/fixtures';
import type { GameDb } from '../core/db';
import { buy, sell } from '../core/shop';
import { addGold, equip, type GameState } from '../core/state';
import {
  SHOP_ROWS,
  carriedOf,
  entriesOf,
  gearFits,
  itemOf,
  openShop,
  settleShop,
  shownPage,
  stepShop,
  totalOf,
  type ShopAction,
  type ShopInput,
  type ShopMenu,
  type ShopWorld,
} from './shop-flow';

/** The battle engine's test content, with armor and an accessory to sell too. */
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
      stats: { def: 3, spd: -1 },
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

/** Rowan, Bram and Liora, with `gold`, carrying `inventory`, at a shop selling `stock`. */
const world = (
  gold: number,
  inventory: Record<string, number> = {},
  stock = ['potion', 'flame-sword', 'leather-vest', 'swift-ring'],
): ShopWorld => ({
  state: addGold(gameWith(['rowan', 'bram', 'liora'], inventory), gold),
  db: DB,
  stock,
});

const NONE: ShopInput = { move: null, confirm: false, cancel: false };
const UP: ShopInput = { ...NONE, move: 'up' };
const DOWN: ShopInput = { ...NONE, move: 'down' };
const LEFT: ShopInput = { ...NONE, move: 'left' };
const RIGHT: ShopInput = { ...NONE, move: 'right' };
const CONFIRM: ShopInput = { ...NONE, confirm: true };
const CANCEL: ShopInput = { ...NONE, cancel: true };

/** Steps the shop through inputs, and gives back where it ended up and what it asked for last. */
function play(menu: ShopMenu, game: ShopWorld, ...inputs: ShopInput[]) {
  let action: ShopAction | null = null;
  for (const input of inputs) ({ menu, action } = stepShop(menu, input, game));
  return { menu, action };
}

/** Does what the shop asked, as the scene does, and settles the shop with it. */
function apply(menu: ShopMenu, game: ShopWorld, action: ShopAction | null) {
  let state: GameState;
  switch (action?.type) {
    case 'buy':
      state = buy(game.state, action.item, action.count, DB);
      break;
    case 'sell':
      state = sell(game.state, action.item, action.count, DB);
      break;
    case 'leave':
    case undefined:
      throw new Error(`Nothing to do for ${JSON.stringify(action)}`);
  }
  const after = { ...game, state };
  return { menu: settleShop(menu, after), game: after };
}

const lines = (menu: ShopMenu, game: ShopWorld) =>
  entriesOf(shownPage(menu).page, game).map(({ label, detail, enabled }) => [
    label,
    detail,
    enabled,
  ]);

describe('the commands', () => {
  test('are Buy, Sell and Leave; Sell only with something to sell', () => {
    const shop = openShop();
    expect(lines(shop, world(0))).toEqual([
      ['Buy', '', true],
      ['Sell', '', false],
      ['Leave', '', true],
    ]);
    expect(lines(shop, world(0, { potion: 1 }))[1]).toEqual(['Sell', '', true]);
    // Key items can't be sold.
    expect(lines(shop, world(0, { shard: 1 }))[1]).toEqual(['Sell', '', false]);
    // Chosen with nothing to sell, it does nothing.
    const onSell = play(shop, world(0), DOWN).menu;
    expect(play(onSell, world(0), CONFIRM)).toEqual({ menu: onSell, action: null });
  });

  test('Leave, or Cancel, leaves', () => {
    const game = world(0);
    expect(play(openShop(), game, UP, CONFIRM).action).toEqual({ type: 'leave' });
    expect(play(openShop(), game, CANCEL).action).toEqual({ type: 'leave' });
  });
});

describe('Buy', () => {
  test('lists what the shop sells at its price, greyed out where the gold won’t stretch', () => {
    const game = world(60);
    const { menu } = play(openShop(), game, CONFIRM);
    expect(shownPage(menu).page).toEqual({ kind: 'buy' });
    expect(lines(menu, game)).toEqual([
      ['Potion', '10', true],
      ['Flame Sword', '100', false],
      ['Leather Vest', '50', true],
      ['Swift Ring', '200', false],
    ]);
    expect(itemOf(menu, game)).toBe('potion');
    // Something too dear can't be chosen.
    expect(play(menu, game, DOWN, CONFIRM).menu).toEqual(play(menu, game, DOWN).menu);
  });

  test('asks how many, from 1 to as many as there’s gold for, and buys that many', () => {
    let game = world(60);
    let { menu } = play(openShop(), game, CONFIRM, CONFIRM);
    const counted = () => shownPage(menu).page;
    expect(counted()).toEqual({ kind: 'how-many', deal: 'buy', item: 'potion', count: 1 });
    // Right adds one, Up ten, at most 6; Left takes one away, Down ten, to no fewer than 1.
    ({ menu } = play(menu, game, RIGHT, RIGHT));
    expect(counted()).toMatchObject({ count: 3 });
    ({ menu } = play(menu, game, UP));
    expect(counted()).toMatchObject({ count: 6 });
    ({ menu } = play(menu, game, DOWN, LEFT));
    expect(counted()).toMatchObject({ count: 1 });
    ({ menu } = play(menu, game, UP, LEFT));
    expect(counted()).toMatchObject({ count: 5 });
    const page = counted();
    if (page.kind !== 'how-many') throw new Error('Not counting');
    expect(totalOf(page, game)).toBe(50);

    const bought = play(menu, game, CONFIRM);
    expect(bought.action).toEqual({ type: 'buy', item: 'potion', count: 5 });
    ({ menu, game } = apply(bought.menu, game, bought.action));
    expect(game.state).toMatchObject({ gold: 10, inventory: { potion: 5 } });
    // Back on the list, on the Potion, which 10 gold still buys one of.
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'buy' }, cursor: 0 });
    expect(lines(menu, game)[0]).toEqual(['Potion', '10', true]);
    expect(lines(menu, game)[2]).toEqual(['Leather Vest', '50', false]);
  });

  test('Cancel goes back from how many without buying any', () => {
    const game = world(60);
    const { menu, action } = play(openShop(), game, CONFIRM, CONFIRM, RIGHT, CANCEL);
    expect(action).toBeNull();
    expect(shownPage(menu).page).toEqual({ kind: 'buy' });
  });

  test('long lists scroll to keep the cursor in view', () => {
    // Everything but the key item: one more than the list shows.
    const stock = Object.keys(DB.items).filter((id) => id !== 'shard');
    expect(stock).toHaveLength(SHOP_ROWS + 1);
    const game = world(1000, {}, stock);
    let { menu } = play(openShop(), game, CONFIRM);
    ({ menu } = play(menu, game, ...Array.from({ length: SHOP_ROWS }, () => DOWN)));
    expect(shownPage(menu)).toMatchObject({ cursor: SHOP_ROWS, top: 1 });
    ({ menu } = play(menu, game, DOWN));
    expect(shownPage(menu)).toMatchObject({ cursor: 0, top: 0 });
    ({ menu } = play(menu, game, UP));
    expect(shownPage(menu)).toMatchObject({ cursor: SHOP_ROWS, top: 1 });
  });
});

describe('Sell', () => {
  test('lists what the party carries for half its price, but not key items or gear worn', () => {
    let game = world(0, { potion: 2, 'flame-sword': 1, shard: 1, 'swift-ring': 1 });
    game = { ...game, state: equip(game.state, 'rowan', 'flame-sword', DB) };
    const { menu } = play(openShop(), game, DOWN, CONFIRM);
    expect(shownPage(menu).page).toEqual({ kind: 'sell' });
    expect(lines(menu, game)).toEqual([
      ['Potion', '5', true],
      ['Swift Ring', '100', true],
    ]);
  });

  test('sells as many as asked, up to all of them, and with nothing left, goes back', () => {
    let game = world(0, { potion: 2, 'swift-ring': 1 });
    let { menu, action } = play(openShop(), game, DOWN, CONFIRM, CONFIRM, RIGHT, RIGHT, CONFIRM);
    expect(action).toEqual({ type: 'sell', item: 'potion', count: 2 });
    ({ menu, game } = apply(menu, game, action));
    expect(game.state).toMatchObject({ gold: 10, inventory: { 'swift-ring': 1 } });
    expect(lines(menu, game)).toEqual([['Swift Ring', '100', true]]);

    ({ menu, action } = play(menu, game, CONFIRM, CONFIRM));
    ({ menu, game } = apply(menu, game, action));
    expect(game.state).toMatchObject({ gold: 110, inventory: {} });
    expect(shownPage(menu)).toMatchObject({ page: { kind: 'commands' }, cursor: 1 });
    expect(lines(menu, game)[1]).toEqual(['Sell', '', false]);
  });
});

test('gear shows who could wear it, and how it would change their stats', () => {
  const game = world(0);
  // Rowan's the only one with a sword.
  expect(gearFits(game, 'flame-sword')).toEqual([
    { member: 'rowan', fits: true, wearing: false, changes: [{ stat: 'atk', by: 5 }] },
    { member: 'bram', fits: false, wearing: false, changes: [] },
    { member: 'liora', fits: false, wearing: false, changes: [] },
  ]);
  // Anyone can wear light armor: it's more DEF and less SPD, over nothing.
  expect(gearFits(game, 'leather-vest')?.[1]).toEqual({
    member: 'bram',
    fits: true,
    wearing: false,
    changes: [
      { stat: 'def', by: 3 },
      { stat: 'spd', by: -1 },
    ],
  });
  // Wearing one already, another changes nothing.
  const armed = world(0, { 'flame-sword': 1 });
  const worn = { ...armed, state: equip(armed.state, 'rowan', 'flame-sword', DB) };
  expect(gearFits(worn, 'flame-sword')?.[0]).toEqual({
    member: 'rowan',
    fits: true,
    wearing: true,
    changes: [],
  });
  expect(gearFits(game, 'potion')).toBeNull();
});

test('the party’s count of an item counts what it carries and what it wears', () => {
  let game = world(0, { 'swift-ring': 3 });
  game = {
    ...game,
    state: equip(equip(game.state, 'rowan', 'swift-ring', DB), 'bram', 'swift-ring', DB),
  };
  expect(carriedOf(game, 'swift-ring')).toEqual({ held: 1, worn: 2 });
  expect(carriedOf(game, 'potion')).toEqual({ held: 0, worn: 0 });
});

describe('sounds', () => {
  const sound = (menu: ShopMenu, game: ShopWorld, input: ShopInput) =>
    stepShop(menu, input, game).sound;

  test('the cursor clicks as it moves, and what can be chosen confirms', () => {
    const game = world(60, { potion: 1 });
    const shop = openShop();
    expect(sound(shop, game, DOWN)).toBe('cursor');
    expect(sound(shop, game, CONFIRM)).toBe('confirm');
    const buying = play(shop, game, CONFIRM).menu;
    expect(sound(buying, game, DOWN)).toBe('cursor');
    expect(sound(buying, game, LEFT)).toBeNull();
    expect(sound(buying, game, CONFIRM)).toBe('confirm');
    const counting = play(buying, game, CONFIRM).menu;
    expect(sound(counting, game, RIGHT)).toBe('cursor');
    // Already at 1, the count stays, quietly.
    expect(sound(counting, game, LEFT)).toBeNull();
    expect(stepShop(counting, CONFIRM, game)).toMatchObject({
      action: { type: 'buy', item: 'potion', count: 1 },
      sound: 'confirm',
    });
    expect(sound(counting, game, CANCEL)).toBe('cancel');
    expect(sound(counting, game, NONE)).toBeNull();
  });

  test('what can’t be chosen buzzes', () => {
    const game = world(60);
    const onSell = play(openShop(), game, DOWN).menu;
    expect(sound(onSell, game, CONFIRM)).toBe('buzzer');
    // The Flame Sword is too dear.
    const onSword = play(openShop(), game, CONFIRM, DOWN).menu;
    expect(sound(onSword, game, CONFIRM)).toBe('buzzer');
  });

  test('a list of one has nowhere for the cursor to go', () => {
    const game = world(60, {}, ['potion']);
    const buying = play(openShop(), game, CONFIRM).menu;
    expect(sound(buying, game, DOWN)).toBeNull();
  });

  test('Leave confirms and Cancel cancels, either way leaving', () => {
    const game = world(0);
    expect(stepShop(openShop(), CANCEL, game)).toMatchObject({
      action: { type: 'leave' },
      sound: 'cancel',
    });
    const onLeave = play(openShop(), game, UP).menu;
    expect(stepShop(onLeave, CONFIRM, game)).toMatchObject({
      action: { type: 'leave' },
      sound: 'confirm',
    });
  });
});
