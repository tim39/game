import { describe, expect, test } from 'vitest';
import type { Direction } from './direction';
import {
  standingWalker,
  updateWalker,
  walkerPosition,
  walkPhase,
  type Walker,
  type WalkIntent,
} from './walker';

const SPEEDS = { walkMs: 200, runMs: 100 };
const open = { isBlocked: (): boolean => false };
/** A wall along x = 3. */
const wallAtX3 = { isBlocked: (x: number): boolean => x === 3 };

const hold = (direction: Direction | null, run = false): WalkIntent => ({ direction, run });

/** Runs updateWalker for each dt in turn, with the same intent. */
function walk(walker: Walker, intent: WalkIntent, ...dts: number[]): Walker {
  return dts.reduce((w, dt) => updateWalker(w, intent, dt, open, SPEEDS), walker);
}

test('a walker with nowhere to go stays put', () => {
  const walker = standingWalker(1, 1);
  expect(updateWalker(walker, hold(null), 16, open, SPEEDS)).toEqual(walker);
});

describe('a step', () => {
  test('claims the next cell at once, then slides there', () => {
    const walker = walk(standingWalker(1, 1), hold('right'), 50);
    expect(walker).toMatchObject({ x: 2, y: 1, facing: 'right', steps: 1 });
    expect(walker.step).toEqual({ fromX: 1, fromY: 1, elapsed: 50, duration: 200 });
    expect(walkerPosition(walker)).toEqual({ x: 1.25, y: 1 });
  });

  test('finishes even when the direction is let go', () => {
    const started = walk(standingWalker(1, 1), hold('down'), 50);
    const done = walk(started, hold(null), 100, 49, 1);
    expect(done).toMatchObject({ x: 1, y: 2, facing: 'down', step: null, steps: 1 });
    expect(walkerPosition(done)).toEqual({ x: 1, y: 2 });
  });

  test('can’t change direction until it’s done', () => {
    const started = walk(standingWalker(1, 1), hold('right'), 50);
    const later = walk(started, hold('up'), 50);
    expect(later).toMatchObject({ x: 2, y: 1, facing: 'right' });
    expect(walk(later, hold('up'), 150)).toMatchObject({ x: 2, y: 0, facing: 'up' });
  });

  test('is twice as quick when running', () => {
    const running = walk(standingWalker(1, 1), hold('left', true), 50);
    expect(running.step?.duration).toBe(100);
    expect(walkerPosition(running)).toEqual({ x: 0.5, y: 1 });
  });
});

test('holding a direction chains steps, carrying over the time left', () => {
  const walker = walk(standingWalker(0, 0), hold('right'), 150, 100);
  // 250 ms: one 200 ms step done, and 50 ms into the next.
  expect(walker).toMatchObject({ x: 2, steps: 2, step: { fromX: 1, elapsed: 50 } });
  // A long frame crosses several cells at once.
  expect(walk(standingWalker(0, 0), hold('right'), 650)).toMatchObject({
    x: 4,
    steps: 4,
    step: { fromX: 3, elapsed: 50 },
  });
});

test('a blocked direction turns the walker without moving them', () => {
  const walker = updateWalker(standingWalker(2, 0), hold('right'), 16, wallAtX3, SPEEDS);
  expect(walker).toMatchObject({ x: 2, y: 0, facing: 'right', step: null, steps: 0 });
  // A chain of steps stops at the wall too.
  const chained = updateWalker(standingWalker(0, 0), hold('right'), 650, wallAtX3, SPEEDS);
  expect(chained).toMatchObject({ x: 2, step: null, steps: 2 });
});

test('a step needs a positive duration', () => {
  expect(() =>
    updateWalker(standingWalker(0, 0), hold('up'), 16, open, { walkMs: 0, runMs: 0 }),
  ).toThrow('A step must take some time');
});

test('the walk cycle advances two half-steps per step, starting on a stride', () => {
  expect(walkPhase(standingWalker(0, 0))).toBeNull();
  const phases = [10, 100, 100, 100].reduce<{ walker: Walker; seen: (number | null)[] }>(
    ({ walker, seen }, dt) => {
      const next = walk(walker, hold('down'), dt);
      return { walker: next, seen: [...seen, walkPhase(next)] };
    },
    { walker: standingWalker(0, 0), seen: [] },
  ).seen;
  // 10 ms: first half of step 1; 110: second half; 210: first half of step 2; 310: its second half.
  expect(phases).toEqual([1, 2, 3, 4]);
});

test('a walk ends on a cell the world stops at, even with the direction held', () => {
  const doorAtX2 = { isBlocked: (): boolean => false, stopsAt: (x: number): boolean => x === 2 };
  // 650 ms would cross four cells, but the walk stops at the door after two.
  const walker = updateWalker(standingWalker(0, 0), hold('right'), 650, doorAtX2, SPEEDS);
  expect(walker).toMatchObject({ x: 2, step: null, steps: 2 });
  // Also when the step into it finishes on a later frame.
  const started = updateWalker(standingWalker(1, 0), hold('right'), 50, doorAtX2, SPEEDS);
  expect(updateWalker(started, hold('right'), 300, doorAtX2, SPEEDS)).toMatchObject({
    x: 2,
    step: null,
  });
});
