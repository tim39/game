import { describe, expect, test } from 'vitest';
import { compileMap, isBlocked, terrainRows, type CompiledMap, type LayerName } from './compile';
import type { MapContent, MapDef, MapObject } from './types';

const CONTENT: MapContent = {
  terrains: {
    grass: { kind: 'fill', sheet: 'tiles.grass', tiles: [[0, 0]] },
    meadow: {
      kind: 'fill',
      sheet: 'tiles.grass',
      tiles: [
        [0, 0, 3],
        [1, 0],
        [2, 0],
      ],
    },
    rock: { kind: 'fill', sheet: 'tiles.grass', tiles: [[5, 5]], solid: true },
    // Just the shapes a 2×2 pond, a row along the map's top edge and a 1-wide channel need.
    water: {
      kind: 'blob',
      sheet: 'tiles.water',
      origin: [0, 6],
      solid: true,
      layout: [
        [0, 0, 'E SE S'],
        [2, 0, 'S SW W'],
        [0, 2, 'N NE E'],
        [2, 2, 'N W NW'],
        [1, 1, 'N E SE S SW W NW NE'],
        [3, 0, 'S'],
        [3, 1, 'N S'],
        [3, 2, 'N'],
        [1, 0, 'E SE S SW W'],
      ],
    },
    trees: { kind: 'trees', ground: 'grass', trees: ['tree'], filler: 'bush' },
    'bad-trees': { kind: 'trees', ground: 'water', trees: ['tree'], filler: 'bush' },
  },
  prefabs: {
    tree: { sheet: 'tiles.nature', origin: [0, 0], layout: ['^^', '##'] },
    bush: { sheet: 'tiles.nature', origin: [0, 10], layout: ['#'] },
    hut: { sheet: 'tiles.house', origin: [4, 4], layout: ['^^', '#.', '# '] },
    oops: { sheet: 'tiles.house', origin: [0, 0], layout: ['#x'] },
  },
};

const LEGEND = {
  '.': 'grass',
  m: 'meadow',
  r: 'rock',
  '~': 'water',
  T: 'trees',
  B: 'bad-trees',
  '?': 'no-such-terrain',
};

const map = (terrain: string, objects: MapObject[] = []): MapDef => ({
  id: 'test',
  name: 'Test',
  terrain,
  legend: LEGEND,
  objects,
});

const compile = (terrain: string, objects?: MapObject[]): CompiledMap =>
  compileMap(map(terrain, objects), CONTENT);

/** One layer as a grid of "col,row" strings ("" for no tile), for readable expectations. */
function grid(compiled: CompiledMap, layer: LayerName): string[][] {
  return Array.from({ length: compiled.height }, (_, y) =>
    Array.from({ length: compiled.width }, (_, x) => {
      const tile = compiled.layers[layer][y * compiled.width + x];
      return tile ? `${tile.col},${tile.row}` : '';
    }),
  );
}

const solidRows = (compiled: CompiledMap): string[] =>
  Array.from({ length: compiled.height }, (_, y) =>
    Array.from({ length: compiled.width }, (_, x) => (isBlocked(compiled, x, y) ? '#' : '.')).join(
      '',
    ),
  );

test('terrainRows drops the blank lines and indentation around a map', () => {
  expect(terrainRows('\n    ab\n      cd\n\n')).toEqual(['ab', '  cd']);
});

