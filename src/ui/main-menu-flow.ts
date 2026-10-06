import type { GameDb } from '../core/db';
import type { Direction } from '../core/direction';
import { SLOTS, canEquip, slotOf, type Slot } from '../core/equipment';
import { itemTargets, skillTargets, type FieldTargets } from '../core/field-use';
import { expToReach, type ExpCurve } from '../core/levels';
import { knownSkills, memberStats, memberVitals } from '../core/party';
import {
  equip,
  itemCount,
  unequip,
  type CharacterId,
  type GameState,
  type ItemId,
} from '../core/state';
import type { Stats } from '../core/stats';
import { MENU_TEXT } from '../data/ui-text';

/**
 * The main menu without the drawing (see Screens in docs/DESIGN.md), which Menu opens on the field:
 * Items, Skills, Equip, Status, Options and Save. Items and Skills use what can be used outside
 * battle (src/core/field-use.ts) on whoever it would help; Equip changes a member's gear, comparing
 * their stats before and after; Status shows all about them. The pages open on top of each other,
 * and Cancel goes back one; Menu closes it from any page. `stepMainMenu` hands back what to do,
 * for the scene to do to the game, and `settleMainMenu` then brings the pages up to date with it.
 */

/** The main menu's commands, top to bottom. */
export const MAIN_COMMANDS = ['items', 'skills', 'equip', 'status', 'options', 'save'] as const;
export type MainCommand = (typeof MAIN_COMMANDS)[number];

/** How many lines each list shows at once; longer ones scroll. */
export const LIST_ROWS = { items: 12, skills: 9, gear: 4 } as const;

/** A page of the main menu. */
export type MenuPage =
  | { readonly kind: 'commands' }
  | { readonly kind: 'items' }
  /** Whom to use an item on. */
  | { readonly kind: 'item-on'; readonly item: ItemId }
  /** Whose skills, gear or status to look at. */
  | { readonly kind: 'whose'; readonly command: 'skills' | 'equip' | 'status' }
  | { readonly kind: 'skills'; readonly member: CharacterId }
  /** Whom to cast a member's skill on. */
  | { readonly kind: 'skill-on'; readonly member: CharacterId; readonly skill: string }
  | { readonly kind: 'equip'; readonly member: CharacterId }
  /** What to put in one of a member's slots, or Remove, which takes off what's there. */
  | { readonly kind: 'gear'; readonly member: CharacterId; readonly slot: Slot }
  | { readonly kind: 'status'; readonly member: CharacterId };

/** A page as it's open: the cursor on it, and its first line in view. */
export interface OpenPage {
  readonly page: MenuPage;
  readonly cursor: number;
  readonly top: number;
}

/** The pages open: the commands underneath, and the one shown last. */
export interface MainMenu {
  readonly pages: readonly OpenPage[];
}

const COMMANDS: OpenPage = { page: { kind: 'commands' }, cursor: 0, top: 0 };

/** What the menu works with: the game being played, the content and the EXP curve. */
export interface MenuWorld {
  readonly state: GameState;
  readonly db: GameDb;
  readonly curve: ExpCurve;
}

/** A line on a page: what it says, a detail at its right, and whether it can be chosen. */
export interface MenuEntry {
  readonly label: string;
  readonly detail: string;
  readonly enabled: boolean;
  /** What it is or does, said at the bottom while the cursor is on it. */
  readonly help: string | null;
}

/** One frame's input. Menu closes the menu from any page. */
export interface MainMenuInput {
  readonly move: Direction | null;
  readonly confirm: boolean;
  readonly cancel: boolean;
  readonly menu: boolean;
}

/**
 * What the scene should do: use an item, cast a skill, change gear, open the Options screen, save,
 * or close the menu.
 */
export type MenuAction =
  | { readonly type: 'use'; readonly item: ItemId; readonly on: readonly CharacterId[] }
  | {
      readonly type: 'cast';
      readonly member: CharacterId;
      readonly skill: string;
      readonly on: readonly CharacterId[];
    }
  | { readonly type: 'equip'; readonly member: CharacterId; readonly item: ItemId }
  | { readonly type: 'unequip'; readonly member: CharacterId; readonly slot: Slot }
  | { readonly type: 'options' }
  | { readonly type: 'save' }
  | { readonly type: 'close' };

/** Opens the menu on its commands, with the cursor on Items. */
export const openMainMenu = (): MainMenu => ({ pages: [COMMANDS] });

/** The page showing: the last one open. */
export const shownPage = (menu: MainMenu): OpenPage => menu.pages.at(-1) ?? COMMANDS;

