import { describe, expect, test } from 'vitest';
import { blobLookup, blobMask } from '../../core/map/autotile';
import { compileMap, isBlocked } from '../../core/map/compile';
import { NEW_GAME_START } from '../new-game';
import { MAP_CONTENT, TERRAINS } from '../terrain';
import { MAPS } from './index';

describe.each(Object.values(MAPS))('map $id', (map) => {
  test('compiles', () => {
    expect(() => compileMap(map, MAP_CONTENT)).not.toThrow();
  });

  test('has a kebab-case ID', () => {
    expect(map.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

test('the blob layout has a tile for every shape, but water has none for a lone cell', () => {
  // Every way to fill a 3×3 neighbourhood, one bit per cell, gives the 47 shapes blobMask knows.
  const shapes = new Set(
    Array.from({ length: 512 }, (_, cells) =>
      blobMask((dx, dy) => ((cells >> ((dy + 1) * 3 + dx + 1)) & 1) === 1),
    ),
  );
  expect(shapes.size).toBe(47);
  expect(new Set(blobLookup(TERRAINS.path.layout).keys())).toEqual(shapes);
  const water = new Set(blobLookup(TERRAINS.water.layout).keys());
  expect([...shapes].filter((shape) => !water.has(shape))).toEqual([0]);
});

test('a new game starts on a walkable cell', () => {
  const map = MAPS[NEW_GAME_START.map];
  expect(map).toBeDefined();
  if (!map) return;
  expect(isBlocked(compileMap(map, MAP_CONTENT), NEW_GAME_START.x, NEW_GAME_START.y)).toBe(false);
});
