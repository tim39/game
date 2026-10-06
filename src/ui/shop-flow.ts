import type { GameDb } from '../core/db';
import type { Direction } from '../core/direction';
import { canEquip, slotOf } from '../core/equipment';
import { memberStats } from '../core/party';
import { mostToBuy, mostToSell, priceOf, sellPrice } from '../core/shop';
import {
  addItem,
  equip,
  itemCount,
  type CharacterId,
  type GameState,
  type ItemId,
} from '../core/state';
import { STATS, type Stat } from '../core/stats';
import { SHOP_TEXT } from '../data/ui-text';
import type { MenuSound } from './menu-sound';

/**
 * A shop without the drawing (see Screens in docs/DESIGN.md): Buy, Sell and Leave. Buy lists what
 * the shop sells, at its price; Sell, what the party carries that a shop buys, for half. Choosing
 * one asks how many, and Confirm buys or sells that many. `stepShop` hands back what to do, for the
 * scene to do to the game with src/core/shop.ts, and `settleShop` then brings the pages up to date
 * with it.
 */

export const SHOP_COMMANDS = ['buy', 'sell', 'leave'] as const;
export type ShopCommand = (typeof SHOP_COMMANDS)[number];

/** How many lines a list shows at once; longer ones scroll. */
export const SHOP_ROWS = 8;

/** How many Up and Down change the count by; Left and Right change it by 1. */
export const COUNT_STEP = 10;

/** A page of the shop. */
export type ShopPage =
  | { readonly kind: 'commands' }
  | { readonly kind: 'buy' }
  | { readonly kind: 'sell' }
  /** How many of an item to buy or sell. */
  | {
      readonly kind: 'how-many';
      readonly deal: 'buy' | 'sell';
      readonly item: ItemId;
      readonly count: number;
    };

/** A page as it's open: the cursor on it, and its first line in view. */
export interface OpenPage {
  readonly page: ShopPage;
  readonly cursor: number;
  readonly top: number;
}

/** The pages open: the commands underneath, and the one shown last. */
export interface ShopMenu {
  readonly pages: readonly OpenPage[];
}

/** What the shop works with: the game being played, the content, and what the shop sells. */
export interface ShopWorld {
  readonly state: GameState;
  readonly db: GameDb;
  readonly stock: readonly ItemId[];
}

/** A line on a page: what it says, a price at its right, and whether it can be chosen. */
export interface ShopEntry {
  readonly label: string;
  readonly detail: string;
  readonly enabled: boolean;
  /** The item on the line, on Buy and Sell. */
  readonly item: ItemId | null;
}

