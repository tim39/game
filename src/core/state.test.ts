import { describe, expect, test } from 'vitest';
import type { GameDb } from './db';
import type { Element } from './battle/terms';
import type { Equipment } from './equipment';
import type { ExpCurve } from './levels';
import type { CharacterDef } from './schema';
import {
  MAX_PARTY_SIZE,
  addGold,
  addItem,
  addPlayTime,
  checkedGameState,
  createGameState,
  equip,
  gainExp,
  getVar,
  hasFlag,
  hasItem,
  inParty,
  itemCount,
  joinParty,
  leaveParty,
  learnReactions,
  removeGold,
  removeItem,
  restoreParty,
  setFlag,
  setLevel,
  setLocation,
  setVar,
  setVitals,
  unequip,
  type GameState,
  type NewGame,
} from './state';

/** Levels 1 to 5 take 0, 10, 40, 90 and 160 EXP in all. */
const CURVE: ExpCurve = { maxLevel: 5, scale: 10, power: 2 };

/** Someone who fights with `weapon` and wears `armor`. Their stats don't matter here. */
const fighter = (name: string, weapon: CharacterDef['weapon'], armor: CharacterDef['armor']) =>
  ({
    name,
    weapon,
    armor,
    equipment: {},
    skills: [],
    stats: {
      hp: [50, 500],
      mp: [10, 100],
      atk: [10, 100],
      def: [10, 100],
      mag: [10, 100],
      res: [10, 100],
      spd: [10, 30],
    },
  }) satisfies CharacterDef;

/** Rowan with a sword in light armor, Bram with an axe in heavy armor too, and their gear. */
const DB: GameDb = {
  characters: {
    rowan: fighter('Rowan', 'sword', ['light']),
    bram: fighter('Bram', 'axe', ['light', 'heavy']),
  },
  skills: {},
  items: {
    'bronze-sword': {
      name: 'Bronze Sword',
      description: 'A sword.',
      kind: 'weapon',
      weapon: 'sword',
      price: 60,
      stats: { atk: 4 },
    },
    'iron-sword': {
      name: 'Iron Sword',
      description: 'A better sword.',
      kind: 'weapon',
      weapon: 'sword',
      price: 240,
      stats: { atk: 9 },
    },
    'hand-axe': {
      name: 'Hand Axe',
      description: 'An axe.',
      kind: 'weapon',
      weapon: 'axe',
      price: 70,
      stats: { atk: 5 },
    },
    'chain-mail': {
      name: 'Chain Mail',
      description: 'Heavy armor.',
      kind: 'armor',
      armor: 'heavy',
      price: 160,
      stats: { def: 7 },
    },
    'swift-anklet': {
      name: 'Swift Anklet',
      description: 'An accessory.',
      kind: 'accessory',
      price: 300,
      stats: { spd: 2 },
    },
    potion: {
      name: 'Potion',
      description: 'Restores HP.',
      kind: 'consumable',
      price: 25,
      target: 'one-ally',
      effects: [{ type: 'restore', hp: 50 }],
    },
  },
  enemies: {},
};

const START: NewGame = {
  location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
  party: ['rowan'],
};

const start = (overrides: Partial<NewGame> = {}): GameState =>
  createGameState({ ...START, ...overrides });

