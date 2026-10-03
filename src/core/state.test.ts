import { describe, expect, test } from 'vitest';
import {
  MAX_PARTY_SIZE,
  addGold,
  addItem,
  addPlayTime,
  createGameState,
  getVar,
  hasFlag,
  hasItem,
  inParty,
  itemCount,
  joinParty,
  removeGold,
  removeItem,
  setFlag,
  setLocation,
  setVar,
  type GameState,
  type NewGame,
} from './state';

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
      members: { rowan: { level: 1, exp: 0 }, bram: { level: 1, exp: 0 } },
      inventory: { potion: 3 },
      gold: 50,
      flags: {},
      vars: {},
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
    expect(state.members.liora).toEqual({ level: 1, exp: 0 });
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
