import { describe, expect, test } from 'vitest';
import type { BackdropDef, PictureDef } from '../schema';
import { BACKDROP_SIZE, compileBackdrop, compilePicture } from './backdrop';
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

describe('compilePicture', () => {
  const NIGHT: PictureDef = {
    ...FIELD,
    shade: 0x5a68a0,
    mist: true,
    lights: [{ at: [3, 5], color: 0xffd98a, radius: 2, beam: true }],
  };

  test('compiles a picture as a backdrop, whatever it has over it', () => {
    expect(compilePicture('night', NIGHT, CONTENT)).toEqual(
      compileBackdrop('night', FIELD, CONTENT),
    );
  });

  test('names the picture when it doesn’t compile, or doesn’t fill the screen', () => {
    const lost = { ...NIGHT, legend: { '.': 'grass' } };
    expect(() => compilePicture('lost', lost, CONTENT)).toThrow(
      `Picture lost: "s" at (0, 0) isn't in its legend`,
    );
    const short = { ...NIGHT, terrain: rows(20, ['.', 11]) };
    expect(() => compilePicture('short', short, CONTENT)).toThrow(
      "Picture short: it's 20×11 cells, not 20×12, the screen's size",
    );
  });

  test('keeps its lights on it', () => {
    const { width, height } = BACKDROP_SIZE;
    const light = { color: 0xffd98a, radius: 1 };
    const corner = { ...NIGHT, lights: [{ ...light, at: [width - 1, height - 1] as const }] };
    expect(() => compilePicture('corner', corner, CONTENT)).not.toThrow();
    const off = {
      ...NIGHT,
      lights: [light, light].map((l, i) => ({ ...l, at: [i * width, 0] as const })),
    };
    expect(() => compilePicture('off', off, CONTENT)).toThrow(
      'Picture off: lights[1] is at (20, 0), off the picture',
    );
  });
});
