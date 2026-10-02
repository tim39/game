import { describe, expect, it } from 'vitest';
import { measureGlyphColumns } from './glyph-metrics';

/** Builds an alpha lookup from rows of '#' (visible) and '.' (transparent). */
function sheet(rows: string[]): (x: number, y: number) => number {
  return (x, y) => (rows[y]?.[x] === '#' ? 255 : 0);
}

describe('measureGlyphColumns', () => {
  it('finds the visible columns of each cell, row by row', () => {
    // Three 4×2 cells in two rows of two: a wide glyph, a narrow one, and an empty cell.
    const alpha = sheet(['####..#.', '#..#..#.', '....', '....']);
    expect(measureGlyphColumns(alpha, 3, 2, 4, 2)).toEqual([
      { left: 0, right: 3 },
      { left: 2, right: 2 },
      null,
    ]);
  });

  it('counts a pixel anywhere in the column, not only on the top row', () => {
    const alpha = sheet(['....', '.#..', '...#']);
    expect(measureGlyphColumns(alpha, 1, 1, 4, 3)).toEqual([{ left: 1, right: 3 }]);
  });
});
