import { describe, expect, test } from 'vitest';
import { baseDamage, baseHealing, finalDamage, finalHealing, type HitFactors } from './damage';
import { TUNING } from './fixtures';

describe('baseDamage', () => {
  test('is power × A² / (A + D)', () => {
    expect(baseDamage(1, 20, 10)).toBeCloseTo(400 / 30);
    expect(baseDamage(1.5, 20, 6)).toBeCloseTo(600 / 26);
  });

  test('never reaches 0, and each point of defense counts for less than the last', () => {
    const hits = [0, 10, 20, 30, 40, 1000].map((def) => baseDamage(1, 20, def));
    expect(hits[0]).toBe(20);
    for (const hit of hits) expect(hit).toBeGreaterThan(0);
    const cuts = hits.slice(1, 5).map((hit, index) => (hits[index] ?? 0) - hit);
    for (const [index, cut] of cuts.entries()) {
      if (index > 0) expect(cut).toBeLessThan(cuts[index - 1] ?? 0);
    }
  });

  test('is 0 without an attack stat', () => {
    expect(baseDamage(1, 0, 10)).toBe(0);
    expect(baseDamage(1, 0, 0)).toBe(0);
  });
});

describe('finalDamage', () => {
  const plain: HitFactors = { reaction: 'normal', critical: false, guarded: false, variance: 1 };

  test('rounds the damage', () => {
    expect(finalDamage(13.5, plain, TUNING)).toBe(14);
    expect(finalDamage(13.49, plain, TUNING)).toBe(13);
  });

  test('multiplies it by how the target takes the element', () => {
    expect(finalDamage(20, { ...plain, reaction: 'weak' }, TUNING)).toBe(30);
    expect(finalDamage(20, { ...plain, reaction: 'resist' }, TUNING)).toBe(10);
    expect(finalDamage(20, { ...plain, reaction: 'immune' }, TUNING)).toBe(0);
    // Absorbing heals the target by what they'd have taken.
    expect(finalDamage(20, { ...plain, reaction: 'absorb' }, TUNING)).toBe(20);
  });

  test('then by a critical hit, Guard and the variance', () => {
    expect(finalDamage(20, { ...plain, critical: true }, TUNING)).toBe(30);
    expect(finalDamage(20, { ...plain, guarded: true }, TUNING)).toBe(10);
    expect(finalDamage(20, { ...plain, variance: 1.1 }, TUNING)).toBe(22);
    // 20 × 1.5 × 1.5 × 0.5 × 0.9 = 20.25.
    const all = { reaction: 'weak', critical: true, guarded: true, variance: 0.9 } as const;
    expect(finalDamage(20, all, TUNING)).toBe(20);
  });

  test('is at least 1, unless the target is immune, and at most 9,999', () => {
    expect(finalDamage(0.2, plain, TUNING)).toBe(1);
    expect(finalDamage(0, plain, TUNING)).toBe(1);
    expect(finalDamage(0.2, { ...plain, reaction: 'immune' }, TUNING)).toBe(0);
    expect(finalDamage(20000, plain, TUNING)).toBe(9999);
    expect(finalDamage(9000, { ...plain, reaction: 'weak' }, TUNING)).toBe(9999);
  });
});

describe('healing', () => {
  test('is power × MAG × 2, times the variance, rounded', () => {
    expect(baseHealing(1, 20)).toBe(40);
    expect(baseHealing(0.5, 20)).toBe(20);
    expect(finalHealing(40, 1, TUNING)).toBe(40);
    expect(finalHealing(40, 1.1, TUNING)).toBe(44);
  });

  test('is at least 1 and at most 9,999', () => {
    expect(finalHealing(0, 1, TUNING)).toBe(1);
    expect(finalHealing(30000, 1, TUNING)).toBe(9999);
  });
});
