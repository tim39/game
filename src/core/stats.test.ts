import { describe, expect, test } from 'vitest';
import {
  GROWTH_LEVEL,
  STATS,
  statsAtLevel,
  withBuffs,
  withEquipment,
  type StatGrowth,
  type Stats,
} from './stats';

/** HP grows 10 a level and ATK 1; SPD grows 14 over 29 levels, so it rises in fits and starts. */
const GROWTH: StatGrowth = {
  hp: [100, 390],
  mp: [20, 20],
  atk: [10, 39],
  def: [8, 37],
  mag: [5, 34],
  res: [6, 35],
  spd: [10, 24],
};

const UP_DOWN = { up: 1.25, down: 0.75 };

describe('statsAtLevel', () => {
  test('gives a character their level 1 stats at level 1, and their level 30 ones at 30', () => {
    expect(GROWTH_LEVEL).toBe(30);
    expect(statsAtLevel(GROWTH, 1)).toEqual({
      hp: 100,
      mp: 20,
      atk: 10,
      def: 8,
      mag: 5,
      res: 6,
      spd: 10,
    });
    expect(statsAtLevel(GROWTH, 30)).toEqual({
      hp: 390,
      mp: 20,
      atk: 39,
      def: 37,
      mag: 34,
      res: 35,
      spd: 24,
    });
  });

  test('grows each stat evenly in between, rounded down', () => {
    expect(statsAtLevel(GROWTH, 2)).toMatchObject({ hp: 110, mp: 20, atk: 11 });
    expect(statsAtLevel(GROWTH, 16)).toMatchObject({ hp: 250, atk: 25 });
    // 14/29 of a point a level: 10.48, 10.97, 11.45, then 17.24 at level 16.
    expect([2, 3, 4, 16].map((level) => statsAtLevel(GROWTH, level).spd)).toEqual([10, 10, 11, 17]);
  });

  test('never lets a stat fall from one level to the next', () => {
    for (let level = 1; level < 40; level++) {
      const now = statsAtLevel(GROWTH, level);
      const next = statsAtLevel(GROWTH, level + 1);
      for (const stat of STATS) expect(next[stat]).toBeGreaterThanOrEqual(now[stat]);
    }
  });

  test('carries on at the same rate past level 30', () => {
    expect(statsAtLevel(GROWTH, 31)).toMatchObject({ hp: 400, atk: 40, mp: 20 });
  });

  test('takes whole levels from 1 up', () => {
    for (const level of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => statsAtLevel(GROWTH, level)).toThrow(RangeError);
    }
  });
});

describe('withEquipment', () => {
  const base: Stats = { hp: 100, mp: 20, atk: 10, def: 8, mag: 5, res: 6, spd: 10 };

  test('adds each piece’s bonuses to the stats it names', () => {
    const sword = { atk: 6 };
    const mail = { def: 5, hp: 20 };
    const ring = { spd: 2, atk: 1 };
    expect(withEquipment(base, [sword, mail, ring])).toEqual({
      hp: 120,
      mp: 20,
      atk: 17,
      def: 13,
      mag: 5,
      res: 6,
      spd: 12,
    });
    expect(withEquipment(base, [])).toEqual(base);
  });

  test('takes away for a penalty, but never below 0', () => {
    const heavy = { def: 9, spd: -3 };
    const cursed = { mag: -50 };
    expect(withEquipment(base, [heavy, cursed])).toMatchObject({ def: 17, spd: 7, mag: 0 });
  });
});

describe('withBuffs', () => {
  const base: Stats = { hp: 100, mp: 20, atk: 50, def: 13, mag: 15, res: 9, spd: 10 };

  test('multiplies a stat that is up or down, rounded down', () => {
    expect(withBuffs(base, { atk: 'up', def: 'down', mag: 'up', res: 'down' }, UP_DOWN)).toEqual({
      hp: 100,
      mp: 20,
      atk: 62,
      def: 9,
      mag: 18,
      res: 6,
      spd: 10,
    });
  });

  test('leaves alone the stats with no buff', () => {
    expect(withBuffs(base, {}, UP_DOWN)).toEqual(base);
    expect(withBuffs(base, { def: 'up' }, UP_DOWN)).toEqual({ ...base, def: 16 });
  });
});

test('makes new stats, and changes nothing it is given', () => {
  const growth = Object.freeze({ ...GROWTH });
  const stats = Object.freeze(statsAtLevel(growth, 5));
  const bonus = Object.freeze({ atk: 3 });
  expect(withEquipment(stats, [bonus])).not.toBe(stats);
  expect(withBuffs(stats, Object.freeze({ atk: 'up' as const }), UP_DOWN)).not.toBe(stats);
});
