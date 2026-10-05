import { describe, expect, test } from 'vitest';
import type { BackdropDef } from '../schema';
import { BACKDROP_SIZE, compileBackdrop } from './backdrop';
import type { MapContent } from './types';

const CONTENT: MapContent = {
  terrains: {
    grass: { kind: 'fill', sheet: 'tiles.grass', tiles: [[0, 0]] },
    sand: { kind: 'fill', sheet: 'tiles.grass', tiles: [[1, 0]] },
  },
  prefabs: { rock: { sheet: 'tiles.nature', origin: [4, 4], layout: ['##'] } },
};

/** Rows of one character, `width` long, then rows of another. */
const rows = (width: number, ...parts: [char: string, count: number][]): string =>
  parts.flatMap(([char, count]) => Array<string>(count).fill(char.repeat(width))).join('\n');

const FIELD: BackdropDef = {
  terrain: rows(BACKDROP_SIZE.width, ['s', 2], ['.', BACKDROP_SIZE.height - 2]),
  legend: { s: 'sand', '.': 'grass' },
  objects: [{ type: 'prefab', prefab: 'rock', at: [3, 5] }],
};

describe('compileBackdrop', () => {
  test('compiles a backdrop like a map, its prefabs and all', () => {
    const map = compileBackdrop('field', FIELD, CONTENT);
    expect(map).toMatchObject({ id: 'field', ...BACKDROP_SIZE });
    expect(map.layers.ground[0]).toEqual({ sheet: 'tiles.grass', col: 1, row: 0 });
    expect(map.layers.ground[2 * BACKDROP_SIZE.width]).toEqual({
      sheet: 'tiles.grass',
      col: 0,
      row: 0,
    });
    expect(map.layers.base[5 * BACKDROP_SIZE.width + 4]).toEqual({
      sheet: 'tiles.nature',
      col: 5,
      row: 4,
    });
  });

  test('a backdrop fills the screen: 20 cells across and 12 down', () => {
    const narrow = { ...FIELD, terrain: rows(19, ['.', 12]) };
    expect(() => compileBackdrop('narrow', narrow, CONTENT)).toThrow(
      "Backdrop narrow: it's 19×12 cells, not 20×12, the screen's size",
    );
    const short = { ...FIELD, terrain: rows(20, ['.', 11]) };
    expect(() => compileBackdrop('short', short, CONTENT)).toThrow(
      "Backdrop short: it's 20×11 cells, not 20×12, the screen's size",
    );
  });

  test("names the backdrop when it doesn't compile", () => {
    const lost = { ...FIELD, legend: { '.': 'grass' } };
    expect(() => compileBackdrop('lost', lost, CONTENT)).toThrow(
      `Backdrop lost: "s" at (0, 0) isn't in its legend`,
    );
  });
});