describe('fill terrain', () => {
  test('covers its cells, solid or not as defined', () => {
    const compiled = compile(`
      ..r
      ...
    `);
    expect(compiled).toMatchObject({ id: 'test', width: 3, height: 2 });
    expect(grid(compiled, 'ground')).toEqual([
      ['0,0', '0,0', '5,5'],
      ['0,0', '0,0', '0,0'],
    ]);
    expect(solidRows(compiled)).toEqual(['..#', '...']);
    expect(compiled.layers.base.every((tile) => tile === null)).toBe(true);
  });

  test('mixes weighted variants the same way every time', () => {
    const terrain = Array.from({ length: 12 }, () => 'm'.repeat(12)).join('\n');
    const first = grid(compile(terrain), 'ground').flat();
    expect(grid(compile(terrain), 'ground').flat()).toEqual(first);
    const counts = new Map<string, number>();
    for (const tile of first) counts.set(tile, (counts.get(tile) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual(['0,0', '1,0', '2,0']);
    // The 3-weight variant shows up most.
    expect(counts.get('0,0')).toBeGreaterThan(
      Math.max(counts.get('1,0') ?? 0, counts.get('2,0') ?? 0),
    );
  });
});

describe('blob terrain', () => {
  test('picks edge and corner tiles from each cell’s neighbours', () => {
    const compiled = compile(`
      ....
      .~~.
      .~~.
      ....
    `);
    expect(grid(compiled, 'ground')).toEqual([
      ['0,0', '0,0', '0,0', '0,0'],
      ['0,0', '0,6', '2,6', '0,0'],
      ['0,0', '0,8', '2,8', '0,0'],
      ['0,0', '0,0', '0,0', '0,0'],
    ]);
    expect(solidRows(compiled)).toEqual(['....', '.##.', '.##.', '....']);
  });

  test('carries on past the map’s edge', () => {
    // Water on the top row carries on north, so this 1-wide channel only ends at (1, 1).
    const compiled = compile(`
      .~.
      .~.
      ...
    `);
    expect(grid(compiled, 'ground').map((row) => row[1])).toEqual(['3,7', '3,8', '0,0']);
    expect(() => compile('.~.\n...')).not.toThrow();
  });

  test('fails on a shape its layout has no tile for', () => {
    expect(() => compile('...\n.~.\n...')).toThrow(
      'Map test: water has no tile for its shape at (1, 1)',
    );
  });
});

describe('trees', () => {
  test('pair up along each row, with a filler for an odd cell, and overhang the row above', () => {
    const compiled = compile(`
      .....
      TTT..
      .....
    `);
    expect(grid(compiled, 'overhead')).toEqual([
      ['0,0', '1,0', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ]);
    expect(grid(compiled, 'base')).toEqual([
      ['', '', '', '', ''],
      ['0,1', '1,1', '0,10', '', ''],
      ['', '', '', '', ''],
    ]);
    // Trees stand on grass, and only their cells are solid: you can walk under a canopy.
    expect(grid(compiled, 'ground')[1]).toEqual(['0,0', '0,0', '0,0', '0,0', '0,0']);
    expect(solidRows(compiled)).toEqual(['.....', '###..', '.....']);
  });

  test('lose their canopy off the top of the map, and need fill ground', () => {
    const compiled = compile('TT\n..');
    expect(grid(compiled, 'base')[0]).toEqual(['0,1', '1,1']);
    expect(compiled.layers.overhead.every((tile) => tile === null)).toBe(true);
    expect(() => compile('BB\n..')).toThrow('bad-trees must stand on a fill terrain');
  });
});

describe('prefab objects', () => {
  test('draw under or over characters, and block where solid', () => {
    const compiled = compile('....\n....\n....\n....', [
      { type: 'prefab', prefab: 'hut', at: [1, 1] },
    ]);
    expect(grid(compiled, 'overhead')[1]).toEqual(['', '4,4', '5,4', '']);
    expect(grid(compiled, 'base')[2]).toEqual(['', '4,5', '5,5', '']);
    expect(grid(compiled, 'base')[3]).toEqual(['', '4,6', '', '']);
    expect(solidRows(compiled)).toEqual(['....', '....', '.#..', '.#..']);
  });

  test('must fit on the map, not overlap, and use known layout characters', () => {
    const hut = (x: number, y: number): MapObject => ({
      type: 'prefab',
      prefab: 'hut',
      at: [x, y],
    });
    expect(() => compile('...\n...', [hut(2, 0)])).toThrow('prefab hut at (2, 0) runs off the map');
    expect(() => compile('....\n....\n....', [hut(0, 0), hut(0, 0)])).toThrow(
      'two prefabs overlap at (0, 0)',
    );
    expect(() => compile('..', [{ type: 'prefab', prefab: 'oops', at: [0, 0] }])).toThrow(
      'prefab oops uses "x" in its layout',
    );
    expect(() => compile('..', [{ type: 'prefab', prefab: 'nope', at: [0, 0] }])).toThrow(
      '"nope" isn\'t a prefab',
    );
  });
});

test('terrain must be rectangular and every character known', () => {
  expect(() => compile('..\n...')).toThrow('row 1 is 3 cells wide, not 2');
  expect(() => compile('.x')).toThrow('"x" at (1, 0) isn\'t in its legend');
  expect(() => compile('.?')).toThrow('its legend uses "no-such-terrain", which isn\'t a terrain');
  expect(() => compile('\n\n')).toThrow('its terrain is empty');
});

test('isBlocked treats everything off the map as blocked', () => {
  const compiled = compile('..\n..');
  expect(isBlocked(compiled, 0, 0)).toBe(false);
  expect(isBlocked(compiled, -1, 0)).toBe(true);
  expect(isBlocked(compiled, 0, 2)).toBe(true);
});
