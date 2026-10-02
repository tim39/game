import { expect, test } from 'vitest';
import { standingWalker, updateWalker, type Walker } from '../core/walker';
import { characterFrame, sheetRows } from './character-frames';

const SPEEDS = { walkMs: 200, runMs: 100 };
const open = (): boolean => false;

/** The frames a walker shows at each of these moments (ms since setting off down). */
function framesWalkingDown(rows: number, ...moments: number[]): number[] {
  let walker: Walker = standingWalker(0, 0);
  let now = 0;
  return moments.map((moment) => {
    walker = updateWalker(walker, { direction: 'down', run: false }, moment - now, open, SPEEDS);
    now = moment;
    return characterFrame(walker, rows);
  });
}

test('standing still shows the first row, in the column for the way they face', () => {
  expect(characterFrame(standingWalker(0, 0, 'down'), 7)).toBe(0);
  expect(characterFrame(standingWalker(0, 0, 'up'), 7)).toBe(1);
  expect(characterFrame(standingWalker(0, 0, 'left'), 7)).toBe(2);
  expect(characterFrame(standingWalker(0, 0, 'right'), 7)).toBe(3);
});

test('walking cycles through rows 1, 2, 3, 0, two rows a step', () => {
  // Facing down is column 0, so the frame is row × 4.
  expect(framesWalkingDown(7, 10, 110, 210, 310, 410)).toEqual([4, 8, 12, 0, 4]);
});

test('a short sheet cycles through its two rows', () => {
  expect(framesWalkingDown(2, 10, 110, 210, 310)).toEqual([4, 0, 4, 0]);
});

test('sheetRows counts rows of four frames', () => {
  expect(sheetRows(28)).toBe(7);
  expect(sheetRows(8)).toBe(2);
});
