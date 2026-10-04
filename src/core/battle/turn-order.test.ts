import { describe, expect, test } from 'vitest';
import { TUNING } from './fixtures';
import { byTurn, delay, type TurnKey } from './turn-order';

describe('delay', () => {
  test('is round(rank × 1000 / (SPD + 10)), by rank', () => {
    // At SPD 10, a Normal action takes 1000 / 20 = 50.
    expect(delay(10, 'quick', 1, TUNING)).toBe(35);
    expect(delay(10, 'normal', 1, TUNING)).toBe(50);
    expect(delay(10, 'slow', 1, TUNING)).toBe(70);
    expect(delay(10, 'very-slow', 1, TUNING)).toBe(100);
    // 1000 / 21 = 47.6, and 700 / 21 = 33.3.
    expect(delay(11, 'normal', 1, TUNING)).toBe(48);
    expect(delay(11, 'quick', 1, TUNING)).toBe(33);
  });

  test('lets a fighter twice as fast act twice as often', () => {
    expect(delay(40, 'normal', 1, TUNING)).toBe(20);
    expect(delay(15, 'normal', 1, TUNING)).toBe(40);
  });

  test('is multiplied by Haste or Slow before it is rounded', () => {
    expect(delay(10, 'normal', 0.6, TUNING)).toBe(30);
    // 1000 / 21 × 1.6 = 76.2, where 48 × 1.6 would have made 77.
    expect(delay(11, 'normal', 1.6, TUNING)).toBe(76);
  });

  test('is never less than 1', () => {
    expect(delay(5000, 'quick', 0.6, TUNING)).toBe(1);
  });
});

describe('byTurn', () => {
  const key = (ct: number, spd: number, side: TurnKey['side'], slot: number): TurnKey => ({
    ct,
    spd,
    side,
    slot,
  });

  test('puts the lowest CT first', () => {
    const keys = [key(30, 10, 'party', 0), key(12, 5, 'enemies', 0), key(20, 1, 'party', 1)];
    expect(keys.sort(byTurn).map(({ ct }) => ct)).toEqual([12, 20, 30]);
  });

  test('breaks ties by the higher SPD, then the party, then whoever is further left', () => {
    const keys = [
      key(10, 5, 'enemies', 1),
      key(10, 5, 'enemies', 0),
      key(10, 5, 'party', 2),
      key(10, 9, 'enemies', 3),
      key(4, 1, 'enemies', 5),
    ];
    expect(keys.sort(byTurn)).toEqual([
      key(4, 1, 'enemies', 5),
      key(10, 9, 'enemies', 3),
      key(10, 5, 'party', 2),
      key(10, 5, 'enemies', 0),
      key(10, 5, 'enemies', 1),
    ]);
  });
});
