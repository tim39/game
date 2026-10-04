import { describe, expect, test } from 'vitest';
import type { MapContent, MapDef } from '../src/core/map/types';
import type { NewGame } from '../src/core/state';
import { CHARACTERS } from '../src/data/characters';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { MAPS } from '../src/data/maps';
import { NEW_GAME } from '../src/data/new-game';
import { SPEAKERS } from '../src/data/speakers';
import { MAP_CONTENT, PREFABS, TERRAINS } from '../src/data/terrain';
import { checkContent, checkNewGame, type ContentSources } from './content-checks';

describe('checkContent', () => {
  /** A map with one of every kind of object, all well-formed. */
  const TOWN = {
    id: 'town',
    name: 'Town',
    music: 'bgm.town',
    terrain: '...',
    legend: { '.': 'grass' },
    objects: [
      { type: 'prefab', prefab: 'door', at: [0, 0], to: { map: 'town', spawn: 'start' } },
      { type: 'warp', at: [1, 0], to: { map: 'town', spawn: 'start' } },
      { type: 'spawn', id: 'start', at: [2, 0], facing: 'down' },
      { type: 'npc', id: 'ada', sprite: 'ada', at: [0, 1], facing: 'left', wander: 2 },
      { type: 'touch', at: [1, 1], script: 'town/ada', when: '!story.met-ada' },
      { type: 'enter', script: 'town/ada' },
      { type: 'auto', script: 'town/ada', when: ['story.met-ada', '!story.waved'] },
      { type: 'chest', at: [2, 1], flag: 'chest.town-01', item: 'potion' },
      { type: 'chest', at: [2, 2], flag: 'chest.town-02', gold: 30 },
    ],
    edges: { east: { map: 'town', spawn: 'start' } },
  };

  const ROWAN = {
    name: 'Rowan',
    stats: {
      hp: [60, 900],
      mp: [12, 110],
      atk: [12, 115],
      def: [9, 85],
      mag: [7, 70],
      res: [7, 70],
      spd: [11, 28],
    },
  };

  const VALID = {
    characters: { rowan: ROWAN },
    items: { potion: { name: 'Potion' } },
    speakers: { ada: { name: 'Ada', portrait: 'portrait.ada' }, sign: { name: '' } },
    terrains: {
      grass: {
        kind: 'fill',
        sheet: 'tiles.grass',
        tiles: [
          [0, 0],
          [1, 0, 3],
        ],
      },
      water: {
        kind: 'blob',
        sheet: 'tiles.water',
        origin: [0, 1],
        layout: [
          [0, 0, ''],
          [1, 0, 'E'],
          [0, -1, 'N NE E SE S SW W NW'],
        ],
        solid: true,
      },
      trees: { kind: 'trees', ground: 'grass', trees: ['oak'], filler: 'bush' },
    },
    prefabs: {
      oak: { sheet: 'tiles.grass', origin: [0, 0], layout: ['^^', '##'] },
      door: { sheet: 'tiles.grass', origin: [2, 0], layout: ['D'] },
    },
    maps: { town: TOWN },
    events: { 'town/ada': async () => {} },
    newGame: {
      location: { map: 'town', x: 2, y: 0, facing: 'down' },
      party: ['rowan'],
      gold: 10,
      inventory: { potion: 2 },
    },
  } satisfies ContentSources;

  /** The valid content, with one collection swapped for another. */
  const check = (changes: Partial<ContentSources>): string[] =>
    checkContent({ ...VALID, ...changes });

  /** The town, with one of its objects changed. */
  const townWith = (index: number, object: Record<string, unknown>) => ({
    town: { ...TOWN, objects: TOWN.objects.map((old, i) => (i === index ? object : old)) },
  });

  test('passes content that matches its schemas', () => {
    expect(check({})).toEqual([]);
  });

  test('reports IDs that are not kebab-case, of things and inside them', () => {
    expect(
      check({
        items: { Potion: { name: 'Potion' } },
        events: { 'town/Ada': VALID.events['town/ada'] },
        maps: townWith(3, { ...TOWN.objects[3], id: 'Ada' }),
      }),
    ).toEqual([
      `Item "Potion" isn't kebab-case, like tide-caves-b1`,
      `Map town: objects[3].id "Ada" isn't kebab-case, like tide-caves-b1`,
      `Event "town/Ada" isn't an event script's ID, like saltmere/tamsin`,
    ]);
  });

  test('reports fields that are missing, of the wrong type, or unknown', () => {
    expect(
      check({
        items: { potion: {}, ether: { name: 3 } },
        speakers: { ada: { name: 'Ada', portrait: 'Ada.png' } },
        maps: townWith(3, { ...TOWN.objects[3], wnader: 2 }),
      }),
    ).toEqual([
      'Item potion: name is missing',
      'Item ether: name should be text, not 3',
      `Speaker ada: portrait "Ada.png" isn't an asset key, like tiles.floor`,
      "Map town: objects[3] has a field it shouldn't: wnader",
    ]);
  });

  test('reports numbers out of range, empty names and lists of the wrong length', () => {
    expect(
      check({
        items: { potion: { name: '' }, ether: { name: 'Ether ' } },
        terrains: { ...VALID.terrains, grass: { ...VALID.terrains.grass, tiles: [[0, 0, 0]] } },
        maps: townWith(3, { ...TOWN.objects[3], at: [1.5, -1, 0] }),
        newGame: { ...VALID.newGame, party: ['a', 'b', 'c', 'd', 'e'], inventory: { potion: 0 } },
      }),
    ).toEqual([
      'Item potion: name is empty',
      'Item ether: name "Ether " starts or ends with a space',
      'Terrain grass: tiles[0][2] should be at least 1, not 0',
      'Map town: objects[3].at should have at most 2 entries, not 3',
      'Map town: objects[3].at[0] should be a whole number, not 1.5',
      'Map town: objects[3].at[1] should be at least 0, not -1',
      'The new game: party should have at most 4 entries, not 5',
      'The new game: inventory.potion should be at least 1, not 0',
    ]);
  });

  test('reports things of a kind or with a value there is no such thing as', () => {
    expect(
      check({
        terrains: { ...VALID.terrains, grass: { sheet: 'tiles.grass', tiles: [[0, 0]] } },
        maps: {
          town: {
            ...TOWN,
            legend: { '..': 'grass' },
            objects: [
              { type: 'door', at: [0, 0] },
              { ...TOWN.objects[2], facing: 'north' },
              { at: [0, 0] },
            ],
            edges: { up: { map: 'town', spawn: 'start' } },
          },
        },
      }),
    ).toEqual([
      'Terrain grass: kind is missing; it should be one of "fill", "blob", "trees"',
      'Map town: legend key ".." should have exactly 1 character',
      'Map town: objects[0].type should be one of "prefab", "warp", "spawn", "npc", "touch", ' +
        '"enter", "auto", "chest", not "door"',
      'Map town: objects[1].facing should be one of "up", "down", "left", "right", not "north"',
      'Map town: objects[2].type is missing; it should be one of "prefab", "warp", "spawn", ' +
        '"npc", "touch", "enter", "auto", "chest"',
      "Map town: edges has a field it shouldn't: up",
    ]);
  });

  test('reports conditions that are not flags', () => {
    const touch = TOWN.objects[4];
    const auto = TOWN.objects[6];
    const conditions = (touchWhen: unknown, autoWhen: unknown) => ({
      town: {
        ...TOWN,
        objects: [
          { ...touch, when: touchWhen },
          { ...auto, when: autoWhen },
        ],
      },
    });
    expect(check({ maps: conditions('beacon-out', ['story.met-ada', 'Waved']) })).toEqual([
      `Map town: objects[0].when "beacon-out" isn't a flag, or a flag with ! before it, like !story.beacon-out`,
      `Map town: objects[1].when[1] "Waved" isn't a flag, or a flag with ! before it, like !story.beacon-out`,
    ]);
    expect(check({ maps: conditions(3, []) })).toEqual([
      'Map town: objects[0].when should be text or a list, not 3',
      'Map town: objects[1].when is empty',
    ]);
    // An auto trigger can't do without one.
    expect(check({ maps: conditions(undefined, undefined) })).toEqual([
      'Map town: objects[1].when is missing',
    ]);
  });

  test('reports chests that hold both an item and gold, or neither, and chest flags', () => {
    const chest = { type: 'chest', at: [2, 1], flag: 'chest.town-01' };
    expect(
      check({
        maps: {
          town: {
            ...TOWN,
            objects: [
              { ...chest, item: 'potion', gold: 5 },
              chest,
              { ...chest, flag: 'story.town-01', gold: 5 },
            ],
          },
        },
      }),
    ).toEqual([
      'Map town: objects[0] should hold an item or some gold: one or the other',
      'Map town: objects[1] should hold an item or some gold: one or the other',
      `Map town: objects[2].flag "story.town-01" isn't a chest's flag, like chest.saltmere-01`,
    ]);
  });

  test('reports blob and prefab layouts that cannot be used', () => {
    const water = VALID.terrains.water;
    expect(
      check({
        terrains: {
          ...VALID.terrains,
          water: { ...water, layout: [...water.layout, [2, 0, 'E SS'], [3, 0, 'NE']] },
          puddle: { ...water, layout: [...water.layout, [2, 0, 'E']] },
        },
        prefabs: {
          oak: { ...VALID.prefabs.oak, layout: ['x^', '##'] },
          door: { ...VALID.prefabs.door, layout: ['D', 'D'] },
        },
      }),
    ).toEqual([
      `Terrain water: layout[3][2] "E SS" can't be read: "SS" isn't a neighbour (N, NE, E, … NW)`,
      `Terrain water: layout[4][2] "NE" can't be read: "NE" has NE without both N and E`,
      'Terrain puddle: layout has two tiles for one shape: [2, 0] and [1, 0] both claim "E"',
      `Prefab oak: layout[0] "x^" has a character that isn't # . ^ = D or a space`,
      'Prefab door: layout has more than one doorway (D)',
    ]);
  });

  test('reports a new game with something missing, and scripts that are not functions', () => {
    expect(
      check({
        events: { 'town/ada': 'Hello!' },
        newGame: { location: { map: 'town', x: 2, y: 0 }, party: [] },
      }),
    ).toEqual([
      "Event town/ada isn't an event script",
      'The new game: location.facing is missing',
      'The new game: party is empty',
    ]);
  });

  test('reports characters whose stats are missing, too low, or lower at level 30', () => {
    // Bram's stats leave out MAG.
    const { hp, mp, atk, def, res } = ROWAN.stats;
    expect(
      check({
        characters: {
          rowan: {
            ...ROWAN,
            stats: { ...ROWAN.stats, hp: [0, 900], spd: [11, 9], luck: [1, 2] },
          },
          bram: { name: 'Bram', stats: { hp, mp, atk, def, res, spd: [7] } },
        },
      }),
    ).toEqual([
      'Character rowan: stats.hp[0] should be at least 1, not 0',
      'Character rowan: stats.spd is lower at level 30 than at level 1',
      "Character rowan: stats has a field it shouldn't: luck",
      'Character bram: stats.mag is missing',
      'Character bram: stats.spd should have at least 2 entries, not 1',
    ]);
  });

  test('reports a collection that is not a record', () => {
    expect(check({ items: [] })).toEqual(['Items should be an object, not a list']);
  });

  // The same check as `npm run validate`, so it also runs with the unit tests.
  test('the real content matches its schemas', () => {
    expect(
      checkContent({
        characters: CHARACTERS,
        items: ITEMS,
        speakers: SPEAKERS,
        terrains: TERRAINS,
        prefabs: PREFABS,
        maps: MAPS,
        events: EVENTS,
        newGame: NEW_GAME,
      }),
    ).toEqual([]);
  });
});

