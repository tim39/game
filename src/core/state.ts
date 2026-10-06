import { ELEMENTS, type Element } from './battle/terms';
import type { GameDb } from './db';
import { DIRECTIONS, isDirection, type Direction } from './direction';
import { SLOTS, canEquip, slotOf, type Equipment, type Slot } from './equipment';
import { isId, isNamespacedId } from './ids';
import { expToReach, levelForExp, type ExpCurve } from './levels';

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
  /**
   * What the party has learned of each kind of enemy, by its ID: the elements they know how it
   * takes, in the order of ELEMENTS. Battles start out knowing them (see Elements and Stagger in
   * docs/DESIGN.md).
   */
  readonly knownReactions: Readonly<Record<string, readonly Element[]>>;
  readonly location: PlayerLocation;
  /** How long this game has been played, in milliseconds. */
  readonly playTimeMs: number;
}

/** How far a party member has come, what they have on, and how they are. */
export interface MemberState {
  readonly level: number;
  /** All the EXP they've earned. */
  readonly exp: number;
  /** What's in their weapon, armor and accessory slots. Equipping takes it from the inventory. */
  readonly equipment: Equipment;
  /**
   * The HP and MP they have left, while they're down from their most; without one, they're full
   * of it. Their most comes from their level and equipment (`memberStats` in src/core/party.ts),
   * which `memberVitals` there holds these to.
   */
  readonly hp?: number;
  readonly mp?: number;
}

/** HP and MP, as much as someone has, or the most they can. */
export interface Vitals {
  readonly hp: number;
  readonly mp: number;
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
    knownReactions: {},
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

/**
 * Someone joins the end of the party at level 1, wearing `equipment`, which doesn't come out of
 * the inventory: `recruit` (src/core/party.ts) gives them the gear their character starts with.
 * Joining again does nothing.
 */
export function joinParty(state: GameState, id: CharacterId, equipment: Equipment = {}): GameState {
  if (inParty(state, id)) return state;
  if (state.party.length >= MAX_PARTY_SIZE) {
    throw new RangeError(`${id} can't join: the party is full (${state.party.join(', ')})`);
  }
  const member = { level: 1, exp: 0, equipment: checkedEquipment(id, equipment) };
  return { ...state, party: [...state.party, id], members: { ...state.members, [id]: member } };
}

/**
 * A member of the party gains EXP, and levels up as far as it takes them on the curve (see
 * src/core/levels.ts), to its last level at most. EXP past that still counts.
 */
export function gainExp(
  state: GameState,
  id: CharacterId,
  amount: number,
  curve: ExpCurve,
): GameState {
  const member = memberOf(state, id, 'gain EXP');
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`EXP comes in whole amounts from 0 up, not ${amount}`);
  }
  if (amount === 0) return state;
  const exp = member.exp + amount;
  const level = Math.max(member.level, levelForExp(exp, curve));
  return withMember(state, id, { ...member, level, exp });
}

/**
 * Puts a member of the party at a level, up or down, with all the EXP it takes to reach it (see
 * src/core/levels.ts): what the debug menu does. Their gear and the HP and MP they have stay as
 * they were, held to their new most as ever (`memberVitals` in src/core/party.ts).
 */
export function setLevel(
  state: GameState,
  id: CharacterId,
  level: number,
  curve: ExpCurve,
): GameState {
  const member = memberOf(state, id, 'change level');
  const exp = expToReach(level, curve);
  if (member.level === level && member.exp === exp) return state;
  return withMember(state, id, { ...member, level, exp });
}

/**
 * A member equips an item from the inventory, in the slot it goes in, and what was there goes back
 * into the inventory. They must be able to wear it: a weapon of their kind, armor of a kind they
 * wear, or any accessory (see src/core/equipment.ts).
 */
export function equip(state: GameState, id: CharacterId, item: ItemId, db: GameDb): GameState {
  const member = memberOf(state, id, 'equip anything');
  const character = own(db.characters, id);
  const def = own(db.items, checkedId('Item', item));
  if (!character) throw new RangeError(`${id} can't equip anything: there's no such character`);
  if (!def) throw new RangeError(`There's no item called ${item} to equip`);
  const slot = slotOf(def);
  if (!slot) throw new RangeError(`${def.name} isn't equipment`);
  if (!canEquip(character, def)) throw new RangeError(`${character.name} can't equip ${def.name}`);
  const taken = removeItem(state, item);
  const old = member.equipment[slot];
  const equipment = { ...member.equipment, [slot]: item };
  return withMember(old === undefined ? taken : addItem(taken, old), id, { ...member, equipment });
}

