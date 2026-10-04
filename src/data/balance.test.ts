import { expect, test } from 'vitest';
import { expToReach } from '../core/levels';
import { BUFF_MULTIPLIERS, EXP_CURVE } from './balance';

test('the level cap is 30, as Scope in docs/DESIGN.md has it', () => {
  expect(EXP_CURVE.maxLevel).toBe(30);
});

test('the EXP curve starts at nothing, and each level takes more EXP than the last did', () => {
  const total = Array.from({ length: EXP_CURVE.maxLevel }, (_, index) =>
    expToReach(index + 1, EXP_CURVE),
  );
  expect(total[0]).toBe(0);
  const steps = total.slice(1).map((exp, index) => exp - (total[index] ?? 0));
  for (const [index, step] of steps.entries()) {
    expect(step).toBeGreaterThan(index === 0 ? 0 : (steps[index - 1] ?? 0));
  }
});

test('Up raises a stat and Down lowers it', () => {
  expect(BUFF_MULTIPLIERS.up).toBeGreaterThan(1);
  expect(BUFF_MULTIPLIERS.down).toBeLessThan(1);
  expect(BUFF_MULTIPLIERS.down).toBeGreaterThan(0);
});
