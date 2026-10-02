import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import type { MapContent, MapDef } from '../src/core/map/types';
import { MAPS } from '../src/data/maps';
import { MAP_CONTENT } from '../src/data/terrain';
import { ASSETS, type AssetEntry } from '../src/systems/asset-manifest';
import { pngSize } from './asset-checks';
import { checkMaps } from './map-checks';

const MANIFEST: Record<string, AssetEntry> = {
  'tiles.grass': { type: 'spritesheet', url: 'grass.png', frameWidth: 16, frameHeight: 16 },
  'ui.box': { type: 'image', url: 'box.png' },
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