/** Freezes an object and everything in it, so any attempt to change it throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

describe('createGameState', () => {
  test('starts a game with the party, items and gold it is given, and nothing else', () => {
    const state = start({ party: ['rowan', 'bram'], gold: 50, inventory: { potion: 3 } });
    expect(state).toEqual({
      party: ['rowan', 'bram'],
      members: {
        rowan: { level: 1, exp: 0, equipment: {} },
        bram: { level: 1, exp: 0, equipment: {} },
      },
      inventory: { potion: 3 },
      gold: 50,
      flags: {},
      vars: {},
      knownReactions: {},
      location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
      playTimeMs: 0,
    });
  });

  test('turns down a start that breaks the rules', () => {
    expect(() => start({ party: ['Rowan'] })).toThrow(RangeError);
    expect(() => start({ gold: -1 })).toThrow(RangeError);
    expect(() => start({ inventory: { potion: 0 } })).toThrow(RangeError);
    expect(() => start({ location: { ...START.location, x: 1.5 } })).toThrow(RangeError);
  });

  test('makes plain JSON, so a save keeps every bit of it', () => {
    let state = start({ gold: 12, inventory: { potion: 2 } });
    state = setFlag(state, 'story.beacon-out');
    state = setVar(state, 'saltmere.lamps-lit', 3);
    state = joinParty(state, 'bram');
    state = setVitals(state, 'bram', { hp: 3, mp: 0 }, { hp: 50, mp: 10 });
    state = learnReactions(state, { wolf: ['fire'] });
    state = addPlayTime(state, 16.7);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

test('no operation changes the state it is given', () => {
  const before = deepFreeze(
    setVar(setFlag(start({ gold: 10, inventory: { potion: 2 } }), 'story.a'), 'story.n', 1),
  );
  // A frozen object throws if anything tries to change it, so each of these must copy.
  const after = [
    setFlag(before, 'story.b'),
    setFlag(before, 'story.a', false),
    setVar(before, 'story.n', 2),
    setVar(before, 'story.n', 0),
    addItem(before, 'potion'),
    addItem(before, 'ether'),
    removeItem(before, 'potion'),
    removeItem(before, 'potion', 2),
    addGold(before, 5),
    removeGold(before, 5),
    joinParty(before, 'bram'),
    leaveParty(deepFreeze(joinParty(before, 'bram')), 'bram'),
    gainExp(before, 'rowan', 15, CURVE),
    setLevel(before, 'rowan', 3, CURVE),
    equip(addItem(before, 'iron-sword'), 'rowan', 'iron-sword', DB),
    unequip(joinParty(before, 'bram', { weapon: 'hand-axe' }), 'bram', 'weapon'),
    setVitals(before, 'rowan', { hp: 1, mp: 0 }, { hp: 50, mp: 10 }),
    restoreParty(deepFreeze(setVitals(before, 'rowan', { hp: 1, mp: 0 }, { hp: 50, mp: 10 }))),
    learnReactions(before, { wolf: ['fire'] }),
    setLocation(before, { map: 'test-meadow', x: 1, y: 1, facing: 'up' }),
    addPlayTime(before, 100),
  ];
  for (const state of after) expect(state).not.toBe(before);
});

describe('flags', () => {
  test('are unset until set, and can be cleared again', () => {
    let state = start();
    expect(hasFlag(state, 'story.beacon-out')).toBe(false);
    state = setFlag(state, 'story.beacon-out');
    expect(hasFlag(state, 'story.beacon-out')).toBe(true);
    expect(state.flags).toEqual({ 'story.beacon-out': true });
    state = setFlag(state, 'story.beacon-out', false);
    expect(hasFlag(state, 'story.beacon-out')).toBe(false);
    // Only flags that are set are kept.
    expect(state.flags).toEqual({});
  });

  test('setting one that is already set changes nothing', () => {
    const state = setFlag(start(), 'chest.saltmere-01');
    expect(setFlag(state, 'chest.saltmere-01')).toBe(state);
    expect(setFlag(start(), 'chest.saltmere-01', false)).toEqual(start());
  });

  test('have namespaced kebab-case names', () => {
    expect(() => setFlag(start(), 'beacon-out')).toThrow(RangeError);
    expect(() => setFlag(start(), 'story.beaconOut')).toThrow(RangeError);
    expect(() => hasFlag(start(), 'Story.beacon-out')).toThrow(RangeError);
  });
});

describe('vars', () => {
  test('are 0 until set', () => {
    let state = start();
    expect(getVar(state, 'saltmere.lamps-lit')).toBe(0);
    state = setVar(state, 'saltmere.lamps-lit', 3);
    expect(getVar(state, 'saltmere.lamps-lit')).toBe(3);
    state = setVar(state, 'saltmere.lamps-lit', -2);
    expect(getVar(state, 'saltmere.lamps-lit')).toBe(-2);
    expect(state.vars).toEqual({ 'saltmere.lamps-lit': -2 });
    // Zero is the default, so it isn't kept.
    expect(setVar(state, 'saltmere.lamps-lit', 0).vars).toEqual({});
  });

  test('setting one to the value it has changes nothing', () => {
    const state = setVar(start(), 'saltmere.lamps-lit', 3);
    expect(setVar(state, 'saltmere.lamps-lit', 3)).toBe(state);
  });

  test('hold whole numbers, under namespaced kebab-case names', () => {
    expect(() => setVar(start(), 'saltmere.lamps-lit', 1.5)).toThrow(RangeError);
    expect(() => setVar(start(), 'saltmere.lamps-lit', Number.NaN)).toThrow(RangeError);
    expect(() => setVar(start(), 'lamps-lit', 1)).toThrow(RangeError);
    expect(() => getVar(start(), 'saltmere.LampsLit')).toThrow(RangeError);
  });
});

describe('items', () => {
  test('stack up as they are added, and go once the last is removed', () => {
    let state = start();
    expect(itemCount(state, 'potion')).toBe(0);
    expect(hasItem(state, 'potion')).toBe(false);
    state = addItem(state, 'potion');
    state = addItem(state, 'potion', 2);
    state = addItem(state, 'ether');
    expect(state.inventory).toEqual({ potion: 3, ether: 1 });
    expect(hasItem(state, 'potion', 3)).toBe(true);
    expect(hasItem(state, 'potion', 4)).toBe(false);
    state = removeItem(state, 'potion', 2);
    expect(itemCount(state, 'potion')).toBe(1);
    state = removeItem(state, 'potion');
    expect(state.inventory).toEqual({ ether: 1 });
  });

  test('can’t be removed if the party doesn’t have that many', () => {
    const state = addItem(start(), 'potion', 2);
    expect(() => removeItem(state, 'potion', 3)).toThrow('the party has 2');
    expect(() => removeItem(state, 'ether')).toThrow('the party has 0');
  });

  test('come in whole numbers, with kebab-case IDs', () => {
    for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => addItem(start(), 'potion', count)).toThrow(RangeError);
      expect(() => removeItem(start(), 'potion', count)).toThrow(RangeError);
      expect(() => hasItem(start(), 'potion', count)).toThrow(RangeError);
    }
    expect(() => addItem(start(), 'Potion')).toThrow(RangeError);
    expect(() => itemCount(start(), 'hi_potion')).toThrow(RangeError);
  });

  test('named like a property every object has still count as none', () => {
    expect(itemCount(start(), 'constructor')).toBe(0);
    expect(itemCount(addItem(start(), 'constructor'), 'constructor')).toBe(1);
  });
});

describe('gold', () => {
  test('goes up and down', () => {
    let state = start({ gold: 100 });
    state = addGold(state, 25);
    expect(state.gold).toBe(125);
    state = removeGold(state, 125);
    expect(state.gold).toBe(0);
  });

  test('can’t be spent if the party doesn’t have enough', () => {
    expect(() => removeGold(start({ gold: 10 }), 11)).toThrow('the party has 10');
  });

  test('comes in whole amounts, and an amount of nothing changes nothing', () => {
    const state = start({ gold: 10 });
    expect(addGold(state, 0)).toBe(state);
    expect(removeGold(state, 0)).toBe(state);
    for (const amount of [-1, 2.5, Number.NaN]) {
      expect(() => addGold(state, amount)).toThrow(RangeError);
      expect(() => removeGold(state, amount)).toThrow(RangeError);
    }
  });
});

describe('the party', () => {
  test('grows in the order people join, each starting at level 1', () => {
    let state = start();
    expect(inParty(state, 'bram')).toBe(false);
    state = joinParty(state, 'bram');
    state = joinParty(state, 'liora');
    expect(state.party).toEqual(['rowan', 'bram', 'liora']);
    expect(inParty(state, 'bram')).toBe(true);
    expect(state.members.liora).toEqual({ level: 1, exp: 0, equipment: {} });
  });

  test('can be joined wearing something, in slots there are, by item IDs', () => {
    const state = joinParty(start(), 'bram', { weapon: 'hand-axe', armor: 'chain-mail' });
    expect(state.members.bram).toEqual({
      level: 1,
      exp: 0,
      equipment: { weapon: 'hand-axe', armor: 'chain-mail' },
    });
    // What someone joins wearing doesn't come out of the inventory.
    expect(state.inventory).toEqual({});
    const cape = { cape: 'red-cape' } as Equipment;
    expect(() => joinParty(start(), 'bram', cape)).toThrow('"cape", which isn\'t a slot');
    expect(() => joinParty(start(), 'bram', { weapon: 'Hand Axe' })).toThrow(RangeError);
  });

  test('can be left, and whoever leaves joins afresh if they join again', () => {
    const leveled = gainExp(joinParty(start(), 'bram', { weapon: 'hand-axe' }), 'bram', 95, CURVE);
    const left = leaveParty(leveled, 'bram');
    expect(left.party).toEqual(['rowan']);
    expect(left.members).not.toHaveProperty('bram');
    expect(joinParty(left, 'bram').members.bram).toEqual({ level: 1, exp: 0, equipment: {} });
    // Someone not in it can't leave it, and the last one can't.
    expect(leaveParty(left, 'bram')).toBe(left);
    expect(() => leaveParty(left, 'rowan')).toThrow("rowan can't leave: the party would be empty");
  });

  test('someone who is already in it can’t join twice', () => {
    const state = joinParty(start(), 'bram');
    expect(joinParty(state, 'bram')).toBe(state);
    expect(joinParty(state, 'rowan')).toBe(state);
  });

  test(`holds ${MAX_PARTY_SIZE} at most`, () => {
    const full = start({ party: ['rowan', 'bram', 'liora', 'cass'] });
    expect(full.party).toHaveLength(MAX_PARTY_SIZE);
    expect(() => joinParty(full, 'vesh')).toThrow('the party is full');
  });

  test('has members with kebab-case IDs', () => {
    expect(() => joinParty(start(), 'Bram')).toThrow(RangeError);
    expect(() => inParty(start(), 'old bram')).toThrow(RangeError);
  });
});

describe('EXP', () => {
  test('adds up, and levels a member up as far as it reaches', () => {
    let state = gainExp(start(), 'rowan', 9, CURVE);
    expect(state.members.rowan).toMatchObject({ level: 1, exp: 9 });
    state = gainExp(state, 'rowan', 1, CURVE);
    expect(state.members.rowan).toMatchObject({ level: 2, exp: 10 });
    // 95 in all: past level 3 at 40 and level 4 at 90, at once.
    state = gainExp(state, 'rowan', 85, CURVE);
    expect(state.members.rowan).toMatchObject({ level: 4, exp: 95 });
  });

  test('stops levelling at the last level, but still counts', () => {
    expect(gainExp(start(), 'rowan', 1000, CURVE).members.rowan).toMatchObject({
      level: 5,
      exp: 1000,
    });
  });

  test('goes to one member, leaving the others as they were', () => {
    const state = gainExp(start({ party: ['rowan', 'bram'] }), 'bram', 50, CURVE);
    expect(state.members).toEqual({
      rowan: { level: 1, exp: 0, equipment: {} },
      bram: { level: 3, exp: 50, equipment: {} },
    });
  });

  test('leaves what a member has on as it was', () => {
    const state = joinParty(start(), 'bram', { weapon: 'hand-axe' });
    expect(gainExp(state, 'bram', 10, CURVE).members.bram?.equipment).toEqual({
      weapon: 'hand-axe',
    });
  });

  test('comes in whole amounts, to members of the party, and none changes nothing', () => {
    const state = start();
    expect(gainExp(state, 'rowan', 0, CURVE)).toBe(state);
    expect(() => gainExp(state, 'bram', 5, CURVE)).toThrow("bram can't gain EXP");
    expect(() => gainExp(state, 'Rowan', 5, CURVE)).toThrow(RangeError);
    for (const amount of [-1, 1.5, Number.NaN]) {
      expect(() => gainExp(state, 'rowan', amount, CURVE)).toThrow(RangeError);
    }
  });
});

describe('setting a level', () => {
  test('puts a member at it, with all the EXP it takes, up or down', () => {
    let state = setLevel(start(), 'rowan', 4, CURVE);
    expect(state.members.rowan).toEqual({ level: 4, exp: 90, equipment: {} });
    state = setLevel(gainExp(state, 'rowan', 30, CURVE), 'rowan', 2, CURVE);
    expect(state.members.rowan).toEqual({ level: 2, exp: 10, equipment: {} });
    expect(setLevel(state, 'rowan', 1, CURVE).members.rowan).toMatchObject({ level: 1, exp: 0 });
    expect(setLevel(state, 'rowan', 5, CURVE).members.rowan).toMatchObject({ level: 5, exp: 160 });
  });

  test('leaves gear, HP and MP and the rest of the party as they were', () => {
    let state = joinParty(start(), 'bram', { weapon: 'hand-axe' });
    state = setVitals(state, 'bram', { hp: 5, mp: 3 }, { hp: 50, mp: 10 });
    expect(setLevel(state, 'bram', 3, CURVE).members).toEqual({
      rowan: { level: 1, exp: 0, equipment: {} },
      bram: { level: 3, exp: 40, equipment: { weapon: 'hand-axe' }, hp: 5, mp: 3 },
    });
  });

  test('to the level a member is at, with its EXP, changes nothing', () => {
    const state = setLevel(start(), 'rowan', 3, CURVE);
    expect(setLevel(state, 'rowan', 3, CURVE)).toBe(state);
    // EXP partway to the next level is brought back to what this one takes.
    const partway = gainExp(state, 'rowan', 5, CURVE);
    expect(setLevel(partway, 'rowan', 3, CURVE).members.rowan).toMatchObject({ exp: 40 });
  });

  test('takes levels there are, for members of the party', () => {
    for (const level of [0, 6, 2.5, Number.NaN]) {
      expect(() => setLevel(start(), 'rowan', level, CURVE)).toThrow(RangeError);
    }
    expect(() => setLevel(start(), 'bram', 2, CURVE)).toThrow(
      "bram can't change level: they aren't in the party",
    );
  });
});

describe('equipment', () => {
  /** Rowan in a Bronze Sword, with an Iron Sword and an Anklet to put on, and Bram. */
  const kitted = (): GameState => {
    let state = createGameState({ ...START, party: [] });
    state = joinParty(state, 'rowan', { weapon: 'bronze-sword' });
    state = joinParty(state, 'bram');
    state = addItem(state, 'iron-sword');
    return addItem(addItem(state, 'swift-anklet'), 'chain-mail');
  };

  test('goes on from the inventory, and what was in its slot goes back', () => {
    const state = equip(kitted(), 'rowan', 'iron-sword', DB);
    expect(state.members.rowan?.equipment).toEqual({ weapon: 'iron-sword' });
    expect(state.inventory).toEqual({ 'bronze-sword': 1, 'swift-anklet': 1, 'chain-mail': 1 });
  });

  test('fills an empty slot, the one it goes in', () => {
    const state = equip(equip(kitted(), 'bram', 'chain-mail', DB), 'bram', 'swift-anklet', DB);
    expect(state.members.bram?.equipment).toEqual({
      armor: 'chain-mail',
      accessory: 'swift-anklet',
    });
    expect(state.inventory).toEqual({ 'iron-sword': 1 });
  });

  test('only goes on someone who can wear it, and anyone can wear an accessory', () => {
    const state = addItem(kitted(), 'hand-axe');
    expect(() => equip(state, 'rowan', 'hand-axe', DB)).toThrow("Rowan can't equip Hand Axe");
    expect(() => equip(state, 'rowan', 'chain-mail', DB)).toThrow("Rowan can't equip Chain Mail");
    expect(() => equip(state, 'bram', 'iron-sword', DB)).toThrow("Bram can't equip Iron Sword");
    expect(equip(state, 'bram', 'hand-axe', DB).members.bram?.equipment).toEqual({
      weapon: 'hand-axe',
    });
    expect(equip(state, 'rowan', 'swift-anklet', DB).members.rowan?.equipment).toEqual({
      weapon: 'bronze-sword',
      accessory: 'swift-anklet',
    });
  });

  test('has to be equipment the party has, going on a member of the party', () => {
    const state = addItem(kitted(), 'potion');
    expect(() => equip(state, 'rowan', 'potion', DB)).toThrow("Potion isn't equipment");
    expect(() => equip(state, 'bram', 'hand-axe', DB)).toThrow(
      "Can't remove 1 hand-axe: the party has 0",
    );
    expect(() => equip(state, 'rowan', 'excalibur', DB)).toThrow(
      "There's no item called excalibur",
    );
    expect(() => equip(state, 'liora', 'iron-sword', DB)).toThrow(
      "liora can't equip anything: they aren't in the party",
    );
  });

  test('comes off back into the inventory, and an empty slot changes nothing', () => {
    const state = unequip(kitted(), 'rowan', 'weapon');
    expect(state.members.rowan?.equipment).toEqual({});
    expect(state.inventory).toMatchObject({ 'bronze-sword': 1 });
    expect(unequip(state, 'rowan', 'weapon')).toBe(state);
    expect(() => unequip(state, 'liora', 'weapon')).toThrow("liora can't take anything off");
  });
});