describe('checkNewGame', () => {
  const CONTENT: MapContent = {
    terrains: {
      grass: { kind: 'fill', sheet: 'tiles.grass', tiles: [[0, 0]] },
      rock: { kind: 'fill', sheet: 'tiles.grass', tiles: [[1, 0]], solid: true },
    },
    prefabs: {},
  };
  const FIELD: MapDef = {
    id: 'field',
    name: 'Field',
    terrain: '.#..',
    legend: { '.': 'grass', '#': 'rock' },
    objects: [{ type: 'npc', id: 'ada', sprite: 'ada', at: [3, 0], facing: 'down' }],
    edges: { west: { map: 'field', spawn: 'start' } },
  };

  const check = (
    location: Partial<NewGame['location']>,
    more: Omit<Partial<NewGame>, 'location'> = {},
  ) =>
    checkNewGame({
      newGame: {
        location: { map: 'field', x: 0, y: 0, facing: 'down', ...location },
        party: ['rowan'],
        ...more,
      },
      maps: { field: FIELD },
      content: CONTENT,
      characters: { rowan: {}, bram: {} },
      items: { potion: { name: 'Potion' } },
    });

  test('passes a start on open ground, with characters and items that exist', () => {
    expect(check({ x: 2 }, { party: ['rowan', 'bram'], inventory: { potion: 3 } })).toEqual([]);
  });

  test('reports a start on a map that does not exist', () => {
    expect(check({ map: 'nowhere' })).toEqual([
      "The new game starts on nowhere, which isn't a map",
    ]);
  });

  test('reports a start where the player cannot stand: off the map, solid, or taken', () => {
    expect(check({ x: 1 })).toEqual([
      "The new game starts at (1, 0) on field, where the player can't stand",
    ]);
    // Off the west edge leads somewhere, but it's still off the map.
    expect(check({ x: -1 })).toEqual([
      "The new game starts at (-1, 0) on field, where the player can't stand",
    ]);
    expect(check({ x: 4 })).toEqual([
      "The new game starts at (4, 0) on field, where the player can't stand",
    ]);
    expect(check({ x: 3 })).toEqual([
      'The new game starts at (3, 0) on field, where npc ada stands',
    ]);
  });

  test('reports characters and items that do not exist', () => {
    expect(check({}, { party: ['rowan', 'vesh'], inventory: { potion: 1, pebble: 2 } })).toEqual([
      "The new game starts with vesh in the party, which isn't a character",
      "The new game starts with pebble, which isn't an item",
    ]);
  });

  // The same check as `npm run validate`, so it also runs with the unit tests.
  test('the real new game checks out', () => {
    expect(
      checkNewGame({
        newGame: NEW_GAME,
        maps: MAPS,
        content: MAP_CONTENT,
        characters: CHARACTERS,
        items: ITEMS,
      }),
    ).toEqual([]);
  });
});