/** One frame's input: Menu goes back, as Cancel does. */
export interface ShopInput {
  readonly move: Direction | null;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

/** What the scene should do: buy or sell some of an item, or leave the shop. */
export type ShopAction =
  | { readonly type: 'buy'; readonly item: ItemId; readonly count: number }
  | { readonly type: 'sell'; readonly item: ItemId; readonly count: number }
  | { readonly type: 'leave' };

/** What a press did: the shop as it now is, what the scene should do, and the sound it made. */
export interface ShopStep {
  readonly menu: ShopMenu;
  readonly action: ShopAction | null;
  readonly sound: MenuSound | null;
}

const COMMANDS: OpenPage = { page: { kind: 'commands' }, cursor: 0, top: 0 };

/** Opens the shop on its commands, with the cursor on Buy. */
export const openShop = (): ShopMenu => ({ pages: [COMMANDS] });

/** The page showing: the last one open. */
export const shownPage = (menu: ShopMenu): OpenPage => menu.pages.at(-1) ?? COMMANDS;

/** The lines on a page, as the game stands. How many has none. */
export function entriesOf(page: ShopPage, world: ShopWorld): ShopEntry[] {
  const { state, db } = world;
  switch (page.kind) {
    case 'commands':
      return SHOP_COMMANDS.map((command) => ({
        label: SHOP_TEXT.commands[command],
        detail: '',
        enabled:
          command === 'leave' ||
          (command === 'buy' ? world.stock.length > 0 : sellable(world).length > 0),
        item: null,
      }));
    case 'buy':
      return world.stock.map((id) => {
        const item = own(db.items, id);
        return {
          label: item?.name ?? id,
          detail: String((item ? priceOf(item) : null) ?? ''),
          enabled: mostToBuy(state, id, db) > 0,
          item: id,
        };
      });
    case 'sell':
      return sellable(world).map(([id, item]) => ({
        label: item.name,
        detail: String(sellPrice(item)),
        enabled: true,
        item: id,
      }));
    case 'how-many':
      return [];
  }
}

/**
 * What a press does on the page showing: moves the cursor (round from the end to the start),
 * changes how many, opens a page, goes back, or asks the scene to buy, sell or leave; and the
 * sound that makes. Confirm on something that can't be chosen buzzes.
 */
export function stepShop(menu: ShopMenu, input: ShopInput, world: ShopWorld): ShopStep {
  const still = { menu, action: null, sound: null };
  const open = shownPage(menu);
  const { page } = open;
  if (input.confirm) return confirm(menu, open, world);
  if (input.cancel) {
    if (menu.pages.length === 1) return { menu, action: { type: 'leave' }, sound: 'cancel' };
    return { menu: { pages: menu.pages.slice(0, -1) }, action: null, sound: 'cancel' };
  }
  if (input.move === null) return still;
  if (page.kind === 'how-many') {
    const most = mostOf(page, world);
    const by = { left: -1, right: 1, down: -COUNT_STEP, up: COUNT_STEP }[input.move];
    const count = Math.max(1, Math.min(most, page.count + by));
    if (count === page.count) return still;
    const next = replaceShown(menu, { ...open, page: { ...page, count } });
    return { menu: next, action: null, sound: 'cursor' };
  }
  if (input.move === 'left' || input.move === 'right') return still;
  const entries = entriesOf(page, world);
  if (entries.length === 0) return still;
  const step = input.move === 'down' ? 1 : -1;
  const cursor = (open.cursor + step + entries.length) % entries.length;
  if (cursor === open.cursor) return still;
  return { menu: replaceShown(menu, scrolled({ ...open, cursor })), action: null, sound: 'cursor' };
}

/**
 * Brings the shop up to date with the game, once the scene has done what it was asked: every
 * cursor stays on a line there is, and with nothing left to sell, Sell goes back to the commands.
 */
export function settleShop(menu: ShopMenu, world: ShopWorld): ShopMenu {
  let pages = [...menu.pages];
  const last = pages.at(-1);
  if (pages.length > 1 && last?.page.kind === 'sell' && sellable(world).length === 0) {
    pages = pages.slice(0, -1);
  }
  return {
    pages: pages.map((open) => {
      const entries = entriesOf(open.page, world);
      const cursor = Math.max(0, Math.min(open.cursor, entries.length - 1));
      return scrolled({ ...open, cursor });
    }),
  };
}

/** The item a page is about: the one under the cursor on Buy and Sell, or the one being counted. */
export function itemOf(menu: ShopMenu, world: ShopWorld): ItemId | null {
  const { page, cursor } = shownPage(menu);
  if (page.kind === 'how-many') return page.item;
  return entriesOf(page, world)[cursor]?.item ?? null;
}

/** What `count` of an item comes to, bought or sold. */
export function totalOf(page: ShopPage & { kind: 'how-many' }, world: ShopWorld): number {
  const item = own(world.db.items, page.item);
  if (!item) return 0;
  return page.count * (page.deal === 'buy' ? (priceOf(item) ?? 0) : sellPrice(item));
}

/** How someone in the party would get on with a piece of gear. */
export interface MemberFit {
  readonly member: CharacterId;
  /** Whether they could wear it. */
  readonly fits: boolean;
  /** Whether they're wearing one already. */
  readonly wearing: boolean;
  /** How their stats would change, wearing it in place of what they wear: only those that do. */
  readonly changes: readonly { readonly stat: Stat; readonly by: number }[];
}

/**
 * Who in the party could wear a piece of gear, and how it would change their stats, in party
 * order. Null for anything that isn't gear.
 */
export function gearFits(world: ShopWorld, id: ItemId): MemberFit[] | null {
  const { state, db } = world;
  const item = own(db.items, id);
  const slot = item ? slotOf(item) : undefined;
  if (!item || slot === undefined) return null;
  return state.party.map((member) => {
    const character = own(db.characters, member);
    const wearing = state.members[member]?.equipment[slot] === id;
    if (!character || !canEquip(character, item)) {
      return { member, fits: false, wearing, changes: [] };
    }
    const now = memberStats(state, member, db);
    const after = memberStats(equip(addItem(state, id), member, id, db), member, db);
    const changes = STATS.filter((stat) => after[stat] !== now[stat]).map((stat) => ({
      stat,
      by: after[stat] - now[stat],
    }));
    return { member, fits: true, wearing, changes };
  });
}

/** How many of an item the party carries, and how many of it the party is wearing. */
export function carriedOf(world: ShopWorld, id: ItemId): { held: number; worn: number } {
  const { state } = world;
  const worn = state.party.filter((member) => {
    const equipment = state.members[member]?.equipment;
    return equipment !== undefined && Object.values(equipment).includes(id);
  }).length;
  return { held: itemCount(state, id), worn };
}

// What a press does.

function confirm(menu: ShopMenu, open: OpenPage, world: ShopWorld): ShopStep {
  // Nothing that can be chosen there.
  const refused: ShopStep = { menu, action: null, sound: 'buzzer' };
  const { page, cursor } = open;
  const entry = entriesOf(page, world)[cursor];
  const push = (next: ShopPage): ShopStep => ({
    menu: { pages: [...menu.pages, { page: next, cursor: 0, top: 0 }] },
    action: null,
    sound: 'confirm',
  });
  switch (page.kind) {
    case 'commands': {
      const command = SHOP_COMMANDS[cursor];
      if (!entry?.enabled || command === undefined) return refused;
      if (command === 'leave') return { menu, action: { type: 'leave' }, sound: 'confirm' };
      return push({ kind: command });
    }
    case 'buy':
    case 'sell': {
      if (!entry?.enabled || entry.item === null) return refused;
      return push({ kind: 'how-many', deal: page.kind, item: entry.item, count: 1 });
    }
    case 'how-many': {
      const back = { pages: menu.pages.slice(0, -1) };
      if (page.count < 1 || page.count > mostOf(page, world)) {
        return { menu: back, action: null, sound: 'buzzer' };
      }
      const action = { type: page.deal, item: page.item, count: page.count } as const;
      return { menu: back, action, sound: 'confirm' };
    }
  }
}

/** The most of an item that can be bought or sold now. */
function mostOf(page: ShopPage & { kind: 'how-many' }, world: ShopWorld): number {
  const { state, db } = world;
  return page.deal === 'buy' ? mostToBuy(state, page.item, db) : mostToSell(state, page.item, db);
}

/** What the party carries that a shop would buy, in the order the game lists items. */
function sellable(world: ShopWorld) {
  const { state, db } = world;
  return Object.entries(db.items).filter(([id]) => mostToSell(state, id, db) > 0);
}

/** Keeps the cursor in view on a list longer than the rows it shows. */
function scrolled(open: OpenPage): OpenPage {
  const rows = open.page.kind === 'buy' || open.page.kind === 'sell' ? SHOP_ROWS : Infinity;
  let top = open.top;
  if (open.cursor < top) top = open.cursor;
  if (open.cursor >= top + rows) top = open.cursor - rows + 1;
  return top === open.top ? open : { ...open, top };
}

function replaceShown(menu: ShopMenu, open: OpenPage): ShopMenu {
  return { pages: [...menu.pages.slice(0, -1), open] };
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