describe('HP and MP', () => {
  /** The most HP and MP a member has: their level's and their gear's, which isn't this file's. */
  const MOST = { hp: 50, mp: 10 };

  test('are kept while a member is down from their most, and at their most they are full', () => {
    let state = setVitals(start(), 'rowan', { hp: 20, mp: 10 }, MOST);
    expect(state.members.rowan).toEqual({ level: 1, exp: 0, equipment: {}, hp: 20 });
    state = setVitals(state, 'rowan', { hp: 50, mp: 0 }, MOST);
    expect(state.members.rowan).toEqual({ level: 1, exp: 0, equipment: {}, mp: 0 });
    // Full is kept as nothing, so it stays full when a level or gear raises their most.
    state = setVitals(state, 'rowan', MOST, MOST);
    expect(state.members.rowan).toEqual({ level: 1, exp: 0, equipment: {} });
  });

  test('stay as they are while a member gains EXP or changes gear', () => {
    let state = joinParty(start(), 'bram', { weapon: 'hand-axe' });
    state = setVitals(state, 'bram', { hp: 5, mp: 3 }, MOST);
    expect(gainExp(state, 'bram', 10, CURVE).members.bram).toMatchObject({
      level: 2,
      hp: 5,
      mp: 3,
    });
    expect(unequip(state, 'bram', 'weapon').members.bram).toEqual({
      level: 1,
      exp: 0,
      equipment: {},
      hp: 5,
      mp: 3,
    });
  });

  test('all come back in a rest, and a party that is full already changes nothing', () => {
    let state = start({ party: ['rowan', 'bram'] });
    expect(restoreParty(state)).toBe(state);
    state = setVitals(state, 'rowan', { hp: 0, mp: 10 }, MOST);
    state = setVitals(state, 'bram', { hp: 50, mp: 2 }, MOST);
    expect(restoreParty(state).members).toEqual({
      rowan: { level: 1, exp: 0, equipment: {} },
      bram: { level: 1, exp: 0, equipment: {} },
    });
  });

  test('are whole numbers from 0 to the most, for members of the party', () => {
    for (const hp of [-1, 51, 2.5, Number.NaN]) {
      expect(() => setVitals(start(), 'rowan', { hp, mp: 0 }, MOST)).toThrow(RangeError);
    }
    expect(() => setVitals(start(), 'rowan', { hp: 0, mp: 11 }, MOST)).toThrow(
      "rowan can't have 11 MP: from 0 to 10",
    );
    expect(() => setVitals(start(), 'bram', MOST, MOST)).toThrow(
      "bram can't have HP and MP: they aren't in the party",
    );
  });
});