/** A member takes off what's in a slot, which goes back into the inventory. */
export function unequip(state: GameState, id: CharacterId, slot: Slot): GameState {
  const member = memberOf(state, id, 'take anything off');
  const old = member.equipment[slot];
  if (old === undefined) return state;
  const equipment = without(member.equipment, slot);
  return withMember(addItem(state, old), id, { ...member, equipment });
}

/**
 * Sets how much HP and MP a member has, out of `most`, the most they can: as a battle left them,
 * say. One at its most is kept as full, so it stays full when their most goes up.
 */
export function setVitals(state: GameState, id: CharacterId, now: Vitals, most: Vitals): GameState {
  const member = memberOf(state, id, 'have HP and MP');
  const hp = checkedVital(id, 'HP', now.hp, most.hp);
  const mp = checkedVital(id, 'MP', now.mp, most.mp);
  return withMember(state, id, {
    ...atFull(member),
    ...(hp < most.hp ? { hp } : {}),
    ...(mp < most.mp ? { mp } : {}),
  });
}

/** Everyone in the party back to their most HP and MP: a night's rest, or a Light Shrine. */
export function restoreParty(state: GameState): GameState {
  if (Object.values(state.members).every((member) => !('hp' in member) && !('mp' in member))) {
    return state;
  }
  return {
    ...state,
    members: Object.fromEntries(
      Object.entries(state.members).map(([id, member]) => [id, atFull(member)]),
    ),
  };
}

/** A member at their most HP and MP: as they are, without any kept. */
const atFull = ({ level, exp, equipment }: MemberState): MemberState => ({ level, exp, equipment });

/**
 * The party learns how kinds of enemies take elements, by the enemies' IDs: as a battle taught
 * them. What they knew already they still know.
 */
export function learnReactions(
  state: GameState,
  learned: Readonly<Record<string, readonly Element[]>>,
): GameState {
  let knownReactions = state.knownReactions;
  for (const [kind, elements] of Object.entries(learned)) {
    const known = own(knownReactions, checkedId('Enemy', kind)) ?? [];
    const all = checkedElements(kind, [...known, ...elements.filter((e) => !known.includes(e))]);
    if (all.length > known.length) knownReactions = { ...knownReactions, [kind]: all };
  }
  return knownReactions === state.knownReactions ? state : { ...state, knownReactions };
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

/**
 * A game state read back from JSON, as a save keeps it: checked against the rules the operations
 * keep, and copied with nothing else that came along with it. Throws an error saying what's wrong,
 * so a damaged save can't break the game.
 */
export function checkedGameState(json: unknown): GameState {
  const state = fieldsOf(json, 'The game state');
  const party = listOf(state.party, 'The party').map((id) =>
    checkedId('Character', textOf(id, 'A party member')),
  );
  if (party.length > MAX_PARTY_SIZE) {
    throw new RangeError(`The party has ${party.length} members, but holds ${MAX_PARTY_SIZE}`);
  }
  if (new Set(party).size < party.length) {
    throw new RangeError(`Someone is in the party twice: ${party.join(', ')}`);
  }
  const members = recordOf(state.members, 'The members', (id, member) => [
    checkedId('Character', id),
    checkedMember(id, member),
  ]);
  const missing = party.find((id) => !Object.hasOwn(members, id));
  if (missing) throw new RangeError(`${missing} is in the party, but isn't a member`);
  return {
    party,
    members,
    inventory: recordOf(state.inventory, 'The inventory', (item, count) => [
      checkedId('Item', item),
      checkedCount(numberOf(count, `The count of ${item}`)),
    ]),
    gold: checkedGold(numberOf(state.gold, 'Gold')),
    flags: recordOf(state.flags, 'The flags', (flag, on) => {
      if (on !== true) throw new RangeError(`Flag ${flag} is ${String(on)}: set flags are true`);
      return [checkedName('Flag', flag), true];
    }),
    vars: recordOf(state.vars, 'The vars', (name, json) => {
      const value = numberOf(json, `Var ${name}`);
      if (!Number.isSafeInteger(value) || value === 0) {
        throw new RangeError(`Var ${name} is ${value}: kept vars are whole numbers, and not 0`);
      }
      return [checkedName('Var', name), value];
    }),
    knownReactions: recordOf(
      state.knownReactions,
      'What the party knows of enemies',
      (kind, json) => [
        checkedId('Enemy', kind),
        checkedElements(
          kind,
          listOf(json, `What the party knows of ${kind}`).map((element) =>
            textOf(element, `An element ${kind} takes`),
          ),
        ),
      ],
    ),
    location: checkedLocation(locationOf(state.location)),
    playTimeMs: checkedPlayTime(numberOf(state.playTimeMs, 'Play time')),
  };
}

/** A member of the party, who's about to `act`. Throws for anyone who isn't one. */
function memberOf(state: GameState, id: CharacterId, act: string): MemberState {
  const member = own(state.members, checkedId('Character', id));
  if (!member) throw new RangeError(`${id} can't ${act}: they aren't in the party`);
  return member;
}

const withMember = (state: GameState, id: CharacterId, member: MemberState): GameState => ({
  ...state,
  members: { ...state.members, [id]: member },
});

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

/** HP or MP someone has: a whole number, from none to the most they can have. */
function checkedVital(id: string, what: string, amount: number, most: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > most) {
    throw new RangeError(`${id} can't have ${amount} ${what}: from 0 to ${most}`);
  }
  return amount;
}

