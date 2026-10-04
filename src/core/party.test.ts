import { describe, expect, test } from 'vitest';
import type { GameDb } from './db';
import { knownSkills, memberStats, recruit, startGame } from './party';
import type { CharacterDef } from './schema';
import { addItem, equip, gainExp, setFlag, type NewGame } from './state';

/** Every stat 10 at level 1 and 39 at level 30: one a level. */
const EVEN: CharacterDef['stats'] = {
  hp: [10, 39],
  mp: [10, 39],
  atk: [10, 39],
  def: [10, 39],
  mag: [10, 39],
  res: [10, 39],
  spd: [10, 39],
};

const DB: GameDb = {
  characters: {
    rowan: {
      name: 'Rowan',
      stats: EVEN,
      weapon: 'sword',
      armor: ['light'],
      equipment: { weapon: 'bronze-sword', armor: 'vest' },
      skills: [
        { skill: 'sweep', level: 3 },
        { skill: 'tide-edge', flag: 'story.tide-spark' },
        { skill: 'focus', level: 6 },
      ],
    },
    bram: {
      name: 'Bram',
      stats: EVEN,
      weapon: 'axe',
      armor: ['heavy'],
      equipment: {},
      skills: [{ skill: 'shield-bash', level: 1 }],
    },
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
    vest: {
      name: 'Vest',
      description: 'Light armor.',
      kind: 'armor',
      armor: 'light',
      price: 30,
      stats: { def: 2, spd: -1 },
    },
    anklet: {
      name: 'Anklet',
      description: 'An accessory.',
      kind: 'accessory',
      price: 300,
      stats: { spd: 2 },
    },
  },
  enemies: {},
};

const NEW_GAME: NewGame = {
  location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
  party: ['rowan', 'bram'],
  gold: 20,
};

const CURVE = { maxLevel: 30, scale: 10, power: 2 };

describe('startGame', () => {
  test('starts the party wearing the gear their characters start with', () => {
    const state = startGame(NEW_GAME, DB);
    expect(state.party).toEqual(['rowan', 'bram']);
    expect(state.members).toEqual({
      rowan: { level: 1, exp: 0, equipment: { weapon: 'bronze-sword', armor: 'vest' } },
      bram: { level: 1, exp: 0, equipment: {} },
    });
    // Starting gear isn't taken from the inventory, and the rest of the start is as it says.
    expect(state).toMatchObject({ inventory: {}, gold: 20, location: NEW_GAME.location });
  });

  test('turns down a party member who is not a character', () => {
    expect(() => startGame({ ...NEW_GAME, party: ['rowan', 'vesh'] }, DB)).toThrow(
      "There's no character called vesh",
    );
  });
});

test('recruit adds someone to the party in their starting gear', () => {
  const state = recruit(startGame({ ...NEW_GAME, party: ['bram'] }, DB), 'rowan', DB);
  expect(state.party).toEqual(['bram', 'rowan']);
  expect(state.members.rowan?.equipment).toEqual({ weapon: 'bronze-sword', armor: 'vest' });
});

describe('memberStats', () => {
  test('are a member’s level’s, with their equipment’s bonuses', () => {
    let state = startGame(NEW_GAME, DB);
    // At level 1, every stat is 10; the sword adds 4 ATK, the vest 2 DEF and 1 less SPD.
    expect(memberStats(state, 'rowan', DB)).toEqual({
      hp: 10,
      mp: 10,
      atk: 14,
      def: 12,
      mag: 10,
      res: 10,
      spd: 9,
    });
    // At level 3 every stat is 12, and an anklet adds 2 SPD.
    state = equip(addItem(gainExp(state, 'rowan', 40, CURVE), 'anklet'), 'rowan', 'anklet', DB);
    expect(memberStats(state, 'rowan', DB)).toMatchObject({ atk: 16, def: 14, spd: 13 });
    expect(memberStats(state, 'bram', DB)).toMatchObject({ atk: 10, def: 10, spd: 10 });
  });

  test('are only for members of the party', () => {
    expect(() => memberStats(startGame(NEW_GAME, DB), 'liora', DB)).toThrow(
      "liora isn't in the party",
    );
  });
});

describe('knownSkills', () => {
  test('are those of a member’s level and below, and those whose flag is set, in order', () => {
    let state = startGame(NEW_GAME, DB);
    expect(knownSkills(state, 'rowan', DB)).toEqual([]);
    expect(knownSkills(state, 'bram', DB)).toEqual(['shield-bash']);
    state = gainExp(state, 'rowan', 40, CURVE); // level 3
    expect(knownSkills(state, 'rowan', DB)).toEqual(['sweep']);
    state = setFlag(state, 'story.tide-spark');
    expect(knownSkills(state, 'rowan', DB)).toEqual(['sweep', 'tide-edge']);
    state = gainExp(state, 'rowan', 210, CURVE); // level 6
    expect(knownSkills(state, 'rowan', DB)).toEqual(['sweep', 'tide-edge', 'focus']);
  });
});