describe('what the party knows of enemies', () => {
  test('grows as the party learns, in the order of the elements', () => {
    let state = learnReactions(start(), { wolf: ['wind', 'fire'] });
    expect(state.knownReactions).toEqual({ wolf: ['fire', 'wind'] });
    state = learnReactions(state, { wolf: ['earth', 'fire'], 'cave-bat': ['gloam'] });
    expect(state.knownReactions).toEqual({
      wolf: ['fire', 'wind', 'earth'],
      'cave-bat': ['gloam'],
    });
  });

  test('changes nothing when the party learns nothing new', () => {
    const state = learnReactions(start(), { wolf: ['fire'] });
    expect(learnReactions(state, { wolf: ['fire'] })).toBe(state);
    expect(learnReactions(state, { wolf: [], 'cave-bat': [] })).toBe(state);
    expect(learnReactions(state, {})).toBe(state);
  });

  test('is of elements there are, about enemies with kebab-case IDs', () => {
    const ice = ['ice'] as unknown as Element[];
    expect(() => learnReactions(start(), { wolf: ice })).toThrow('"ice", which isn\'t an element');
    expect(() => learnReactions(start(), { wolf: ['fire', 'fire'] })).toThrow('an element twice');
    expect(() => learnReactions(start(), { Wolf: ['fire'] })).toThrow("isn't kebab-case");
  });
});

