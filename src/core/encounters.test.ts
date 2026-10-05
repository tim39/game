import { describe, expect, test } from 'vitest';
import {
  ENCOUNTER_RATES,
  battleDue,
  countStep,
  encounterCountdown,
  rollEncounter,
  type EncounterRate,
  type EncounterTuning,
} from './encounters';
import { Rng } from './rng';
import type { EncounterTable } from './schema';

/** The numbers in docs/DESIGN.md: 24 to 40 steps, Low half as often and High twice as often. */
const TUNING: EncounterTuning = {
  steps: [24, 40],
  rates: { off: 0, low: 0.5, normal: 1, high: 2 },
  preemptive: 0.08,
  ambush: 0.04,
};

/** How many steps it takes from a countdown to a battle at a rate, if one ever comes. */
function stepsToBattle(countdown: number, rate: EncounterRate): number | null {
  let left = countdown;
  for (let steps = 1; steps <= 1000; steps++) {
    const due = battleDue(left, rate, TUNING);
    left = countStep(left, rate, TUNING);
    expect(due).toBe(left <= 0);
    if (due) return steps;
  }
  return null;
}

describe('the countdown', () => {
  test('is a whole number of steps from 24 to 40, every one of them as likely', () => {
    const seen = new Map<number, number>();
    const rng = Rng.fromSeed('countdown');
    for (let roll = 0; roll < 17_000; roll++) {
      const steps = encounterCountdown(rng, TUNING);
      seen.set(steps, (seen.get(steps) ?? 0) + 1);
    }
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 17 }, (_, index) => 24 + index),
    );
    for (const count of seen.values()) expect(count).toBeGreaterThan(800);
  });

  test('is the same from the same seed', () => {
    const rolls = (seed: number) => {
      const rng = Rng.fromSeed(seed);
      return Array.from({ length: 5 }, () => encounterCountdown(rng, TUNING));
    };
    expect(rolls(7)).toEqual(rolls(7));
  });

  test('runs down a step at a time at Normal, half as fast at Low and twice as fast at High', () => {
    expect(stepsToBattle(30, 'normal')).toBe(30);
    expect(stepsToBattle(30, 'low')).toBe(60);
    expect(stepsToBattle(30, 'high')).toBe(15);
    expect(stepsToBattle(25, 'high')).toBe(13);
  });

  test('never runs out at Off', () => {
    expect(stepsToBattle(1, 'off')).toBeNull();
    expect(battleDue(0, 'off', TUNING)).toBe(false);
  });

  test('keeps the steps already taken when the rate changes', () => {
    // Ten steps at Normal, then the rest at Low.
    let left = 30;
    for (let step = 0; step < 10; step++) left = countStep(left, 'normal', TUNING);
    expect(stepsToBattle(left, 'low')).toBe(40);
  });

  test('has a rate for each of the options', () => {
    expect(Object.keys(TUNING.rates).sort()).toEqual([...ENCOUNTER_RATES].sort());
  });
});

describe('rollEncounter', () => {
  const table: EncounterTable = {
    groups: [{ enemies: ['wolf'], weight: 3 }, { enemies: ['wolf', 'wolf'] }],
  };

  test('picks each group as often as its weight says', () => {
    const rng = Rng.fromSeed('groups');
    let pairs = 0;
    const battles = 20_000;
    for (let battle = 0; battle < battles; battle++) {
      if (rollEncounter(table, rng, TUNING).enemies.length === 2) pairs++;
    }
    expect(pairs / battles).toBeCloseTo(0.25, 1);
  });

  test('gives the party the jump 8% of the time, and the enemies 4%', () => {
    const rng = Rng.fromSeed('jump');
    const starts = { preemptive: 0, ambush: 0, none: 0 };
    const battles = 50_000;
    for (let battle = 0; battle < battles; battle++) {
      starts[rollEncounter(table, rng, TUNING).start ?? 'none']++;
    }
    expect(starts.preemptive / battles).toBeCloseTo(0.08, 2);
    expect(starts.ambush / battles).toBeCloseTo(0.04, 2);
  });

  test('is the same from the same seed, and draws twice', () => {
    const one = Rng.fromSeed(3);
    const other = Rng.fromSeed(3);
    expect(rollEncounter(table, one, TUNING)).toEqual(rollEncounter(table, other, TUNING));
    const drawn = Rng.fromSeed(3);
    drawn.next();
    drawn.next();
    expect(one.next()).toBe(drawn.next());
  });

  test('only ever picks a group from the table', () => {
    const rng = Rng.fromSeed('only');
    const single: EncounterTable = { groups: [{ enemies: ['slime', 'slime', 'slime'] }] };
    for (let battle = 0; battle < 50; battle++) {
      expect(rollEncounter(single, rng, TUNING).enemies).toEqual(['slime', 'slime', 'slime']);
    }
  });
});
