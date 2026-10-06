import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { MapContent, MapDef } from '../src/core/map/types';
import { CHARACTERS } from '../src/data/characters';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { BACKDROPS } from '../src/data/backdrops';
import { MAPS } from '../src/data/maps';
import { NEW_GAME } from '../src/data/new-game';
import { SHOPS } from '../src/data/shops';
import { SPEAKERS } from '../src/data/speakers';
import { MAP_CONTENT } from '../src/data/terrain';
import { CHEST_TEXT } from '../src/data/ui-text';
import { ASSETS, type AssetEntry } from '../src/systems/asset-manifest';
import { pngSize } from './asset-checks';
import { checkEvents } from './event-checks';
import { measureBodyFont, type MeasuredFont } from './font-metrics';
import { checkBackdrops, checkMapNames, checkMaps, checkReachable } from './map-checks';

const MANIFEST: Record<string, AssetEntry> = {
  'tiles.grass': { type: 'spritesheet', url: 'grass.png', frameWidth: 16, frameHeight: 16 },
  'ui.box': { type: 'image', url: 'box.png' },
  'bgm.town': { type: 'audio', urls: ['town.ogg', 'town.m4a'] },
  'sfx.ding': { type: 'audio', urls: ['ding.ogg', 'ding.m4a'] },
};
// tiles.grass is 4×2 tiles.
const imageSize = (url: string) => (url === 'grass.png' ? { width: 64, height: 32 } : undefined);

const content = (overrides: Partial<MapContent>): MapContent => ({
  terrains: { grass: { kind: 'fill', sheet: 'tiles.grass', tiles: [[0, 0]] } },
  prefabs: {},
  ...overrides,
});

const check = (contents: MapContent, maps: Record<string, MapDef> = {}): string[] =>
  checkMaps({ maps, content: contents, manifest: MANIFEST, imageSize });

test('passes when every tile is in its sheet', () => {
  expect(check(content({}))).toEqual([]);
});

test('reports tiles outside their sheet, and sheets that are not 16×16 sprite sheets', () => {
  const problems = check(
    content({
      terrains: {
        grass: {
          kind: 'fill',
          sheet: 'tiles.grass',
          tiles: [
            [3, 1],
            [4, 0],
          ],
        },
        sand: { kind: 'fill', sheet: 'ui.box', tiles: [[0, 0]] },
      },
      prefabs: { hut: { sheet: 'tiles.grass', origin: [2, 1], layout: ['# ', '..'] } },
    }),
  );
  expect(problems).toEqual([
    "Terrain grass: there's no tile at [4, 0] in tiles.grass",
    "Terrain sand: ui.box isn't a 16×16 sprite sheet in the asset manifest",
    "Prefab hut: there's no tile at [2, 2] in tiles.grass",
    "Prefab hut: there's no tile at [3, 2] in tiles.grass",
  ]);
});

test('reports ways out that lead to missing maps or spawns', () => {
  const grassMap = (id: string, overrides: Partial<MapDef>): MapDef => ({
    id,
    name: id,
    terrain: '..',
    legend: { '.': 'grass' },
    ...overrides,
  });
  const problems = check(content({}), {
    a: grassMap('a', {
      objects: [
        { type: 'warp', at: [0, 0], to: { map: 'b', spawn: 'nope' } },
        { type: 'warp', at: [1, 0], to: { map: 'c', spawn: 'start' } },
      ],
      edges: { south: { map: 'b', spawn: 'start' } },
    }),
    b: grassMap('b', { objects: [{ type: 'spawn', id: 'start', at: [0, 0], facing: 'down' }] }),
  });
  expect(problems).toEqual([
    'Map a: the way out at (0, 0) leads to spawn nope on b, which has no such spawn',
    "Map a: the way out at (1, 0) leads to c, which isn't a map",
  ]);
});

test('reports NPCs whose sprite is not a character sheet', () => {
  const problems = check(content({}), {
    a: {
      id: 'a',
      name: 'A',
      terrain: '..',
      legend: { '.': 'grass' },
      objects: [{ type: 'npc', id: 'ghost', sprite: 'nobody', at: [0, 0], facing: 'down' }],
    },
  });
  expect(problems).toEqual(["Map a: npc ghost's sprite, sprite.nobody, isn't a character sheet"]);
});

test('reports trees on missing ground or prefabs, and maps that do not compile', () => {
  const problems = check(
    content({
      terrains: {
        grass: { kind: 'fill', sheet: 'tiles.grass', tiles: [[0, 0]] },
        trees: { kind: 'trees', ground: 'sand', trees: ['oak'], filler: 'bush' },
      },
    }),
    { broken: { id: 'broken', name: 'Broken', terrain: '.x', legend: { '.': 'grass' } } },
  );
  expect(problems).toEqual([
    "Terrain trees: its ground, sand, isn't a fill terrain",
    "Terrain trees: there's no prefab oak",
    "Terrain trees: there's no prefab bush",
    'Map broken: "x" at (1, 0) isn\'t in its legend',
  ]);
});

test('reports maps whose music is not music in the manifest', () => {
  const room = (id: string, music?: string): MapDef => ({
    id,
    name: id,
    ...(music ? { music } : {}),
    terrain: '..',
    legend: { '.': 'grass' },
  });
  const problems = check(content({}), {
    a: room('a', 'bgm.town'),
    b: room('b'),
    c: room('c', 'bgm.nowhere'),
    d: room('d', 'sfx.ding'),
  });
  expect(problems).toEqual([
    "Map c: its music, bgm.nowhere, isn't music in the asset manifest",
    "Map d: its music, sfx.ding, isn't music in the asset manifest",
  ]);
});