describe('the location', () => {
  test('moves the player', () => {
    const state = setLocation(start(), { map: 'test-meadow', x: 0, y: 7, facing: 'right' });
    expect(state.location).toEqual({ map: 'test-meadow', x: 0, y: 7, facing: 'right' });
    const turned = setLocation(state, { ...state.location, facing: 'up' });
    expect(turned.location).toEqual({ map: 'test-meadow', x: 0, y: 7, facing: 'up' });
  });

  test('changes nothing if the player is already there, facing that way', () => {
    const state = start();
    expect(setLocation(state, { ...START.location })).toBe(state);
  });

  test('keeps only the map, the cell and the facing', () => {
    const arrival = { map: 'test-meadow', x: 3, y: 4, facing: 'left' as const, spawn: 'west' };
    expect(setLocation(start(), arrival).location).toEqual({
      map: 'test-meadow',
      x: 3,
      y: 4,
      facing: 'left',
    });
  });

  test('is a real cell on a map with a kebab-case ID', () => {
    const at = START.location;
    expect(() => setLocation(start(), { ...at, map: 'Test Shore' })).toThrow(RangeError);
    expect(() => setLocation(start(), { ...at, x: -1 })).toThrow(RangeError);
    expect(() => setLocation(start(), { ...at, y: 2.5 })).toThrow(RangeError);
    const sideways = { ...at, facing: 'sideways' } as unknown as typeof at;
    expect(() => setLocation(start(), sideways)).toThrow(RangeError);
  });
});

