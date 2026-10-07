import { describe, expect, test } from 'vitest';
import type { MapContent, MapDef } from '../src/core/map/types';
import type { SkillDef } from '../src/core/schema';
import type { NewGame } from '../src/core/state';
import { BACKDROPS } from '../src/data/backdrops';
import { AREAS, EXP_CURVE } from '../src/data/balance';
import { CHARACTERS } from '../src/data/characters';
import { ENCOUNTERS } from '../src/data/encounters';
import { ENEMIES } from '../src/data/enemies';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { MAPS } from '../src/data/maps';
import { NEW_GAME } from '../src/data/new-game';
import { SHOPS } from '../src/data/shops';
import { SKILLS } from '../src/data/skills';
import { SPEAKERS } from '../src/data/speakers';
import { STORY } from '../src/data/story';
import { MAP_CONTENT, PREFABS, TERRAINS } from '../src/data/terrain';
import { ASSETS } from '../src/systems/asset-manifest';
import {
  checkAreas,
  checkCharacters,
  checkContent,
  checkEncounters,
  checkEnemies,
  checkMapEncounters,
  checkNewGame,
  checkShops,
  checkStory,
  type AreaSources,
  type CharacterSources,
  type ContentSources,
  type EnemySources,
} from './content-checks';

describe('checkContent', () => {
  /** A map with one of every kind of object, all well-formed. */
  const TOWN = {
    id: 'town',
    name: 'Town',
    music: 'bgm.town',
    terrain: '...',
    legend: { '.': 'grass', s: { when: 'tide.town-low', terrain: 'grass', otherwise: 'water' } },
    objects: [
      { type: 'prefab', prefab: 'door', at: [0, 0], to: { map: 'town', spawn: 'start' } },
      { type: 'warp', at: [1, 0], to: { map: 'town', spawn: 'start' } },
      { type: 'spawn', id: 'start', at: [2, 0], facing: 'down' },
      {
        type: 'npc',
        id: 'ada',
        sprite: 'ada',
        at: [0, 1],
        facing: 'left',
        wander: 2,
        when: '!story.ada-gone',
      },
      { type: 'touch', at: [1, 1], script: 'town/ada', when: '!story.met-ada' },
      { type: 'enter', script: 'town/ada' },
      { type: 'auto', script: 'town/ada', when: ['story.met-ada', '!story.waved'] },
      { type: 'chest', at: [2, 1], flag: 'chest.town-01', item: 'potion' },
      { type: 'chest', at: [2, 2], flag: 'chest.town-02', gold: 30 },
      { type: 'prefab', prefab: 'raft', at: [0, 2], when: '!tide.town-low' },
    ],
    edges: { east: { map: 'town', spawn: 'start' } },
    encounters: { table: 'wolves', backdrop: 'field' },
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
    weapon: 'sword',
    armor: ['light'],
    equipment: { weapon: 'bronze-sword' },
    skills: [
      { skill: 'sweep', level: 3 },
      { skill: 'sweep', flag: 'story.tide-spark' },
    ],
  };

  const SWEEP = {
    name: 'Sweep',
    description: 'Hits every enemy.',
    kind: 'physical',
    power: 0.6,
    mp: 5,
    rank: 'normal',
    target: 'all-enemies',
  };
  const POTION = {
    name: 'Potion',
    description: 'Restores HP.',
    kind: 'consumable',
    price: 25,
    target: 'one-ally',
    effects: [{ type: 'restore', hp: 50 }],
  };

  const VALID = {
    characters: { rowan: ROWAN },
    skills: {
      sweep: SWEEP,
      provoke: {
        name: 'Provoke',
        description: 'Draws every enemy.',
        kind: 'support',
        mp: 2,
        rank: 'quick',
        target: 'all-enemies',
        effects: [
          { type: 'status', status: 'provoke', chance: 0.9 },
          { type: 'delay', amount: 0.5 },
        ],
      },
      heal: { ...SWEEP, kind: 'healing', target: 'one-ally' },
    },
    items: {
      potion: POTION,
      bomb: {
        ...POTION,
        target: 'one-enemy',
        effects: [{ type: 'damage', amount: 40, element: 'fire' }],
      },
      'bronze-sword': {
        name: 'Bronze Sword',
        description: 'A sword.',
        kind: 'weapon',
        weapon: 'sword',
        element: 'water',
        price: 60,
        stats: { atk: 4, spd: -1 },
      },
      vest: {
        name: 'Vest',
        description: 'Light.',
        kind: 'armor',
        armor: 'light',
        price: 30,
        stats: {},
      },
      ring: {
        name: 'Ring',
        description: 'Shiny.',
        kind: 'accessory',
        price: 300,
        stats: { spd: 2 },
      },
      shard: { name: 'Shard', description: 'A memory.', kind: 'key' },
    },
    enemies: {
      wolf: {
        name: 'Wolf',
        stats: { hp: 30, mp: 0, atk: 12, def: 6, mag: 2, res: 4, spd: 12 },
        exp: 6,
        gold: 5,
        drops: [{ item: 'potion', chance: 0.1 }],
        reactions: { fire: 'weak', water: 'normal', gloam: 'absorb' },
        actions: [
          { type: 'attack', weight: 3 },
          { type: 'skill', skill: 'bite', weight: 2, target: 'lowest-hp' },
          { type: 'skill', skill: 'howl', when: { alliesBelow: 2, once: true } },
          { type: 'guard', weight: 0.5, when: { hpBelow: 0.25 } },
        ],
      },
      warden: {
        name: 'Drowned Warden',
        stats: { hp: 400, mp: 40, atk: 20, def: 15, mag: 10, res: 12, spd: 9 },
        exp: 100,
        gold: 0,
        boss: true,
        actions: [{ type: 'attack' }],
        phases: [
          {
            below: 0.6,
            banner: 'The Warden rises!',
            actions: [{ type: 'skill', skill: 'crush', telegraph: true }],
          },
          { below: 0.3, actions: [{ type: 'attack', when: { every: 2 }, target: 'healer' }] },
        ],
      },
    },
    encounters: {
      cave: { groups: [{ enemies: ['wolf', 'wolf'], weight: 2 }, { enemies: ['wolf'] }] },
    },
    shops: { market: { items: ['potion'] } },
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
    backdrops: {
      field: {
        terrain: '..\n..',
        legend: { '.': 'grass' },
        objects: [{ type: 'prefab', prefab: 'oak', at: [0, 0] }],
      },
    },
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
        items: { Potion: POTION },
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
        items: { potion: { ...POTION, name: undefined }, ether: { ...POTION, name: 3 } },
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
        items: { potion: { ...POTION, name: '' }, ether: { ...POTION, name: 'Ether ' } },
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
          bram: { ...ROWAN, name: 'Bram', stats: { hp, mp, atk, def, res, spd: [7] } },
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

  test('reports skills of a kind with a target, power or effects it can’t have', () => {
    expect(
      check({
        skills: {
          slash: { ...SWEEP, target: 'one-ally' },
          rally: { ...SWEEP, kind: 'support', power: undefined },
          zap: { ...SWEEP, kind: 'magic' },
        },
      }),
    ).toEqual([
      'Skill slash: target should be one of "one-enemy", "all-enemies", not "one-ally"',
      'Skill rally: effects is missing',
      "Skill rally has a field it shouldn't: power",
      'Skill zap: kind should be one of "physical", "magical", "healing", "support", not "magic"',
    ]);
  });

  test('reports effects there are no such things as, or that do nothing', () => {
    const effects = (...list: unknown[]) => ({ potion: { ...POTION, effects: list } });
    expect(
      check({
        items: effects(
          { type: 'teleport' },
          { type: 'status', status: 'frozen' },
          { type: 'restore' },
          { type: 'status', status: 'poison', chance: 1.5 },
        ),
      }),
    ).toEqual([
      'Item potion: effects[0].type should be one of "delay", "status", "cure", "reveal", ' +
        '"restore", "revive", "damage", "escape", not "teleport"',
      expect.stringMatching(
        /^Item potion: effects\[1\]\.status should be one of "poison", .*, not "frozen"$/,
      ),
      'Item potion: effects[2] should restore some HP or MP',
      'Item potion: effects[3].chance should be at most 1, not 1.5',
    ]);
    expect(check({ items: effects() })).toEqual(['Item potion: effects is empty']);
  });

  test('reports equipment of a kind that isn’t one, and key items with a price', () => {
    expect(
      check({
        items: {
          sword: { ...VALID.items['bronze-sword'], weapon: 'light' },
          vest: { ...VALID.items.vest, stats: { def: 1.5, luck: 1 } },
          shard: { ...VALID.items.shard, price: 10 },
        },
      }),
    ).toEqual([
      'Item sword: weapon should be one of "sword", "axe", "staff", "dagger", not "light"',
      'Item vest: stats.def should be a whole number, not 1.5',
      "Item vest: stats has a field it shouldn't: luck",
      "Item shard has a field it shouldn't: price",
    ]);
  });

  test('reports characters who learn skills both ways, or wear gear in slots there aren’t', () => {
    expect(
      check({
        characters: {
          rowan: {
            ...ROWAN,
            armor: [],
            equipment: { cape: 'red-cape' },
            skills: [{ skill: 'sweep', level: 3, flag: 'story.tide-spark' }, { skill: 'sweep' }],
          },
        },
      }),
    ).toEqual([
      'Character rowan: armor is empty',
      "Character rowan: equipment has a field it shouldn't: cape",
      'Character rowan: skills[0] should be learned at a level or with a flag: one or the other',
      'Character rowan: skills[1] should be learned at a level or with a flag: one or the other',
    ]);
  });

  test('reports enemies with stats or reactions that are out of range', () => {
    const wolf = VALID.enemies.wolf;
    expect(
      check({
        enemies: {
          wolf: {
            ...wolf,
            stats: { ...wolf.stats, hp: 0, spd: 2.5 },
            exp: -1,
            gold: 1.5,
            drops: [
              { item: 'potion', chance: 0 },
              { item: 'potion', chance: 1.5 },
            ],
            reactions: { fire: 'weakness', ice: 'weak' },
          },
          rat: { name: 'Rat', stats: { hp: 5, atk: 3 }, exp: 1, gold: 1, drops: [], boss: 'yes' },
        },
      }),
    ).toEqual([
      'Enemy wolf: stats.hp should be at least 1, not 0',
      'Enemy wolf: stats.spd should be a whole number, not 2.5',
      'Enemy wolf: exp should be at least 0, not -1',
      'Enemy wolf: gold should be a whole number, not 1.5',
      'Enemy wolf: drops[0].chance should be more than 0, not 0',
      'Enemy wolf: drops[1].chance should be at most 1, not 1.5',
      'Enemy wolf: reactions.fire should be one of "weak", "normal", "resist", "immune", ' +
        '"absorb", not "weakness"',
      "Enemy wolf: reactions has a field it shouldn't: ice",
      'Enemy rat: stats.mp is missing',
      'Enemy rat: stats.def is missing',
      'Enemy rat: stats.mag is missing',
      'Enemy rat: stats.res is missing',
      'Enemy rat: stats.spd is missing',
      'Enemy rat: drops is empty',
      'Enemy rat: boss should be true or false, not "yes"',
    ]);
  });

  test('reports enemy actions and phases there are no such things as', () => {
    const { wolf, warden } = VALID.enemies;
    expect(
      check({
        enemies: {
          wolf: {
            ...wolf,
            actions: [
              { type: 'attack', when: {} },
              { type: 'guard', target: 'lowest-hp' },
              { type: 'skill', skill: 'bite', weight: 0 },
              { type: 'attack', when: { once: true } },
              { type: 'skill', skill: 'bite', when: { every: 1, hpBelow: 1.5 } },
              { type: 'skill', skill: 'bite', target: 'weakest', telegraph: false },
              { type: 'cast' },
            ],
          },
          warden: {
            ...warden,
            phases: [
              { below: 0.5, banner: 'It rises! ', actions: [] },
              { below: 0.6, actions: [{ type: 'attack' }] },
            ],
          },
        },
      }),
    ).toEqual([
      'Enemy wolf: actions[0].when has no conditions',
      "Enemy wolf: actions[1] has a field it shouldn't: target",
      'Enemy wolf: actions[2].weight should be more than 0, not 0',
      // Only a skill can be kept for once a battle.
      "Enemy wolf: actions[3].when has a field it shouldn't: once",
      'Enemy wolf: actions[3].when has no conditions',
      'Enemy wolf: actions[4].when.hpBelow should be at most 1, not 1.5',
      'Enemy wolf: actions[4].when.every should be at least 2, not 1',
      'Enemy wolf: actions[5].target should be one of "random", "lowest-hp", "highest-atk", ' +
        '"healer", not "weakest"',
      'Enemy wolf: actions[5].telegraph should be true, not false',
      'Enemy wolf: actions[6].type should be one of "attack", "guard", "skill", not "cast"',
      'Enemy warden: phases[0].banner "It rises! " starts or ends with a space',
      'Enemy warden: phases[0].actions is empty',
      'Enemy warden: phases should each start at less HP than the one before',
    ]);
  });

  test('reports encounter tables with no groups, groups too big, or weights below 1', () => {
    expect(
      check({
        encounters: {
          empty: { groups: [] },
          crowd: { groups: [{ enemies: Array(7).fill('wolf') }, { enemies: [], weight: -1 }] },
        },
      }),
    ).toEqual([
      'Encounter table empty: groups is empty',
      'Encounter table crowd: groups[0].enemies should have at most 6 entries, not 7',
      'Encounter table crowd: groups[1].enemies is empty',
      'Encounter table crowd: groups[1].weight should be more than 0, not -1',
    ]);
  });

  test('reports shops that sell nothing, or the same thing twice', () => {
    expect(
      check({ shops: { empty: { items: [] }, twice: { items: ['potion', 'ether', 'potion'] } } }),
    ).toEqual(['Shop empty: items is empty', 'Shop twice: items lists an item twice']);
  });

  test('reports random battles on a map without a table or backdrop, or with more', () => {
    expect(
      check({
        maps: {
          town: { ...TOWN, encounters: { table: 'Wolves', music: 'bgm.fight' } },
        },
      }),
    ).toEqual([
      'Map town: encounters.table "Wolves" isn\'t kebab-case, like tide-caves-b1',
      'Map town: encounters.backdrop is missing',
      "Map town: encounters has a field it shouldn't: music",
    ]);
  });

  test('reports an area that isn’t an ID', () => {
    expect(check({ maps: { town: { ...TOWN, area: 'Saltmere' } } })).toEqual([
      'Map town: area "Saltmere" isn\'t kebab-case, like tide-caves-b1',
    ]);
    expect(check({ maps: { town: { ...TOWN, area: 'saltmere' } } })).toEqual([]);
  });

  test('reports backdrops with something on them besides prefabs', () => {
    const field = VALID.backdrops.field;
    expect(
      check({
        backdrops: {
          field: { ...field, objects: [{ type: 'spawn', id: 'start', at: [0, 0], facing: 'up' }] },
        },
      }),
    ).toEqual([
      'Backdrop field: objects[0].type should be "prefab", not "spawn"',
      'Backdrop field: objects[0].prefab is missing',
      "Backdrop field: objects[0] has fields it shouldn't: id, facing",
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
        skills: SKILLS,
        items: ITEMS,
        enemies: ENEMIES,
        encounters: ENCOUNTERS,
        shops: SHOPS,
        speakers: SPEAKERS,
        terrains: TERRAINS,
        prefabs: PREFABS,
        maps: MAPS,
        backdrops: BACKDROPS,
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

describe('checkCharacters', () => {
  const stats: CharacterSources['characters'][string]['stats'] = {
    hp: [60, 900],
    mp: [12, 110],
    atk: [12, 115],
    def: [9, 85],
    mag: [7, 70],
    res: [7, 70],
    spd: [11, 28],
  };
  const SOURCES: CharacterSources = {
    characters: {
      rowan: {
        name: 'Rowan',
        stats,
        weapon: 'sword',
        armor: ['light'],
        equipment: { weapon: 'bronze-sword', armor: 'vest' },
        skills: [{ skill: 'sweep', level: 3 }],
      },
    },
    skills: { sweep: {} },
    items: {
      'bronze-sword': {
        name: 'Bronze Sword',
        description: 'A sword.',
        kind: 'weapon',
        weapon: 'sword',
        price: 60,
        stats: {},
      },
      'hand-axe': {
        name: 'Hand Axe',
        description: 'An axe.',
        kind: 'weapon',
        weapon: 'axe',
        price: 70,
        stats: {},
      },
      vest: {
        name: 'Vest',
        description: 'Light.',
        kind: 'armor',
        armor: 'light',
        price: 30,
        stats: {},
      },
    },
    maxLevel: 30,
  };
  const rowan = (changes: Partial<CharacterSources['characters'][string]>) =>
    checkCharacters({
      ...SOURCES,
      characters: { rowan: { ...SOURCES.characters.rowan!, ...changes } },
    });

  test('passes characters in gear that exists and fits them, who learn skills that exist', () => {
    expect(checkCharacters(SOURCES)).toEqual([]);
  });

  test('reports gear that doesn’t exist, isn’t for its slot, or they can’t equip', () => {
    expect(rowan({ equipment: { weapon: 'excalibur', armor: 'bronze-sword' } })).toEqual([
      "Character rowan: starts with excalibur, which isn't an item",
      "Character rowan: starts with bronze-sword as their armor, which it isn't",
    ]);
    expect(rowan({ equipment: { weapon: 'hand-axe' } })).toEqual([
      "Character rowan: starts with hand-axe, which they can't equip",
    ]);
  });

  test('reports skills that don’t exist, or are learned past the last level', () => {
    expect(
      rowan({
        skills: [
          { skill: 'sweep', level: 31 },
          { skill: 'tide-edge', flag: 'story.tide-spark' },
        ],
      }),
    ).toEqual([
      'Character rowan: learns sweep at level 31, but levels stop at 30',
      "Character rowan: learns tide-edge, which isn't a skill",
    ]);
  });

  // The same check as `npm run validate`, so it also runs with the unit tests.
  test('the real characters check out', () => {
    expect(
      checkCharacters({
        characters: CHARACTERS,
        skills: SKILLS,
        items: ITEMS,
        maxLevel: EXP_CURVE.maxLevel,
      }),
    ).toEqual([]);
  });
});

describe('checkEnemies', () => {
  const skill = (name: string, target: SkillDef['target']): SkillDef => ({
    name,
    description: `${name}.`,
    kind: 'support',
    mp: 0,
    rank: 'normal',
    target,
    effects: [{ type: 'reveal' }],
  });
  const SOURCES: EnemySources = {
    enemies: {
      wolf: {
        name: 'Wolf',
        stats: { hp: 30, mp: 0, atk: 12, def: 6, mag: 2, res: 4, spd: 12 },
        exp: 6,
        gold: 5,
        drops: [{ item: 'potion', chance: 0.1 }],
        actions: [
          { type: 'attack', target: 'lowest-hp' },
          { type: 'skill', skill: 'bite', target: 'healer' },
          { type: 'skill', skill: 'howl' },
        ],
        phases: [{ below: 0.5, actions: [{ type: 'skill', skill: 'mend', target: 'lowest-hp' }] }],
      },
    },
    skills: {
      bite: skill('Bite', 'one-enemy'),
      howl: skill('Howl', 'all-enemies'),
      mend: skill('Mend', 'one-ally'),
    },
    items: {
      potion: {
        name: 'Potion',
        description: 'Restores HP.',
        kind: 'consumable',
        price: 25,
        target: 'one-ally',
        effects: [{ type: 'restore', hp: 50 }],
      },
    },
    manifest: {
      'monster.wolf': { type: 'spritesheet', url: 'wolf.png', frameWidth: 16, frameHeight: 16 },
    },
  };

  test('passes enemies whose skills exist, aimed as they pick their targets', () => {
    expect(checkEnemies(SOURCES)).toEqual([]);
  });

  test('reports an enemy with no sprite sheet to fight as', () => {
    const wolf = SOURCES.enemies.wolf!;
    expect(
      checkEnemies({
        ...SOURCES,
        enemies: { wolf, bat: { ...wolf, name: 'Bat' }, crab: { ...wolf, name: 'Crab' } },
        manifest: { ...SOURCES.manifest, 'monster.crab': { type: 'image', url: 'crab.png' } },
      }),
    ).toEqual([
      'Enemy bat: has no sprite sheet to fight as, monster.bat in the asset manifest',
      'Enemy crab: has no sprite sheet to fight as, monster.crab in the asset manifest',
    ]);
  });

  test('reports skills that don’t exist, and target rules for skills not aimed at one', () => {
    const wolf = SOURCES.enemies.wolf!;
    expect(
      checkEnemies({
        ...SOURCES,
        enemies: {
          wolf: {
            ...wolf,
            actions: [
              { type: 'skill', skill: 'howl', target: 'random' },
              { type: 'skill', skill: 'pounce' },
            ],
            phases: [{ below: 0.5, actions: [{ type: 'skill', skill: 'maul', telegraph: true }] }],
          },
        },
      }),
    ).toEqual([
      "Enemy wolf: actions[0] picks a target for Howl, which isn't aimed at one",
      "Enemy wolf: actions[1] uses pounce, which isn't a skill",
      "Enemy wolf: phases[0].actions[0] uses maul, which isn't a skill",
    ]);
  });

  test('reports drops that aren’t items', () => {
    const wolf = SOURCES.enemies.wolf!;
    const drops = [
      { item: 'potion', chance: 0.1 },
      { item: 'hi-potion', chance: 0.05 },
    ];
    expect(checkEnemies({ ...SOURCES, enemies: { wolf: { ...wolf, drops } } })).toEqual([
      "Enemy wolf: drops[1] is hi-potion, which isn't an item",
    ]);
  });

  test('the real enemies check out', () => {
    expect(
      checkEnemies({ enemies: ENEMIES, skills: SKILLS, items: ITEMS, manifest: ASSETS }),
    ).toEqual([]);
  });
});

describe('checkMapEncounters', () => {
  const map = (id: string, encounters?: MapDef['encounters']): MapDef => ({
    id,
    name: id,
    terrain: '.',
    legend: { '.': 'grass' },
    ...(encounters ? { encounters } : {}),
  });

  test('reports encounter tables and backdrops there are none of', () => {
    expect(
      checkMapEncounters({
        maps: {
          road: map('road', { table: 'wolves', backdrop: 'meadow' }),
          town: map('town'),
          moor: map('moor', { table: 'bogs', backdrop: 'swamp' }),
        },
        encounters: { wolves: {} },
        backdrops: { meadow: {} },
      }),
    ).toEqual([
      "Map moor: its encounter table, bogs, isn't an encounter table",
      "Map moor: its backdrop, swamp, isn't a battle backdrop",
    ]);
  });

  test('the real maps’ random battles check out', () => {
    expect(
      checkMapEncounters({ maps: MAPS, encounters: ENCOUNTERS, backdrops: BACKDROPS }),
    ).toEqual([]);
  });
});

describe('checkEncounters', () => {
  test('reports enemies there are none of', () => {
    expect(
      checkEncounters({
        encounters: {
          cave: { groups: [{ enemies: ['bat', 'bat', 'crab'] }, { enemies: ['bat', 'yeti'] }] },
        },
        enemies: { bat: {} },
      }),
    ).toEqual([
      "Encounter table cave: groups[0] has crab, which isn't an enemy",
      "Encounter table cave: groups[1] has yeti, which isn't an enemy",
    ]);
  });

  test('the real encounter tables check out', () => {
    expect(checkEncounters({ encounters: ENCOUNTERS, enemies: ENEMIES })).toEqual([]);
  });
});

describe('checkStory', () => {
  const ROWAN = CHARACTERS.rowan;

  test('reports story points that aren’t story flags, repeats, and nameless ones', () => {
    expect(
      checkStory({
        story: [
          { flag: 'story.dawn', name: 'Dawn' },
          { flag: 'chest.town-01', name: 'A chest' },
          { flag: 'story.dawn', name: 'Dawn again' },
          { flag: 'story.dusk', name: ' ' },
        ],
        maps: {},
        characters: {},
      }),
    ).toEqual([
      'The story: point 1 has the flag "chest.town-01"; story flags look like story.beacon-out',
      'The story: point 2 has the flag story.dawn, as an earlier point does',
      'The story: point 3 has no name',
    ]);
  });

  test('reports story flags maps and characters wait on that aren’t in the story', () => {
    const town: MapDef = {
      id: 'town',
      name: 'Town',
      terrain: '...',
      legend: { '.': 'grass', w: { when: 'story.flood', terrain: 'water', otherwise: 'grass' } },
      objects: [
        { type: 'npc', id: 'ada', sprite: 'ada', at: [0, 0], facing: 'down', when: '!story.dusk' },
        { type: 'enter', script: 'town/hello', when: ['story.dawn', 'town.visited'] },
        { type: 'touch', at: [1, 0], script: 'town/step', when: 'story.noon' },
        { type: 'prefab', prefab: 'stall', at: [2, 0], when: 'story.fair' },
      ],
    };
    expect(
      checkStory({
        story: [{ flag: 'story.dawn', name: 'Dawn' }],
        maps: { town },
        characters: ROWAN
          ? { rowan: { ...ROWAN, skills: [{ skill: 'tide-edge', flag: 'story.tide' }] } }
          : {},
      }),
    ).toEqual([
      "Map town: its legend's \"w\" waits on story.flood, which isn't one of the story's points",
      "Map town: npc ada waits on story.dusk, which isn't one of the story's points",
      "Map town: its touch trigger waits on story.noon, which isn't one of the story's points",
      "Map town: the stall at (2, 0) waits on story.fair, which isn't one of the story's points",
      "Character rowan: learns tide-edge by story.tide, which isn't one of the story's points",
    ]);
  });

  test('the real story, maps and characters check out', () => {
    expect(checkStory({ story: STORY, maps: MAPS, characters: CHARACTERS })).toEqual([]);
  });
});

describe('checkShops', () => {
  test('reports items there are none of, and key items, which shops don’t sell', () => {
    expect(
      checkShops({
        shops: { market: { items: ['potion', 'plums', 'shard'] } },
        items: {
          potion: {
            name: 'Potion',
            description: 'Heals.',
            kind: 'consumable',
            price: 25,
            target: 'one-ally',
            effects: [{ type: 'restore', hp: 50 }],
          },
          shard: { name: 'Shard', description: 'Glows.', kind: 'key' },
        },
      }),
    ).toEqual([
      "Shop market: items[1] is plums, which isn't an item",
      "Shop market: items[2] is shard, a key item, which shops don't sell",
    ]);
  });

  test('the real shops check out', () => {
    expect(checkShops({ shops: SHOPS, items: ITEMS })).toEqual([]);
  });
});

describe('checkAreas', () => {
  const SOURCES: AreaSources = {
    areas: AREAS,
    characters: CHARACTERS,
    items: ITEMS,
    enemies: ENEMIES,
    encounters: ENCOUNTERS,
    maxLevel: EXP_CURVE.maxLevel,
  };

  test('the real areas check out', () => {
    expect(checkAreas(SOURCES)).toEqual([]);
  });

  test('reports a party, encounter table, boss, items and gear that don’t exist or don’t fit', () => {
    expect(
      checkAreas({
        ...SOURCES,
        areas: {
          cave: {
            name: 'the cave',
            party: ['rowan', 'bram', 'nobody'],
            encounters: 'nowhere',
            boss: ['kraken'],
            arrival: { level: 1, items: { potion: 1, ambrosia: 2 } },
            atBoss: {
              level: 5,
              gear: { rowan: ['iron-sword', 'hand-axe', 'excalibur'], liora: ['oak-staff'] },
              items: {},
            },
          },
        },
      }),
    ).toEqual([
      "Area cave: nobody is in its party, but isn't a character",
      "Area cave: its encounter table, nowhere, doesn't exist",
      "Area cave: its boss, kraken, isn't an enemy",
      "Area cave: arrival carries ambrosia, which isn't an item",
      "Area cave: atBoss gives rowan hand-axe, which they can't equip",
      "Area cave: atBoss gives rowan excalibur, which isn't an item",
      "Area cave: atBoss gives gear to liora, who isn't in its party",
    ]);
  });

  test('reports levels there aren’t, and a party that loses levels on the way to the boss', () => {
    const area = SOURCES.areas['tide-caves']!;
    expect(
      checkAreas({
        ...SOURCES,
        maxLevel: 10,
        areas: {
          cave: { ...area, arrival: { level: 11, items: {} }, atBoss: { level: 2.5, items: {} } },
        },
      }),
    ).toEqual([
      'Area cave: arrival.level is 11, but levels go from 1 to 10',
      'Area cave: atBoss.level is 2.5, but levels go from 1 to 10',
      'Area cave: the party is a lower level at the boss than on arrival',
    ]);
  });
});
