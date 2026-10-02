import { describe, expect, test } from 'vitest';
import { NEIGHBOUR_BITS as B, blobLookup, blobMask, parseNeighbours } from './autotile';

/** A blobMask neighbour test from a 3×3 picture of the cell's surroundings ('#' = same terrain). */
const around =
  (...rows: [string, string, string]) =>
  (dx: number, dy: number): boolean =>
    rows[dy + 1]?.[dx + 1] === '#';

describe('blobMask', () => {
  test('a cell on its own, and one surrounded by its own terrain', () => {
    expect(blobMask(around('...', '.#.', '...'))).toBe(0);
    expect(blobMask(around('###', '###', '###'))).toBe(255);
  });

  test('corners count only when both sides next to them do', () => {
    expect(blobMask(around('.##', '.##', '...'))).toBe(B.N | B.NE | B.E);
    expect(blobMask(around('.##', '.#.', '...'))).toBe(B.N); // NE without E
    expect(blobMask(around('#.#', '.#.', '#.#'))).toBe(0); // diagonals alone
    expect(blobMask(around('.#.', '###', '.#.'))).toBe(B.N | B.E | B.S | B.W);
  });
});

describe('parseNeighbours', () => {
  test('turns names into a mask', () => {
    expect(parseNeighbours('')).toBe(0);
    expect(parseNeighbours('N E NE')).toBe(B.N | B.E | B.NE);
    expect(parseNeighbours('N  S')).toBe(B.N | B.S);
  });

  test('rejects unknown names and corners without both sides', () => {
    expect(() => parseNeighbours('N up')).toThrow('"up" isn\'t a neighbour');
    expect(() => parseNeighbours('N NE')).toThrow('has NE without both N and E');
  });
});

describe('blobLookup', () => {
  test('finds each shape by its mask', () => {
    const lookup = blobLookup([
      [0, 0, 'E SE S'],
      [3, 1, 'N S'],
    ]);
    expect(lookup.get(B.E | B.SE | B.S)).toEqual([0, 0]);
    expect(lookup.get(B.N | B.S)).toEqual([3, 1]);
    expect(lookup.get(0)).toBeUndefined();
  });

  test('rejects two tiles with the same shape', () => {
    expect(() =>
      blobLookup([
        [0, 0, 'N S'],
        [1, 0, 'S N'],
      ]),
    ).toThrow('[1, 0] and [0, 0] both claim "S N"');
  });
});
