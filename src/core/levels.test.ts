import { expect, test } from 'vitest';
import { expToReach, levelForExp, type ExpCurve } from './levels';

/** Levels 1 to 5 take 0, 10, 40, 90 and 160 EXP in all. */
const CURVE: ExpCurve = { maxLevel: 5, scale: 10, power: 2 };

test('level 1 takes no EXP, and each level after takes more', () => {
  expect([1, 2, 3, 4, 5].map((level) => expToReach(level, CURVE))).toEqual([0, 10, 40, 90, 160]);
});

test('takes whole EXP, rounded', () => {
  // 10 × 2^1.5 is 28.28, and 10 × 3^1.5 is 51.96.
  const curve: ExpCurve = { maxLevel: 4, scale: 10, power: 1.5 };
  expect([1, 2, 3, 4].map((level) => expToReach(level, curve))).toEqual([0, 10, 28, 52]);
});

test('EXP brings a character to the highest level it reaches, but no further than the last', () => {
  const levels = [0, 9, 10, 39, 40, 89, 90, 159, 160, 100_000].map((exp) =>
    levelForExp(exp, CURVE),
  );
  expect(levels).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('levels and EXP are whole numbers in range', () => {
  for (const level of [0, 6, 1.5, Number.NaN]) {
    expect(() => expToReach(level, CURVE)).toThrow(RangeError);
  }
  for (const exp of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => levelForExp(exp, CURVE)).toThrow(RangeError);
  }
});
