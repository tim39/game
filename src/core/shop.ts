import type { GameDb } from './db';
import type { ItemDef } from './schema';
import {
  addGold,
  addItem,
  itemCount,
  removeGold,
  removeItem,
  type GameState,
  type ItemId,
} from './state';

/**
 * Buying and selling (see Items and economy in docs/DESIGN.md). A shop sells things at their price,
 * as many as the party's gold pays for, up to `MAX_HELD` of each; it buys anything back but key
 * items, for half the price, rounded down. Gear someone is wearing isn't in the inventory, so it
 * can't be sold until it's taken off.
 */

/** The most of any one thing a shop sells the party: it won't sell more than makes this many. */
export const MAX_HELD = 99;

/** What an item costs in a shop, or null for a key item, which shops neither sell nor buy. */
export const priceOf = (item: ItemDef): number | null => (item.kind === 'key' ? null : item.price);

/** What a shop pays for one of an item: half its price, rounded down. Nothing for a key item. */
export const sellPrice = (item: ItemDef): number => Math.floor((priceOf(item) ?? 0) / 2);

/** The most of an item the party could buy now: as many as its gold pays for, up to MAX_HELD. */
export function mostToBuy(state: GameState, item: ItemId, db: GameDb): number {
  const def = own(db.items, item);
  const price = def ? priceOf(def) : null;
  if (price === null) return 0;
  const room = MAX_HELD - itemCount(state, item);
  return Math.max(0, Math.min(Math.floor(state.gold / price), room));
}

/** The most of an item the party could sell: all it carries, unless it's a key item. */
export function mostToSell(state: GameState, item: ItemId, db: GameDb): number {
  const def = own(db.items, item);
  return def && priceOf(def) !== null ? itemCount(state, item) : 0;
}

/** Buys `count` of an item, paying its price for each. Throws if the party can't buy that many. */
export function buy(state: GameState, item: ItemId, count: number, db: GameDb): GameState {
  const def = own(db.items, item);
  const price = def ? priceOf(def) : null;
  if (!def || price === null) throw new RangeError(`${def?.name ?? item} isn't for sale`);
  checkCount('buy', def.name, count, mostToBuy(state, item, db));
  return addItem(removeGold(state, price * count), item, count);
}

/** Sells `count` of an item, for half its price each. Throws if the party can't sell that many. */
export function sell(state: GameState, item: ItemId, count: number, db: GameDb): GameState {
  const def = own(db.items, item);
  if (!def || priceOf(def) === null) throw new RangeError(`${def?.name ?? item} can't be sold`);
  checkCount('sell', def.name, count, mostToSell(state, item, db));
  return addGold(removeItem(state, item, count), sellPrice(def) * count);
}

function checkCount(verb: string, name: string, count: number, most: number): void {
  if (Number.isInteger(count) && count >= 1 && count <= most) return;
  const can = most === 0 ? 'none' : most === 1 ? 'only 1' : `1 to ${most}`;
  throw new RangeError(`Can't ${verb} ${count} ${name}: the party can ${verb} ${can}`);
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
