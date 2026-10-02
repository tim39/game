import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

const take = (rng: Rng, count: number): number[] =>
  Array.from({ length: count }, () => rng.nextUint32());

describe('Rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(Rng.fromSeed(42), 1000)).toEqual(take(Rng.fromSeed(42), 1000));
    expect(take(Rng.fromSeed('tide-caves'), 100)).toEqual(take(Rng.fromSeed('tide-caves'), 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(Rng.fromSeed(1), 8)).not.toEqual(take(Rng.fromSeed(2), 8));
    expect(take(Rng.fromSeed('a'), 8)).not.toEqual(take(Rng.fromSeed('b'), 8));
  });

  it('produces the same numbers as when this test was written', () => {
    // Saved battles and simulator baselines depend on this exact sequence.
    // If this fails, the algorithm changed; only update these values on purpose.
    expect(take(Rng.fromSeed(12345), 5)).toEqual(GOLDEN_12345);
  });

  it('continues identically from a saved state, including through JSON', () => {
    const original = Rng.fromSeed(7);
    take(original, 50);
    const saved: unknown = JSON.parse(JSON.stringify(original.state()));
    const resumed = Rng.fromState(saved as ReturnType<Rng['state']>);
    expect(take(resumed, 100)).toEqual(take(original, 100));
  });

  it('keeps next() in [0, 1) with a mean near 0.5', () => {
    const rng = Rng.fromSeed(99);
    const samples = Array.from({ length: 20_000 }, () => rng.next());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it('rolls int() across the whole range and nothing outside it', () => {
    const rng = Rng.fromSeed(2024);
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const roll = rng.int(1, 6);
      counts.set(roll, (counts.get(roll) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
    expect(rng.int(5, 5)).toBe(5);
  });

  it('rejects impossible int() ranges', () => {
    const rng = Rng.fromSeed(0);
    expect(() => rng.int(3, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });

  it('honours chance() at the extremes and in between', () => {
    const rng = Rng.fromSeed(5);
    const rolls = (p: number) => Array.from({ length: 10_000 }, () => rng.chance(p));
    expect(rolls(0).some(Boolean)).toBe(false);
    expect(rolls(1).every(Boolean)).toBe(true);
    const hits = rolls(0.25).filter(Boolean).length;
    expect(hits).toBeGreaterThan(2300);
    expect(hits).toBeLessThan(2700);
  });

  it('keeps range() within its bounds', () => {
    const rng = Rng.fromSeed(11);
    for (let i = 0; i < 1000; i++) {
      const x = rng.range(0.9, 1.1);
      expect(x).toBeGreaterThanOrEqual(0.9);
      expect(x).toBeLessThan(1.1);
    }
  });

  it('picks every item eventually, and refuses an empty list', () => {
    const rng = Rng.fromSeed(3);
    const seen = new Set(Array.from({ length: 200 }, () => rng.pick(['wolf', 'bat', 'slime'])));
    expect(seen).toEqual(new Set(['wolf', 'bat', 'slime']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('chooses weighted() values in proportion and never picks zero weights', () => {
    const rng = Rng.fromSeed(8);
    const table = [
      { weight: 3, value: 'common' },
      { weight: 0, value: 'never' },
      { weight: 1, value: 'rare' },
    ];
    const results = Array.from({ length: 8000 }, () => rng.weighted(table));
    expect(results).not.toContain('never');
    const common = results.filter((r) => r === 'common').length;
    expect(common).toBeGreaterThan(5700);
    expect(common).toBeLessThan(6300);
  });

  it('rejects weighted() tables that cannot be rolled', () => {
    const rng = Rng.fromSeed(8);
    expect(() => rng.weighted([])).toThrow(RangeError);
    expect(() => rng.weighted([{ weight: 0, value: 'x' }])).toThrow(RangeError);
    expect(() => rng.weighted([{ weight: -1, value: 'x' }])).toThrow(RangeError);
    expect(() => rng.weighted([{ weight: Number.NaN, value: 'x' }])).toThrow(RangeError);
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const shuffled = Rng.fromSeed(13).shuffle(input);
    expect([...shuffled].sort((x, y) => x - y)).toEqual([...input]);
    expect(shuffled).not.toEqual([...input]);
    expect(Rng.fromSeed(13).shuffle(input)).toEqual(shuffled);
  });
});

// The core matches a C translation of the PractRand reference sfc32; these pin our seeding too.
const GOLDEN_12345 = [2345461488, 1344865159, 2974739204, 3448212715, 1746298622];
