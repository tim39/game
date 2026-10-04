import { describe, expect, test } from 'vitest';
import { statsAtLevel, type Stat } from '../core/stats';
import { EXP_CURVE } from './balance';
import { CHARACTERS } from './characters';

const LEVELS = Array.from({ length: EXP_CURVE.maxLevel }, (_, index) => index + 1);

/** Each character's ID and stats at a level. */
const party = (level: number) =>
  Object.entries(CHARACTERS).map(([id, { stats }]) => ({ id, stats: statsAtLevel(stats, level) }));

/** Who has more of a stat than anyone else at a level, or undefined for a tie at the top. */
function most(stat: Stat, level: number): string | undefined {
  const [first, second] = party(level).sort((a, b) => b.stats[stat] - a.stats[stat]);
  return first && first.stats[stat] > (second?.stats[stat] ?? -1) ? first.id : undefined;
}

/** Who has less of a stat than anyone else at a level, or undefined for a tie at the bottom. */
function least(stat: Stat, level: number): string | undefined {
  const [first, second] = party(level).sort((a, b) => a.stats[stat] - b.stats[stat]);
  return first && first.stats[stat] < (second?.stats[stat] ?? Infinity) ? first.id : undefined;
}

test('the party is Rowan, Bram, Liora and Cass', () => {
  expect(Object.keys(CHARACTERS)).toEqual(['rowan', 'bram', 'liora', 'cass']);
});

// Their roles, from The party in docs/DESIGN.md. Each lists the levels where it doesn't hold.
describe('at every level', () => {
  const missing = (holds: (level: number) => boolean): number[] =>
    LEVELS.filter((level) => !holds(level));

  test('Bram, the tank, has the most HP and DEF, and the least SPD', () => {
    expect(
      missing(
        (level) =>
          most('hp', level) === 'bram' &&
          most('def', level) === 'bram' &&
          least('spd', level) === 'bram',
      ),
    ).toEqual([]);
  });

  test('Cass, the thief, has the most SPD', () => {
    expect(missing((level) => most('spd', level) === 'cass')).toEqual([]);
  });

  test('Liora, the healer, has the most MP, MAG and RES', () => {
    expect(
      missing((level) =>
        (['mp', 'mag', 'res'] as const).every((stat) => most(stat, level) === 'liora'),
      ),
    ).toEqual([]);
  });

  test('Rowan, the all-rounder, has the most ATK', () => {
    expect(missing((level) => most('atk', level) === 'rowan')).toEqual([]);
  });
});
