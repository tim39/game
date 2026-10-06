import type { Action, Command } from '../core/battle/actions';
import {
  activeFighter,
  aimOf,
  checkAction,
  checkCommand,
  fighterOf,
  targetChoices,
  targetsOf,
  type BattleState,
} from '../core/battle/battle';
import type { FighterId } from '../core/battle/fighter';
import type { Target } from '../core/battle/terms';
import type { Direction } from '../core/direction';
import { BATTLE_TEXT } from '../data/ui-text';
import type { MenuSound } from './menu-sound';

/**
 * The battle's command menu, without the drawing (see Commands in docs/DESIGN.md): what the party
 * member whose turn it is can choose, where the cursor is, and what Confirm and Cancel do. Skill and
 * Item open lists of what they can use. Attack, and a skill or item aimed at one fighter, go on to
 * picking a target among those it can be aimed at; one that works on a whole side, or its user,
 * shows whom it reaches, to confirm. Cancel goes back a step. Guard and Flee are taken at once.
 * `stepBattleMenu` hands back the action chosen, for the battle to take.
 */

export type RootCommand = 'attack' | 'skill' | 'item' | 'guard' | 'flee';

/** A place in a grid of menu entries. */
export interface GridSpot {
  readonly col: number;
  readonly row: number;
}

/** The command window's five commands, and where each sits: three rows, then Guard and Flee. */
export const ROOT_COMMANDS: readonly { readonly id: RootCommand; readonly at: GridSpot }[] = [
  { id: 'attack', at: { col: 0, row: 0 } },
  { id: 'skill', at: { col: 0, row: 1 } },
  { id: 'item', at: { col: 0, row: 2 } },
  { id: 'guard', at: { col: 0, row: 3 } },
  { id: 'flee', at: { col: 1, row: 3 } },
];

/** Skill and item lists show this many to a row, and this many rows at once; longer ones scroll. */
export const LIST_COLUMNS = 2;
export const LIST_ROWS = 4;

/** A line in the command window, greyed out when it can't be chosen. */
export interface CommandEntry {
  readonly id: RootCommand;
  readonly label: string;
  readonly enabled: boolean;
}

/** A skill or item in its list. */
export interface ListEntry {
  readonly command: Extract<Command, { type: 'skill' | 'item' }>;
  readonly label: string;
  /** Shown at the right: a skill's MP cost, or how many of an item the party has. */
  readonly detail: string;
  /** What it does, for the help line. */
  readonly help: string;
  /** Whether it can be used now: with the MP for it, not Silenced, and someone to use it on. */
  readonly enabled: boolean;
}

type ListPage = 'skills' | 'items';
export type MenuPage = 'commands' | ListPage | 'target';

/** A command being aimed. */
export interface Aiming {
  readonly command: Command;
  readonly aim: Target;
  /** The page it was chosen on, which Cancel goes back to. */
  readonly from: 'commands' | ListPage;
  /** Whom it can be aimed at, one at a time; or, with `all`, everyone it works on at once. */
  readonly choices: readonly FighterId[];
  readonly all: boolean;
  /** The choice under the cursor. */
  readonly index: number;
}

export interface BattleMenu {
  /** Whose turn it is. */
  readonly actor: FighterId;
  readonly page: MenuPage;
  readonly commands: readonly CommandEntry[];
  readonly skills: readonly ListEntry[];
  readonly items: readonly ListEntry[];
  /** Where the cursor is on each page, kept while going back and forth. */
  readonly cursor: Readonly<Record<'commands' | ListPage, number>>;
  /** The first row of each list in view. */
  readonly top: Readonly<Record<ListPage, number>>;
  /** What's being aimed, on the target page. */
  readonly aiming: Aiming | null;
}