describe('play time', () => {
  test('adds up', () => {
    let state = start();
    state = addPlayTime(state, 16.5);
    state = addPlayTime(state, 1000);
    expect(state.playTimeMs).toBe(1016.5);
  });

  test('only goes forward', () => {
    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => addPlayTime(start(), ms)).toThrow(RangeError);
    }
  });
});

describe('checkedGameState', () => {
  /** A state with something in every field, as JSON would give it back. */
  const full = (): GameState => {
    let state = start({ party: ['rowan', 'bram'], gold: 75, inventory: { potion: 2 } });
    state = setFlag(state, 'chest.saltmere-tamsin-01');
    state = setVar(state, 'saltmere.lamps-lit', -3);
    state = setVitals(state, 'bram', { hp: 12, mp: 0 }, { hp: 60, mp: 8 });
    state = learnReactions(state, { wolf: ['fire', 'gloam'] });
    state = addPlayTime(state, 1234.5);
    return JSON.parse(JSON.stringify(state)) as GameState;
  };

  /** `full()` with one field changed, the way a damaged save might have it. */
  const broken = (change: (state: Record<string, unknown>) => void): unknown => {
    const state = full() as unknown as Record<string, unknown>;
    change(state);
    return state;
  };

  test('reads back any state the operations make, as a copy', () => {
    for (const state of [start(), full()]) {
      const checked = checkedGameState(state);
      expect(checked).toEqual(state);
      expect(checked).not.toBe(state);
      expect(checked.location).not.toBe(state.location);
    }
  });

  test('keeps a state’s own fields, and nothing else that came along with them', () => {
    const extra = broken((state) => {
      state.cheats = true;
      state.location = { ...full().location, spawn: 'door' };
      state.members = {
        ...full().members,
        rowan: { level: 1, exp: 0, equipment: {}, mood: 'sunny' },
      };
    });
    expect(checkedGameState(extra)).toEqual(full());
  });

  test('puts what the party knows of an enemy in the order of the elements', () => {
    const unsorted = broken((state) => (state.knownReactions = { wolf: ['gloam', 'fire'] }));
    expect(checkedGameState(unsorted).knownReactions).toEqual({ wolf: ['fire', 'gloam'] });
  });

  test('turns down anything that isn’t a game state', () => {
    for (const json of [null, 'state', 42, [], [full()]]) {
      expect(() => checkedGameState(json)).toThrow("The game state isn't an object");
    }
  });

  test.each<[string, (state: Record<string, unknown>) => void, string]>([
    ['no party', (s) => delete s.party, "The party isn't a list"],
    ['a party member who isn’t text', (s) => (s.party = ['rowan', 7]), "isn't text"],
    ['a party member with a bad ID', (s) => (s.party = ['Rowan']), "isn't kebab-case"],
    ['someone in the party twice', (s) => (s.party = ['rowan', 'rowan']), 'in the party twice'],
    ['five in the party', (s) => (s.party = ['a', 'b', 'c', 'd', 'e']), 'holds 4'],
    [
      'a member with no level',
      (s) => (s.members = { ...full().members, rowan: {} }),
      "rowan's level",
    ],
    ['no members', (s) => (s.members = null), "The members isn't an object"],
    [
      'a member with no EXP',
      (s) => (s.members = { ...full().members, bram: { level: 1 } }),
      "bram's EXP isn't",
    ],
    [
      'level 0',
      (s) => (s.members = { ...full().members, bram: { level: 0, exp: 0 } }),
      'from 1 up',
    ],
    [
      'negative EXP',
      (s) => (s.members = { ...full().members, bram: { level: 2, exp: -1 } }),
      'from 0 up',
    ],
    [
      'bram missing from members',
      (s) => (s.members = { rowan: { level: 1, exp: 0, equipment: {} } }),
      "bram is in the party, but isn't a member",
    ],
    [
      'a member with no equipment',
      (s) => (s.members = { ...full().members, bram: { level: 1, exp: 0 } }),
      "bram's equipment isn't an object",
    ],
    [
      'something in a slot there isn’t',
      (s) =>
        (s.members = { ...full().members, bram: { level: 1, exp: 0, equipment: { cape: 'x' } } }),
      '"cape", which isn\'t a slot',
    ],
    [
      'equipment that isn’t an item ID',
      (s) =>
        (s.members = { ...full().members, bram: { level: 1, exp: 0, equipment: { weapon: 3 } } }),
      "bram's weapon isn't text",
    ],
    [
      'negative HP',
      (s) => (s.members = { ...full().members, bram: { level: 1, exp: 0, equipment: {}, hp: -1 } }),
      "bram can't have -1 HP",
    ],
    [
      'MP as text',
      (s) =>
        (s.members = { ...full().members, bram: { level: 1, exp: 0, equipment: {}, mp: '3' } }),
      "bram's MP isn't a number",
    ],
    [
      'fractional MP',
      (s) =>
        (s.members = { ...full().members, bram: { level: 1, exp: 0, equipment: {}, mp: 1.5 } }),
      "bram can't have 1.5 MP",
    ],
    ['a list of items', (s) => (s.inventory = ['potion']), "The inventory isn't an object"],
    ['none of an item', (s) => (s.inventory = { potion: 0 }), 'from 1 up, not 0'],
    [
      'a count as text',
      (s) => (s.inventory = { potion: '2' }),
      "The count of potion isn't a number",
    ],
    ['an item with a bad ID', (s) => (s.inventory = { 'Hi Potion': 1 }), "isn't kebab-case"],
    ['gold as text', (s) => (s.gold = '75'), "Gold isn't a number"],
    ['negative gold', (s) => (s.gold = -5), 'from 0 up, not -5'],
    ['fractional gold', (s) => (s.gold = 2.5), 'from 0 up, not 2.5'],
    [
      'a flag that isn’t set',
      (s) => (s.flags = { 'story.beacon-out': false }),
      'set flags are true',
    ],
    ['a flag that isn’t namespaced', (s) => (s.flags = { 'beacon-out': true }), 'namespaced'],
    ['a var of 0', (s) => (s.vars = { 'saltmere.lamps-lit': 0 }), 'and not 0'],
    ['a fractional var', (s) => (s.vars = { 'saltmere.lamps-lit': 0.5 }), 'whole numbers'],
    ['a var as text', (s) => (s.vars = { 'saltmere.lamps-lit': '3' }), "isn't a number"],
    [
      'nothing known of enemies',
      (s) => delete s.knownReactions,
      "What the party knows of enemies isn't an object",
    ],
    [
      'an enemy with a bad ID',
      (s) => (s.knownReactions = { Wolf: ['fire'] }),
      'Enemy ID "Wolf" isn\'t kebab-case',
    ],
    [
      'reactions that aren’t a list',
      (s) => (s.knownReactions = { wolf: 'fire' }),
      "What the party knows of wolf isn't a list",
    ],
    [
      'an element that isn’t text',
      (s) => (s.knownReactions = { wolf: [3] }),
      "An element wolf takes isn't text",
    ],
    [
      'an element there isn’t',
      (s) => (s.knownReactions = { wolf: ['ice'] }),
      '"ice", which isn\'t an element',
    ],
    ['an element twice', (s) => (s.knownReactions = { wolf: ['fire', 'fire'] }), 'twice'],
    ['no location', (s) => delete s.location, "The location isn't an object"],
    [
      'a map with a bad ID',
      (s) => (s.location = { ...full().location, map: 'Test Shore' }),
      "isn't kebab-case",
    ],
    ['a cell off the map', (s) => (s.location = { ...full().location, x: -1 }), "isn't a cell"],
    [
      'a cell as text',
      (s) => (s.location = { ...full().location, y: '5' }),
      "The y isn't a number",
    ],
    [
      'facing sideways',
      (s) => (s.location = { ...full().location, facing: 'sideways' }),
      "isn't a direction",
    ],
    ['play time as text', (s) => (s.playTimeMs = '1000'), "Play time isn't a number"],
    ['negative play time', (s) => (s.playTimeMs = -1), "Play time can't be -1 ms"],
    ['endless play time', (s) => (s.playTimeMs = Number.POSITIVE_INFINITY), "can't be Infinity"],
  ])('turns down %s', (_name, change, message) => {
    expect(() => checkedGameState(broken(change))).toThrow(message);
  });
});