/** The lines on a page, as the game stands. Pages that show one member at a time have none. */
export function entriesOf(page: MenuPage, world: MenuWorld): MenuEntry[] {
  const { state, db } = world;
  switch (page.kind) {
    case 'commands':
      return MAIN_COMMANDS.map((command) => ({
        label: MENU_TEXT.commands[command],
        detail: '',
        enabled: state.party.length > 0 || command === 'save' || command === 'options',
        help: null,
      }));
    case 'items':
      return carried(world).map(([id, item]) => ({
        label: item.name,
        detail: String(itemCount(state, id)),
        enabled: itemTargets(state, id, db).members.length > 0,
        help: item.description,
      }));
    case 'item-on':
      return members(world, itemTargets(state, page.item, db));
    case 'whose':
      return members(world, { all: false, members: state.party });
    case 'skills':
      return knownSkills(state, page.member, db).map((id) => {
        const skill = own(db.skills, id);
        return {
          label: skill?.name ?? id,
          detail: String(skill?.mp ?? ''),
          enabled: skillTargets(state, page.member, id, db).members.length > 0,
          help: skill?.description ?? null,
        };
      });
    case 'skill-on':
      return members(world, skillTargets(state, page.member, page.skill, db));
    case 'equip':
      return SLOTS.map((slot) => {
        const worn = state.members[page.member]?.equipment[slot];
        const item = worn === undefined ? undefined : own(db.items, worn);
        return {
          label: MENU_TEXT.slots[slot],
          detail: item?.name ?? MENU_TEXT.nothing,
          enabled: true,
          help: item?.description ?? null,
        };
      });
    case 'gear': {
      const worn = state.members[page.member]?.equipment[page.slot];
      return [
        ...fitting(world, page.member, page.slot).map(([id, item]) => ({
          label: item.name,
          detail: String(itemCount(state, id)),
          enabled: true,
          help: item.description,
        })),
        { label: MENU_TEXT.remove, detail: '', enabled: worn !== undefined, help: null },
      ];
    }
    case 'status':
      return [];
  }
}

/**
 * What a press does on the page showing: moves the cursor (round from the end to the start), goes
 * to another member, opens a page, goes back, or asks the scene to do something.
 */
export function stepMainMenu(
  menu: MainMenu,
  input: MainMenuInput,
  world: MenuWorld,
): { menu: MainMenu; action: MenuAction | null } {
  const still = { menu, action: null };
  if (input.menu) return { menu, action: { type: 'close' } };
  const open = shownPage(menu);
  const { page } = open;
  const entries = entriesOf(page, world);
  // Confirm first, so a press in the same frame as a move picks what was on screen.
  if (input.confirm) return confirm(menu, open, entries, world);
  if (input.cancel) {
    if (menu.pages.length === 1) return { menu, action: { type: 'close' } };
    return { menu: { pages: menu.pages.slice(0, -1) }, action: null };
  }
  if (input.move === 'left' || input.move === 'right') {
    const other = otherMember(page, world, input.move === 'right' ? 1 : -1);
    return other
      ? { menu: replaceShown(menu, { page: other, cursor: 0, top: 0 }), action: null }
      : still;
  }
  if (input.move === 'up' || input.move === 'down') {
    // Aimed at everyone it helps, there's nobody to choose between.
    if (entries.length === 0 || aimsAtAll(page, world)) return still;
    const step = input.move === 'down' ? 1 : -1;
    const cursor = (open.cursor + step + entries.length) % entries.length;
    return { menu: replaceShown(menu, scrolled({ ...open, cursor })), action: null };
  }
  return still;
}

/**
 * Brings the menu up to date with the game, once the scene has done what it was asked: a page whose
 * use has run out (the last Potion, or nobody left to heal) goes back to the list it came from, and
 * every cursor stays on a line there is; one aiming at someone it no longer helps moves to someone
 * it does.
 */
export function settleMainMenu(menu: MainMenu, world: MenuWorld): MainMenu {
  let pages = [...menu.pages];
  while (pages.length > 1 && spent(pages[pages.length - 1]?.page, world))
    pages = pages.slice(0, -1);
  const settled = pages.map((open) => {
    const entries = entriesOf(open.page, world);
    let cursor = Math.max(0, Math.min(open.cursor, entries.length - 1));
    if (open.page.kind === 'item-on' || open.page.kind === 'skill-on')
      cursor = nearestEnabled(entries, cursor);
    return scrolled({ ...open, cursor });
  });
  return { pages: settled };
}

/**
 * Who the cursor picks out while choosing someone: whoever it's on, or, for something used on
 * everyone it helps, all of them. Nobody on other pages.
 */
