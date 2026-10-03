import { DIRECTIONS, type Direction } from './direction';
import { isId, isNamespacedId } from './ids';

/** IDs from the content in src/data: `rowan`, `potion`, `saltmere`. */
export type CharacterId = string;
export type ItemId = string;
export type MapId = string;

/**
 * A game in progress: where the player is, who's in the party, what they carry and what has
 * happened so far. It's plain JSON, which is what a save keeps, and it never changes in place:
 * every field is read-only and each operation below returns a new state, so they're the only way
 * to change it. See "Game state and saves" in docs/TECH.md.
 */
export interface GameState {
  /** Who's in the party, in battle order. */
  readonly party: readonly CharacterId[];
  /** Everyone in the party, by ID. */
  readonly members: Readonly<Record<CharacterId, MemberState>>;
  /** How many of each item the party carries. Items they have none of aren't listed. */
  readonly inventory: Readonly<Record<ItemId, number>>;
  readonly gold: number;
  /** Things that have happened, like `story.beacon-out`. Only flags that are set are listed. */
  readonly flags: Readonly<Record<string, true>>;
  /** Story counters, like `saltmere.lamps-lit`. Any that aren't listed are 0. */
  readonly vars: Readonly<Record<string, number>>;
  readonly location: PlayerLocation;
  /** How long this game has been played, in milliseconds. */
  readonly playTimeMs: number;
}

/** How far a party member has come. M3 adds HP, MP and equipment, along with the stats. */
export interface MemberState {
  readonly level: number;
  /** All the EXP they've earned. */
  readonly exp: number;
}

/** Where the player stands: a cell on a map, facing one way. */
export interface PlayerLocation {
  readonly map: MapId;
  readonly x: number;
  readonly y: number;
  readonly facing: Direction;
}

/** What a new game starts with. */
export interface NewGame {
  readonly location: PlayerLocation;
  /** Who's in the party from the start, in battle order. */
  readonly party: readonly CharacterId[];
  readonly gold?: number;
  readonly inventory?: Readonly<Record<ItemId, number>>;
}

/** All four heroes fight, and there's no bench (see Scope in docs/DESIGN.md). */
export const MAX_PARTY_SIZE = 4;

export function createGameState(start: NewGame): GameState {
  let state: GameState = {
    party: [],
    members: {},
    inventory: {},
    gold: 0,
    flags: {},
    vars: {},
    location: checkedLocation(start.location),
    playTimeMs: 0,
  };
  for (const id of start.party) state = joinParty(state, id);
  for (const [item, count] of Object.entries(start.inventory ?? {})) {
    state = addItem(state, item, count);
  }
  return addGold(state, start.gold ?? 0);
}

export const hasFlag = (state: GameState, flag: string): boolean =>
  own(state.flags, checkedName('Flag', flag)) === true;

/** Sets a flag, or with `on` false clears it. */
export function setFlag(state: GameState, flag: string, on = true): GameState {
  if (hasFlag(state, flag) === on) return state;
  return { ...state, flags: on ? { ...state.flags, [flag]: true } : without(state.flags, flag) };
}

/** A story counter: 0 until it's set. */
export const getVar = (state: GameState, name: string): number =>
  own(state.vars, checkedName('Var', name)) ?? 0;

/** Sets a story counter to a whole number. */
export function setVar(state: GameState, name: string, value: number): GameState {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Var ${name} can't be ${value}: vars are whole numbers`);
  }
  if (getVar(state, name) === value) return state;
  return {
    ...state,
    vars: value === 0 ? without(state.vars, name) : { ...state.vars, [name]: value },
  };
}

export const itemCount = (state: GameState, item: ItemId): number =>
  own(state.inventory, checkedId('Item', item)) ?? 0;

export const hasItem = (state: GameState, item: ItemId, count = 1): boolean =>
  itemCount(state, item) >= checkedCount(count);

export function addItem(state: GameState, item: ItemId, count = 1): GameState {
  const total = itemCount(state, item) + checkedCount(count);
  return { ...state, inventory: { ...state.inventory, [item]: total } };
}

/** Takes items from the party, which must have that many: check with `hasItem` first. */
export function removeItem(state: GameState, item: ItemId, count = 1): GameState {
  const has = itemCount(state, item);
  if (checkedCount(count) > has) {
    throw new RangeError(`Can't remove ${count} ${item}: the party has ${has}`);
  }
  const left = has - count;
  return {
    ...state,
    inventory: left === 0 ? without(state.inventory, item) : { ...state.inventory, [item]: left },
  };
}

export function addGold(state: GameState, amount: number): GameState {
  if (checkedGold(amount) === 0) return state;
  return { ...state, gold: state.gold + amount };
}

/** Takes gold from the party, which must have that much. */
export function removeGold(state: GameState, amount: number): GameState {
  if (checkedGold(amount) > state.gold) {
    throw new RangeError(`Can't remove ${amount} gold: the party has ${state.gold}`);
  }
  if (amount === 0) return state;
  return { ...state, gold: state.gold - amount };
}

export const inParty = (state: GameState, id: CharacterId): boolean =>
  state.party.includes(checkedId('Character', id));

/** Someone joins the end of the party at level 1. Joining again does nothing. */
export function joinParty(state: GameState, id: CharacterId): GameState {
  if (inParty(state, id)) return state;
  if (state.party.length >= MAX_PARTY_SIZE) {
    throw new RangeError(`${id} can't join: the party is full (${state.party.join(', ')})`);
  }
  return {
    ...state,
    party: [...state.party, id],
    members: { ...state.members, [id]: { level: 1, exp: 0 } },
  };
}

/** Moves the player to another map, another cell, or just to face another way. */
export function setLocation(state: GameState, location: PlayerLocation): GameState {
  const { map, x, y, facing } = location;
  const at = state.location;
  if (at.map === map && at.x === x && at.y === y && at.facing === facing) return state;
  return { ...state, location: checkedLocation(location) };
}

export function addPlayTime(state: GameState, ms: number): GameState {
  if (!(ms >= 0 && Number.isFinite(ms))) {
    throw new RangeError(`Play time only goes forward: can't add ${ms} ms`);
  }
  return { ...state, playTimeMs: state.playTimeMs + ms };
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** A copy of a record without one key. */
function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function checkedId(kind: string, id: string): string {
  if (!isId(id)) throw new RangeError(`${kind} ID "${id}" isn't kebab-case, like tide-caves-b1`);
  return id;
}

function checkedName(kind: string, name: string): string {
  if (!isNamespacedId(name)) {
    throw new RangeError(`${kind} "${name}" isn't namespaced kebab-case, like story.beacon-out`);
  }
  return name;
}

function checkedCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`An item count is a whole number from 1 up, not ${count}`);
  }
  return count;
}

function checkedGold(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`An amount of gold is a whole number from 0 up, not ${amount}`);
  }
  return amount;
}

/** A copy of a location, with nothing else that came along with it. */
function checkedLocation({ map, x, y, facing }: PlayerLocation): PlayerLocation {
  checkedId('Map', map);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0) {
    throw new RangeError(`(${x}, ${y}) on ${map} isn't a cell`);
  }
  if (!DIRECTIONS.includes(facing)) throw new RangeError(`"${facing}" isn't a direction`);
  return { map, x, y, facing };
}