test('reports chests that share a flag with a chest on another map', () => {
  const room = (id: string, objects: MapDef['objects']): MapDef => ({
    id,
    name: id,
    terrain: '..',
    legend: { '.': 'grass' },
    objects,
  });
  const problems = check(content({}), {
    a: room('a', [
      { type: 'chest', at: [0, 0], flag: 'chest.a-01', item: 'potion' },
      { type: 'chest', at: [1, 0], flag: 'chest.a-02', gold: 10 },
    ]),
    b: room('b', [
      { type: 'chest', at: [0, 0], flag: 'chest.b-01', item: 'potion' },
      { type: 'chest', at: [1, 0], flag: 'chest.a-02', item: 'potion' },
    ]),
  });
  expect(problems).toEqual([
    'Map b: the chest at (1, 0) has the flag chest.a-02, as the chest at (1, 0) on a does',
  ]);
});

describe('reaching maps', () => {
  const to = (map: string) => ({ map, spawn: 'in' });
  const room = (id: string, overrides: Partial<MapDef> = {}): MapDef => ({
    id,
    name: id,
    terrain: '..',
    legend: { '.': 'grass' },
    ...overrides,
  });
  const MAPS_TO_REACH: Record<string, MapDef> = {
    start: room('start', {
      objects: [{ type: 'prefab', prefab: 'door', at: [0, 0], to: to('house') }],
    }),
    house: room('house', { objects: [{ type: 'warp', at: [1, 0], to: to('cellar') }] }),
    cellar: room('cellar', { edges: { south: to('cave') } }),
    cave: room('cave'),
    // Only a script on the cave leads here; and nothing leads to the island at all.
    vault: room('vault'),
    island: room('island', { edges: { west: to('start') } }),
    // The tests go to the test maps through the debug menu.
    'test-yard': room('test-yard'),
  };

  test('reports maps that no way out or script leads to from the start', () => {
    const teleports = new Map([['cave', new Set(['vault'])]]);
    expect(checkReachable({ maps: MAPS_TO_REACH, start: 'start', teleports })).toEqual([
      "Map island can't be reached from start, where a new game starts",
    ]);
    expect(checkReachable({ maps: MAPS_TO_REACH, start: 'start', teleports: new Map() })).toEqual([
      "Map vault can't be reached from start, where a new game starts",
      "Map island can't be reached from start, where a new game starts",
    ]);
  });

  test('leaves a start that is not a map to the new game check', () => {
    expect(checkReachable({ maps: MAPS_TO_REACH, start: 'nowhere', teleports: new Map() })).toEqual(
      [],
    );
  });

  // The same check as `npm run validate`, so it also runs with the unit tests.
  test('every real map but the test maps can be reached from where a new game starts', async () => {
    const font = measureBodyFont(
      readFileSync(
        join(fileURLToPath(new URL('../public', import.meta.url)), ASSETS['font.body'].url),
      ),
    );
    const { teleports } = await checkEvents({
      events: EVENTS,
      speakers: SPEAKERS,
      maps: MAPS,
      characters: CHARACTERS,
      items: ITEMS,
      shops: SHOPS,
      manifest: ASSETS,
      font,
      chestText: CHEST_TEXT,
    });
    expect(checkReachable({ maps: MAPS, start: NEW_GAME.location.map, teleports })).toEqual([]);
  });
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real maps, terrains and prefabs check out', () => {
  const publicDir = fileURLToPath(new URL('../public', import.meta.url));
  const problems = checkMaps({
    maps: MAPS,
    content: MAP_CONTENT,
    manifest: ASSETS,
    imageSize: (url) => pngSize(readFileSync(join(publicDir, url))),
  });
  expect(problems).toEqual([]);
});

describe('map names', () => {
  /** Six pixels a character, and no lowercase z. */
  const FONT: MeasuredFont = {
    width: (text) => text.length * 6,
    has: (char) => char !== 'z',
  };
  const named = (name: string): Record<string, MapDef> => ({
    town: { id: 'town', name, terrain: '.', legend: { '.': 'grass' } },
  });

  test('fit the save menu, in characters the font has', () => {
    expect(checkMapNames(named('Saltmere'), FONT)).toEqual([]);
    expect(checkMapNames(named('Very Long Town Name Indeed'), FONT)).toEqual([
      'Map town: its name, "Very Long Town Name Indeed", is 156 pixels wide; the save menu has room for 92',
    ]);
    expect(checkMapNames(named('Zigzag Bazaar'), FONT)).toEqual([
      'Map town: its name, "Zigzag Bazaar", uses "z", which the font lacks',
    ]);
  });

  test('of the real maps fit, measured with the real font', () => {
    const font = measureBodyFont(
      readFileSync(
        join(fileURLToPath(new URL('../public', import.meta.url)), ASSETS['font.body'].url),
      ),
    );
    expect(checkMapNames(MAPS, font)).toEqual([]);
  });
});

describe('backdrops', () => {
  const grass = (width: number, height: number): string =>
    Array<string>(height).fill('.'.repeat(width)).join('\n');

  test('compile, and fill the screen', () => {
    expect(
      checkBackdrops(
        {
          meadow: { terrain: grass(20, 12), legend: { '.': 'grass' } },
          strip: { terrain: grass(20, 3), legend: { '.': 'grass' } },
          lost: { terrain: grass(20, 12), legend: { '.': 'moss' } },
        },
        content({}),
      ),
    ).toEqual([
      "Backdrop strip: it's 20×3 cells, not 20×12, the screen's size",
      'Backdrop lost: its legend uses "moss", which isn\'t a terrain',
    ]);
  });

  test('the real backdrops check out', () => {
    expect(checkBackdrops(BACKDROPS, MAP_CONTENT)).toEqual([]);
  });
});