export function aimedAt(menu: MainMenu, world: MenuWorld): CharacterId[] {
  const { page, cursor } = shownPage(menu);
  const targets = targetsOf(page, world);
  if (targets) return targets.all ? [...targets.members] : memberAt(world, cursor);
  if (page.kind === 'whose') return memberAt(world, cursor);
  return [];
}

/** The member a page is about: whose skills, gear or status it shows. */
export function memberOf(page: MenuPage): CharacterId | null {
  return 'member' in page ? page.member : null;
}

/** A member at a glance, as the party panel shows them. */
export interface MemberSummary {
  readonly id: CharacterId;
  readonly name: string;
  readonly level: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly mp: number;
  readonly maxMp: number;
  /** The EXP to their next level, or null at the last. */
  readonly next: number | null;
}

/** The party at a glance, in battle order. */
export function partySummary(world: MenuWorld): MemberSummary[] {
  return world.state.party.map((id) => summaryOf(world, id));
}

export function summaryOf(world: MenuWorld, id: CharacterId): MemberSummary {
  const { state, db, curve } = world;
  const member = state.members[id];
  const { now, most } = memberVitals(state, id, db);
  const level = member?.level ?? 1;
  const next = level < curve.maxLevel ? expToReach(level + 1, curve) - (member?.exp ?? 0) : null;
  return {
    id,
    name: own(db.characters, id)?.name ?? id,
    level,
    hp: now.hp,
    maxHp: most.hp,
    mp: now.mp,
    maxMp: most.mp,
    next,
  };
}

/**
 * The names of the skills a member knows, as Status lists them in `lines` lines: all of them, or
 * as many as fit with the last line saying how many more there are, which Skills lists.
 */
export function statusSkills(world: MenuWorld, member: CharacterId, lines: number): string[] {
  const { state, db } = world;
  const names = knownSkills(state, member, db).map((id) => own(db.skills, id)?.name ?? id);
  if (names.length === 0) return [MENU_TEXT.noSkills];
  if (names.length <= lines) return names;
  return [...names.slice(0, lines - 1), MENU_TEXT.moreSkills(names.length - lines + 1)];
}

/**
 * A member's stats as they are, and as they'd be with what's under the cursor on the gear page put
 * on (or, on Remove, with the slot empty). Null on other pages, and on a Remove with nothing to
 * take off.
 */
export function gearComparison(
  menu: MainMenu,
  world: MenuWorld,
): { readonly now: Stats; readonly after: Stats } | null {
  const { page, cursor } = shownPage(menu);
  if (page.kind !== 'gear') return null;
  const { state, db } = world;
  const now = memberStats(state, page.member, db);
  const pieces = fitting(world, page.member, page.slot);
  const piece = pieces[cursor];
  if (piece)
    return { now, after: memberStats(equip(state, page.member, piece[0], db), page.member, db) };
  if (state.members[page.member]?.equipment[page.slot] === undefined) return null;
  return { now, after: memberStats(unequip(state, page.member, page.slot), page.member, db) };
}

// What a press does.

function confirm(
  menu: MainMenu,
  open: OpenPage,
  entries: readonly MenuEntry[],
  world: MenuWorld,
): { menu: MainMenu; action: MenuAction | null } {
  const still = { menu, action: null };
  const { page, cursor } = open;
  const entry = entries[cursor];
  const push = (next: MenuPage, at = 0) => ({
    menu: { pages: [...menu.pages, scrolled({ page: next, cursor: at, top: 0 })] },
    action: null,
  });
  switch (page.kind) {
    case 'commands': {
      const command = MAIN_COMMANDS[cursor];
      if (!entry?.enabled || command === undefined) return still;
      if (command === 'save') return { menu, action: { type: 'save' } };
      if (command === 'items') return push({ kind: 'items' });
      if (command === 'options') return { menu, action: { type: 'options' } };
      return push({ kind: 'whose', command });
    }
    case 'items': {
      const item = carried(world)[cursor]?.[0];
      if (!entry?.enabled || item === undefined) return still;
      const next: MenuPage = { kind: 'item-on', item };
      return push(next, nearestEnabled(entriesOf(next, world), 0));
    }
    case 'skills': {
      const skill = knownSkills(world.state, page.member, world.db)[cursor];
      if (!entry?.enabled || skill === undefined) return still;
      const next: MenuPage = { kind: 'skill-on', member: page.member, skill };
      return push(next, nearestEnabled(entriesOf(next, world), 0));
    }
    case 'item-on':
    case 'skill-on': {
      const targets = targetsOf(page, world);
      if (!targets || targets.members.length === 0) return still;
      const on = targets.all ? [...targets.members] : memberAt(world, cursor);
      const target = on[0];
      if (target === undefined || (!targets.all && !targets.members.includes(target))) return still;
      if (page.kind === 'item-on') return { menu, action: { type: 'use', item: page.item, on } };
      return { menu, action: { type: 'cast', member: page.member, skill: page.skill, on } };
    }
    case 'whose': {
      const member = world.state.party[cursor];
      if (member === undefined) return still;
      return push({ kind: page.command, member });
    }
    case 'equip': {
      const slot = SLOTS[cursor];
      return slot === undefined ? still : push({ kind: 'gear', member: page.member, slot });
    }
    case 'gear': {
      if (!entry?.enabled) return still;
      // Back to the slots, whatever's chosen.
      const back = { pages: menu.pages.slice(0, -1) };
      const piece = fitting(world, page.member, page.slot)[cursor];
      if (piece)
        return { menu: back, action: { type: 'equip', member: page.member, item: piece[0] } };
      return { menu: back, action: { type: 'unequip', member: page.member, slot: page.slot } };
    }
    case 'status':
      return still;
  }
}

