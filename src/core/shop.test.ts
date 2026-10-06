import { expect, test } from 'vitest';
import { DB, gameWith } from './battle/fixtures';
import type { GameDb } from './db';
import type { ItemDef } from './schema';
import { MAX_HELD, buy, mostToBuy, mostToSell, priceOf, sell, sellPrice } from './shop';
import { addGold, equip, type GameState } from './state';

/** The test content, with something at an odd price. */
const SHOP_DB: GameDb = {
  ...DB,
  items: {
    ...DB.items,
    plum: {
      name: 'Plum',
      description: 'Sweet.',
      kind: 'consumable',
      price: 25,
      target: 'one-ally',
      effects: [{ type: 'restore', hp: 5 }],
    },
  },
};

const item = (id: string): ItemDef => {
  const def = SHOP_DB.items[id];
  if (!def) throw new Error(`The test content has no ${id}`);
  return def;
};

/** Rowan, with `gold` and whatever he carries. */
const party = (gold: number, inventory: Record<string, number> = {}): GameState =>
  addGold(gameWith(['rowan'], inventory), gold);

test('things cost their price and sell for half, rounded down; key items do neither', () => {
  expect([priceOf(item('potion')), sellPrice(item('potion'))]).toEqual([10, 5]);
  expect([priceOf(item('flame-sword')), sellPrice(item('flame-sword'))]).toEqual([100, 50]);
  expect([priceOf(item('plum')), sellPrice(item('plum'))]).toEqual([25, 12]);
  expect([priceOf(item('shard')), sellPrice(item('shard'))]).toEqual([null, 0]);
});

test('the party can buy as many as its gold pays for, up to 99 of a thing', () => {
  expect(mostToBuy(party(35), 'potion', SHOP_DB)).toBe(3);
  expect(mostToBuy(party(9), 'potion', SHOP_DB)).toBe(0);
  expect(mostToBuy(party(10_000), 'potion', SHOP_DB)).toBe(MAX_HELD);
  expect(mostToBuy(party(10_000, { potion: 97 }), 'potion', SHOP_DB)).toBe(2);
  expect(mostToBuy(party(10_000, { potion: 120 }), 'potion', SHOP_DB)).toBe(0);
  expect(mostToBuy(party(10_000), 'shard', SHOP_DB)).toBe(0);
  expect(mostToBuy(party(10_000), 'nothing', SHOP_DB)).toBe(0);
});

test('buying takes the gold and gives the things', () => {
  const bought = buy(party(60, { potion: 1 }), 'plum', 2, SHOP_DB);
  expect(bought.gold).toBe(10);
  expect(bought.inventory).toEqual({ potion: 1, plum: 2 });
  expect(buy(bought, 'potion', 1, SHOP_DB)).toMatchObject({ gold: 0, inventory: { potion: 2 } });
});

test('buying more than the party can, or none, or what no shop sells, is refused', () => {
  const state = party(35);
  expect(() => buy(state, 'potion', 4, SHOP_DB)).toThrow(
    "Can't buy 4 Potion: the party can buy 1 to 3",
  );
  expect(() => buy(state, 'potion', 0, SHOP_DB)).toThrow(RangeError);
  expect(() => buy(state, 'potion', 1.5, SHOP_DB)).toThrow(RangeError);
  expect(() => buy(party(0), 'potion', 1, SHOP_DB)).toThrow('the party can buy none');
  expect(() => buy(state, 'shard', 1, SHOP_DB)).toThrow("Shard isn't for sale");
});

test('selling gives half the price for each, and takes them', () => {
  const sold = sell(party(0, { plum: 3, potion: 1 }), 'plum', 2, SHOP_DB);
  expect(sold).toMatchObject({ gold: 24, inventory: { plum: 1, potion: 1 } });
  // Selling the last of something leaves none of it.
  expect(sell(sold, 'plum', 1, SHOP_DB).inventory).toEqual({ potion: 1 });
});

test('key items, gear being worn and more than the party has can’t be sold', () => {
  const state = party(0, { shard: 1, 'flame-sword': 1, potion: 2 });
  expect(mostToSell(state, 'potion', SHOP_DB)).toBe(2);
  expect(mostToSell(state, 'shard', SHOP_DB)).toBe(0);
  expect(() => sell(state, 'shard', 1, SHOP_DB)).toThrow("Shard can't be sold");
  expect(() => sell(state, 'potion', 3, SHOP_DB)).toThrow(
    "Can't sell 3 Potion: the party can sell 1 to 2",
  );
  const worn = equip(state, 'rowan', 'flame-sword', SHOP_DB);
  expect(mostToSell(worn, 'flame-sword', SHOP_DB)).toBe(0);
  expect(() => sell(worn, 'flame-sword', 1, SHOP_DB)).toThrow('the party can sell none');
});