/** What the player pressed this frame. */
export interface MenuInput {
  readonly move: Direction | null;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

/**
 * What a step of the menu leads to: the menu as it is now, the action chosen, if any, and the
 * sound the press made.
 */
export interface MenuStep {
  readonly menu: BattleMenu;
  readonly action: Action | null;
  readonly sound: MenuSound | null;
}

/** Opens the menu for the party member whose turn it is, with the cursor on Attack. */
export function openBattleMenu(battle: BattleState): BattleMenu {
  const actor = activeFighter(battle);
  if (actor.side !== 'party') throw new RangeError(`It's ${actor.name}'s turn, not the party's`);
  const { skills: skillDefs, items: itemDefs } = battle.rules;
  const skills = actor.skills.flatMap((skill): ListEntry[] => {
    const def = ownOf(skillDefs, skill);
    if (!def) return [];
    const command = { type: 'skill', skill } as const;
    const enabled = canUse(battle, command);
    return [{ command, label: def.name, detail: String(def.mp), help: def.description, enabled }];
  });
  // Items in the order the game lists them, not the order they were picked up.
  const items = Object.entries(itemDefs).flatMap(([item, def]): ListEntry[] => {
    const count = ownOf(battle.inventory, item) ?? 0;
    if (def.kind !== 'consumable' || count < 1) return [];
    const command = { type: 'item', item } as const;
    const enabled = canUse(battle, command);
    return [{ command, label: def.name, detail: String(count), help: def.description, enabled }];
  });
  const enabled: Record<RootCommand, boolean> = {
    attack: canUse(battle, { type: 'attack' }),
    skill: skills.length > 0,
    item: items.length > 0,
    guard: canUse(battle, { type: 'guard' }),
    flee: canUse(battle, { type: 'flee' }),
  };
  return {
    actor: actor.id,
    page: 'commands',
    commands: ROOT_COMMANDS.map(({ id }) => ({
      id,
      label: BATTLE_TEXT.commands[id],
      enabled: enabled[id],
    })),
    skills,
    items,
    cursor: { commands: 0, skills: 0, items: 0 },
    top: { skills: 0, items: 0 },
    aiming: null,
  };
}

/**
 * The menu after a frame's input: Confirm, then Cancel, then a move, so a press in the same frame
 * as a move picks what was on screen. Hands back an action once one is chosen, and the sound the
 * press made: Confirm on what can't be chosen buzzes, and there's no going back from the commands.
 */
export function stepBattleMenu(menu: BattleMenu, battle: BattleState, input: MenuInput): MenuStep {
  const { aiming } = menu;
  switch (menu.page) {
    case 'commands': {
      if (input.confirm) return chooseCommand(menu, battle);
      if (input.move === null) return still(menu);
      const spots = ROOT_COMMANDS.map(({ at }) => at);
      const commands = moveInGrid(spots, menu.cursor.commands, input.move);
      if (commands === menu.cursor.commands) return still(menu);
      return step({ ...menu, cursor: { ...menu.cursor, commands } }, 'cursor');
    }
    case 'skills':
    case 'items': {
      const page = menu.page;
      const entries = menu[page];
      const entry = entries[menu.cursor[page]];
      if (input.confirm) {
        return entry?.enabled
          ? step(aim(menu, battle, entry.command, page), 'confirm')
          : step(menu, 'buzzer');
      }
      if (input.cancel) return step({ ...menu, page: 'commands' }, 'cancel');
      if (input.move === null || entries.length === 0) return still(menu);
      const spots = listSpots(entries.length, LIST_COLUMNS);
      const cursor = moveInGrid(spots, menu.cursor[page], input.move);
      if (cursor === menu.cursor[page]) return still(menu);
      const moved = scrolledTo({ ...menu, cursor: { ...menu.cursor, [page]: cursor } }, page);
      return step(moved, 'cursor');
    }
    case 'target': {
      if (!aiming) return still({ ...menu, page: 'commands' });
      if (input.confirm) {
        const action = actionOf(aiming);
        const ok = action !== undefined && checkAction(battle, action) === undefined;
        return ok ? { menu, action, sound: 'confirm' } : step(menu, 'buzzer');
      }
      if (input.cancel) return step({ ...menu, page: aiming.from, aiming: null }, 'cancel');
      if (input.move === null || aiming.all) return still(menu);
      const by = input.move === 'down' || input.move === 'right' ? 1 : -1;
      const count = aiming.choices.length;
      const index = (aiming.index + by + count) % count;
      if (index === aiming.index) return still(menu);
      return step({ ...menu, aiming: { ...aiming, index } }, 'cursor');
    }
  }
}

/** Who the cursor points at while aiming: one fighter, everyone an action works on, or no one. */
export function aimedAt(menu: BattleMenu): FighterId[] {
  const { aiming } = menu;
  if (menu.page !== 'target' || !aiming) return [];
  if (aiming.all) return [...aiming.choices];
  const target = aiming.choices[aiming.index];
  return target === undefined ? [] : [target];
}

/**
 * The action the timeline previews for what's under the cursor: the one Confirm leads to, aimed
 * where the cursor is or will start. Nothing yet for Skill and Item, which only open their lists,
 * or for what can't be used now: the timeline then shows a Normal action.
 */
export function previewAction(menu: BattleMenu, battle: BattleState): Action | undefined {
  const action = previewed(menu, battle);
  return action !== undefined && checkAction(battle, action) === undefined ? action : undefined;
}

function previewed(menu: BattleMenu, battle: BattleState): Action | undefined {
  switch (menu.page) {
    case 'commands':
      return previewedCommand(menu, battle);
    case 'skills':
    case 'items': {
      const entry = menu[menu.page][menu.cursor[menu.page]];
      return entry?.enabled ? aimingOf(aim(menu, battle, entry.command, menu.page)) : undefined;
    }
    case 'target':
      return aimingOf(menu);
  }
}

function previewedCommand(menu: BattleMenu, battle: BattleState): Action | undefined {
  const entry = menu.commands[menu.cursor.commands];
  if (!entry?.enabled) return undefined;
  switch (entry.id) {
    case 'attack':
      return aimingOf(aim(menu, battle, { type: 'attack' }, 'commands'));
    case 'skill':
    case 'item':
      return undefined;
    case 'guard':
      return { type: 'guard' };
    case 'flee':
      return { type: 'flee' };
  }
}

const aimingOf = ({ aiming }: BattleMenu): Action | undefined =>
  aiming ? actionOf(aiming) : undefined;

/**
 * What the help line says: what the skill or item under the cursor does, or whom an action is
 * aimed at. Nothing on the command window.
 */
export function helpLine(menu: BattleMenu, battle: BattleState): string | null {
  switch (menu.page) {
    case 'commands':
      return null;
    case 'skills':
    case 'items':
      return menu[menu.page][menu.cursor[menu.page]]?.help ?? null;
    case 'target': {
      const { aiming } = menu;
      if (!aiming) return null;
      if (aiming.aim === 'all-enemies') return BATTLE_TEXT.allEnemies;
      if (aiming.aim === 'all-allies') return BATTLE_TEXT.allAllies;
      const [target] = aimedAt(menu);
      return target === undefined ? null : fighterOf(battle, target).name;
    }
  }
}

/** The action being aimed, at the fighter under the cursor or at no one in particular. */
function actionOf(aiming: Aiming): Action | undefined {
  const { command } = aiming;
  const target = aiming.all ? undefined : aiming.choices[aiming.index];
  switch (command.type) {
    case 'attack':
      return target === undefined ? undefined : { type: 'attack', target };
    case 'skill':
    case 'item':
    case 'telegraph':
      return target === undefined ? command : { ...command, target };
    case 'guard':
    case 'flee':
      return command;
  }
}

/** Confirm on the command window: Guard and Flee are taken; the others go on. */
function chooseCommand(menu: BattleMenu, battle: BattleState): MenuStep {
  const entry = menu.commands[menu.cursor.commands];
  if (!entry?.enabled) return step(menu, 'buzzer');
  switch (entry.id) {
    case 'attack':
      return step(aim(menu, battle, { type: 'attack' }, 'commands'), 'confirm');
    case 'skill':
      return step({ ...menu, page: 'skills' }, 'confirm');
    case 'item':
      return step({ ...menu, page: 'items' }, 'confirm');
    case 'guard':
      return { menu, action: { type: 'guard' }, sound: 'confirm' };
    case 'flee':
      return { menu, action: { type: 'flee' }, sound: 'confirm' };
  }
}

/**
 * Goes on to aiming a command: at one of those it can be aimed at, starting on the first enemy, or
 * on the ally worst hurt; or at everyone it works on.
 */
function aim(
  menu: BattleMenu,
  battle: BattleState,
  command: Command,
  from: Aiming['from'],
): BattleMenu {
  const target = aimOf(battle, command);
  if (target === 'one-enemy' || target === 'one-ally') {
    const choices = targetChoices(battle, command);
    const share = (id: FighterId): number => {
      const fighter = fighterOf(battle, id);
      return fighter.hp / fighter.stats.hp;
    };
    const worst = choices.reduce(
      (best, id, index) => (share(id) < share(choices[best] ?? id) ? index : best),
      0,
    );
    const index = target === 'one-ally' ? worst : 0;
    const aiming = { command, aim: target, from, choices, all: false, index };
    return { ...menu, page: 'target', aiming };
  }
  const choices = targetsOf(battle, command as Action);
  return {
    ...menu,
    page: 'target',
    aiming: { command, aim: target, from, choices, all: true, index: 0 },
  };
}

/** Whether the fighter whose turn it is could take a command now, at someone. */
function canUse(battle: BattleState, command: Command): boolean {
  if (checkCommand(battle, command) !== undefined) return false;
  const target = aimOf(battle, command);
  if (target === 'one-enemy' || target === 'one-ally') {
    return targetChoices(battle, command).length > 0;
  }
  return checkAction(battle, command as Action) === undefined;
}

/** The list scrolled, if need be, to show the row the cursor is on. */
function scrolledTo(menu: BattleMenu, page: ListPage): BattleMenu {
  const row = Math.floor(menu.cursor[page] / LIST_COLUMNS);
  const top = Math.min(row, Math.max(menu.top[page], row - LIST_ROWS + 1));
  return { ...menu, top: { ...menu.top, [page]: top } };
}

/** The menu after a press that chose no action yet, with the sound it made. */
const step = (menu: BattleMenu, sound: MenuSound): MenuStep => ({ menu, action: null, sound });

/** The menu after a press that did nothing that's heard. */
const still = (menu: BattleMenu): MenuStep => ({ menu, action: null, sound: null });

/** Where each of `count` entries sits, laid out `columns` to a row. */
export const listSpots = (count: number, columns: number): GridSpot[] =>
  Array.from({ length: count }, (_, index) => ({
    col: index % columns,
    row: Math.floor(index / columns),
  }));

/**
 * Moves a cursor round a grid of entries: Left and Right along its row, and Up and Down to the next
 * row, onto the entry nearest its column. Every way wraps round. Returns the index moved to.
 */
export function moveInGrid(
  spots: readonly GridSpot[],
  index: number,
  direction: Direction,
): number {
  const here = spots[index];
  if (!here) return index;
  const indexed = spots.map((spot, at) => ({ spot, at }));
  const wrap = (at: number, count: number): number => (at + count) % count;
  if (direction === 'left' || direction === 'right') {
    const row = indexed.filter(({ spot }) => spot.row === here.row);
    row.sort((a, b) => a.spot.col - b.spot.col);
    const at = row.findIndex((entry) => entry.at === index);
    return row[wrap(at + (direction === 'right' ? 1 : -1), row.length)]?.at ?? index;
  }
  const rows = [...new Set(spots.map((spot) => spot.row))].sort((a, b) => a - b);
  const next = rows[wrap(rows.indexOf(here.row) + (direction === 'down' ? 1 : -1), rows.length)];
  const nearest = indexed
    .filter(({ spot }) => spot.row === next)
    .sort(
      (a, b) =>
        Math.abs(a.spot.col - here.col) - Math.abs(b.spot.col - here.col) ||
        a.spot.col - b.spot.col,
    )[0];
  return nearest?.at ?? index;
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const ownOf = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
