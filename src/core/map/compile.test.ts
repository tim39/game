import { describe, expect, test } from 'vitest';
import {
  compileMap,
  exitAt,
  isBlocked,
  scriptAt,
  terrainRows,
  type CompiledMap,
  type LayerName,
} from './compile';
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
    shed: { sheet: 'tiles.house', origin: [0, 0], layout: ['^^', '#D'] },
    'two-doors': { sheet: 'tiles.house', origin: [0, 0], layout: ['DD'] },
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

const map = (terrain: string, objects: MapObject[] = [], edges?: MapDef['edges']): MapDef => ({
  id: 'test',
  name: 'Test',
  terrain,
  legend: LEGEND,
  objects,
  edges,
});

const compile = (terrain: string, objects?: MapObject[], edges?: MapDef['edges']): CompiledMap =>
  compileMap(map(terrain, objects, edges), CONTENT);

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

describe('exits and arrivals', () => {
  const HOME = { map: 'home', spawn: 'door' };
  const FIELD = { map: 'field', spawn: 'gate' };

  test('a prefab’s doorway leads where the map says, and is walkable even in solid terrain', () => {
    const compiled = compile('rr\nrr', [{ type: 'prefab', prefab: 'shed', at: [0, 0], to: HOME }]);
    expect(isBlocked(compiled, 1, 1)).toBe(false);
    expect(exitAt(compiled, 1, 1)).toEqual(HOME);
    expect(exitAt(compiled, 0, 1)).toBeNull();
    expect(grid(compiled, 'base')[1]).toEqual(['0,1', '1,1']);
  });

  test('a doorway with nowhere to go is a wall', () => {
    const compiled = compile('..\n..', [{ type: 'prefab', prefab: 'shed', at: [0, 0] }]);
    expect(isBlocked(compiled, 1, 1)).toBe(true);
    expect(exitAt(compiled, 1, 1)).toBeNull();
  });

  test('warps and spawns are placed by cell', () => {
    const compiled = compile('...\n...', [
      { type: 'warp', at: [2, 0], to: HOME },
      { type: 'spawn', id: 'start', at: [0, 1], facing: 'up' },
    ]);
    expect(exitAt(compiled, 2, 0)).toEqual(HOME);
    expect(compiled.spawns).toEqual({ start: { x: 0, y: 1, facing: 'up' } });
  });

  test('an edge with an exit is open, and the others are walls', () => {
    const compiled = compile('...\n...', [], { west: FIELD });
    expect(isBlocked(compiled, -1, 0)).toBe(false);
    expect(exitAt(compiled, -1, 1)).toEqual(FIELD);
    expect(isBlocked(compiled, 3, 0)).toBe(true);
    expect(exitAt(compiled, 0, -1)).toBeNull();
  });

  test('must be reachable, unique and on the map', () => {
    const spawn = (id: string, x: number, y: number): MapObject => ({
      type: 'spawn',
      id,
      at: [x, y],
      facing: 'down',
    });
    const warp = (x: number, y: number): MapObject => ({ type: 'warp', at: [x, y], to: HOME });
    expect(() => compile('.r', [spawn('a', 1, 0)])).toThrow('spawn a is on a solid cell');
    expect(() => compile('..', [spawn('a', 0, 0), spawn('a', 1, 0)])).toThrow(
      'two spawns are called a',
    );
    expect(() => compile('..', [spawn('a', 2, 0)])).toThrow('spawn a at (2, 0) is off the map');
    expect(() => compile('.r', [warp(1, 0)])).toThrow('the warp at (1, 0) is on a solid cell');
    expect(() => compile('..', [warp(0, 0), warp(0, 0)])).toThrow('two warps share (0, 0)');
    expect(() => compile('..', [{ type: 'prefab', prefab: 'hut', at: [0, 0], to: HOME }])).toThrow(
      'prefab hut at (0, 0) has no doorway to lead anywhere',
    );
    expect(() => compile('..', [{ type: 'prefab', prefab: 'two-doors', at: [0, 0] }])).toThrow(
      'prefab two-doors has 2 doorways; one at most',
    );
  });
});

describe('npcs', () => {
  const npc = (id: string, x: number, y: number, wander?: number): MapObject => ({
    type: 'npc',
    id,
    sprite: 'villager',
    at: [x, y],
    facing: 'down',
    wander,
  });

  test('are listed where they start, standing still unless they may wander', () => {
    const compiled = compile('...\n...', [npc('a', 0, 0), npc('b', 2, 1, 2)]);
    expect(compiled.npcs).toEqual([
      { id: 'a', sprite: 'villager', x: 0, y: 0, facing: 'down', wander: 0 },
      { id: 'b', sprite: 'villager', x: 2, y: 1, facing: 'down', wander: 2 },
    ]);
  });

  test('can’t start on solid cells, ways out, spawns or each other', () => {
    const HOME = { map: 'home', spawn: 'door' };
    expect(() => compile('.r', [npc('a', 1, 0)])).toThrow('npc a at (1, 0) is on a solid cell');
    expect(() => compile('..', [{ type: 'warp', at: [0, 0], to: HOME }, npc('a', 0, 0)])).toThrow(
      'npc a at (0, 0) is in a way out',
    );
    expect(() =>
      compile('..', [{ type: 'spawn', id: 'door', at: [1, 0], facing: 'up' }, npc('a', 1, 0)]),
    ).toThrow('npc a at (1, 0) is on spawn door');
    expect(() => compile('..', [npc('a', 0, 0), npc('b', 0, 0)])).toThrow(
      'npc a at (0, 0) shares its cell',
    );
    expect(() => compile('..', [npc('a', 0, 0), npc('a', 1, 0)])).toThrow('two npcs are called a');
    expect(() => compile('..', [npc('a', 0, 0, -1)])).toThrow("npc a can't wander -1");
  });
});

test('a prefab with a script runs it from any of its tiles under characters', () => {
  const compiled = compile('..\n..', [
    { type: 'prefab', prefab: 'shed', at: [0, 0], script: 'shed' },
  ]);
  // The shed's top row is a roof drawn over characters, so only its bottom row counts.
  expect(scriptAt(compiled, 0, 0)).toBeNull();
  expect(scriptAt(compiled, 0, 1)).toBe('shed');
  expect(scriptAt(compiled, 1, 1)).toBe('shed');
  expect(scriptAt(compiled, -1, 1)).toBeNull();
});

test('an npc keeps its script', () => {
  const compiled = compile('..', [
    { type: 'npc', id: 'a', sprite: 'villager', at: [0, 0], facing: 'down', script: 'hello' },
  ]);
  expect(compiled.npcs[0]?.script).toBe('hello');
});