/** Elements there are, each once, put in the order of ELEMENTS. */
function checkedElements(kind: string, elements: readonly string[]): Element[] {
  for (const element of elements) {
    if (!(ELEMENTS as readonly string[]).includes(element)) {
      throw new RangeError(
        `What the party knows of ${kind} has "${element}", which isn't an element`,
      );
    }
  }
  if (new Set(elements).size < elements.length) {
    throw new RangeError(`What the party knows of ${kind} has an element twice`);
  }
  return ELEMENTS.filter((element) => elements.includes(element));
}

function checkedPlayTime(ms: number): number {
  if (!(ms >= 0 && Number.isFinite(ms))) throw new RangeError(`Play time can't be ${ms} ms`);
  return ms;
}

function checkedMember(id: string, json: unknown): MemberState {
  const member = fieldsOf(json, `${id}'s member state`);
  const level = numberOf(member.level, `${id}'s level`);
  const exp = numberOf(member.exp, `${id}'s EXP`);
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError(`${id}'s level is ${level}: levels are whole numbers from 1 up`);
  }
  if (!Number.isSafeInteger(exp) || exp < 0) {
    throw new RangeError(`${id}'s EXP is ${exp}: EXP is a whole number from 0 up`);
  }
  const worn = recordOf(member.equipment, `${id}'s equipment`, (slot, item) => [
    slot,
    textOf(item, `${id}'s ${slot}`),
  ]);
  // HP and MP are kept only while they're down; their most is the content's to say.
  const vital = (what: 'hp' | 'mp'): { hp?: number; mp?: number } => {
    if (member[what] === undefined) return {};
    const amount = numberOf(member[what], `${id}'s ${what.toUpperCase()}`);
    return { [what]: checkedVital(id, what.toUpperCase(), amount, Number.MAX_SAFE_INTEGER) };
  };
  return { level, exp, equipment: checkedEquipment(id, worn), ...vital('hp'), ...vital('mp') };
}

/** A copy of what someone has on, checked: items by their IDs, in slots there are. */
function checkedEquipment(id: string, equipment: Readonly<Record<string, string>>): Equipment {
  return Object.fromEntries(
    Object.entries(equipment).map(([slot, item]) => {
      if (!(SLOTS as readonly string[]).includes(slot)) {
        throw new RangeError(`${id} has something in "${slot}", which isn't a slot`);
      }
      return [slot, checkedId('Item', item)];
    }),
  );
}

/** A location's fields, of the right types: `checkedLocation` checks the rest. */
function locationOf(json: unknown): PlayerLocation {
  const at = fieldsOf(json, 'The location');
  const facing = textOf(at.facing, 'The facing');
  if (!isDirection(facing)) throw new RangeError(`"${facing}" isn't a direction`);
  return {
    map: textOf(at.map, 'The map'),
    x: numberOf(at.x, 'The x'),
    y: numberOf(at.y, 'The y'),
    facing,
  };
}

// Reading JSON, which could hold anything: each of these checks it holds what it should.

/** A JSON object's own fields. */
type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(json: unknown, what: string): Fields {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new TypeError(`${what} isn't an object`);
  }
  return json as Fields;
}

function listOf(json: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(json)) throw new TypeError(`${what} isn't a list`);
  return json;
}

function textOf(json: unknown, what: string): string {
  if (typeof json !== 'string') throw new TypeError(`${what} isn't text`);
  return json;
}

function numberOf(json: unknown, what: string): number {
  if (typeof json !== 'number') throw new TypeError(`${what} isn't a number`);
  return json;
}

/** A new record of a JSON object's fields, each checked by `entry`, which returns it as kept. */
function recordOf<T>(
  json: unknown,
  what: string,
  entry: (key: string, value: unknown) => [string, T],
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(fieldsOf(json, what)).map(([key, value]) => entry(key, value)),
  );
}