/** Whom an item or skill is being aimed at, on the pages that aim one. */
function targetsOf(page: MenuPage, world: MenuWorld): FieldTargets | null {
  const { state, db } = world;
  if (page.kind === 'item-on') return itemTargets(state, page.item, db);
  if (page.kind === 'skill-on') return skillTargets(state, page.member, page.skill, db);
  return null;
}

/** Whether a page is aiming something at everyone it helps at once, rather than at one of them. */
export const aimsAtAll = (page: MenuPage, world: MenuWorld): boolean =>
  targetsOf(page, world)?.all ?? false;

/** The party member on the `cursor`th line of a page that lists the party, if any. */
const memberAt = (world: MenuWorld, cursor: number): CharacterId[] => {
  const id = world.state.party[cursor];
  return id === undefined ? [] : [id];
};

/** The party, a line each, those in `targets` able to be chosen. */
function members(world: MenuWorld, targets: FieldTargets): MenuEntry[] {
  return world.state.party.map((id) => ({
    label: own(world.db.characters, id)?.name ?? id,
    detail: '',
    enabled: targets.members.includes(id),
    help: null,
  }));
}

/** The items the party carries, in the order the game lists them. */
function carried(world: MenuWorld) {
  const { state, db } = world;
  return Object.entries(db.items).filter(([id]) => itemCount(state, id) > 0);
}

/** The equipment the party carries that a member could wear in a slot, in the game's order. */
function fitting(world: MenuWorld, member: CharacterId, slot: Slot) {
  const character = own(world.db.characters, member);
  return carried(world).filter(
    ([, item]) => character !== undefined && slotOf(item) === slot && canEquip(character, item),
  );
}

/**
 * The same page, about the next member of the party along (or the last, going left): Skills,
 * Equip and Status go round the party.
 */
function otherMember(page: MenuPage, world: MenuWorld, step: 1 | -1): MenuPage | null {
  if (page.kind !== 'skills' && page.kind !== 'equip' && page.kind !== 'status') return null;
  const { party } = world.state;
  if (party.length < 2) return null;
  const index = party.indexOf(page.member);
  const member = party[(index + step + party.length) % party.length];
  return member === undefined ? null : { ...page, member };
}

/** Whether a page has nothing left to do: an item or skill with nobody left to use it on. */
function spent(page: MenuPage | undefined, world: MenuWorld): boolean {
  if (!page) return false;
  const targets = targetsOf(page, world);
  return targets !== null && targets.members.length === 0;
}

/** The enabled line nearest `cursor`, looking down first, round from the end; or `cursor`. */
function nearestEnabled(entries: readonly MenuEntry[], cursor: number): number {
  if (entries[cursor]?.enabled) return cursor;
  for (let step = 1; step < entries.length; step++) {
    const index = (cursor + step) % entries.length;
    if (entries[index]?.enabled) return index;
  }
  return cursor;
}

/** Keeps the cursor in view on a list longer than the rows it shows. */
function scrolled(open: OpenPage): OpenPage {
  const rows = rowsOf(open.page);
  let top = open.top;
  if (open.cursor < top) top = open.cursor;
  if (open.cursor >= top + rows) top = open.cursor - rows + 1;
  return top === open.top ? open : { ...open, top };
}

/** How many lines a page shows at once: all of them, on pages that aren't lists. */
const rowsOf = (page: MenuPage): number =>
  page.kind === 'items' || page.kind === 'skills' || page.kind === 'gear'
    ? LIST_ROWS[page.kind]
    : Infinity;

function replaceShown(menu: MainMenu, open: OpenPage): MainMenu {
  return { pages: [...menu.pages.slice(0, -1), open] };
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
