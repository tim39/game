import { STEP, type Direction } from './direction';

/** Someone who walks the grid a tile at a time: the player now, NPCs later. */
export interface Walker {
  /** The cell they're in, or moving into: a step claims its cell as it starts. */
  readonly x: number;
  readonly y: number;
  readonly facing: Direction;
  /** The step under way, if any. */
  readonly step: Step | null;
  /** Steps started so far, which the walk cycle follows. */
  readonly steps: number;
}

export interface Step {
  /** The cell being left. */
  readonly fromX: number;
  readonly fromY: number;
  /** Milliseconds into the step, out of `duration`. */
  readonly elapsed: number;
  readonly duration: number;
}

/** What the controls ask for this frame. */
export interface WalkIntent {
  readonly direction: Direction | null;
  readonly run: boolean;
}

/** Milliseconds to cross one tile. */
export interface WalkSpeeds {
  readonly walkMs: number;
  readonly runMs: number;
}

export const standingWalker = (x: number, y: number, facing: Direction = 'down'): Walker => ({
  x,
  y,
  facing,
  step: null,
  steps: 0,
});

/**
 * Moves a walker on by `dt` milliseconds. A step, once started, always finishes. While a direction
 * is held the next step starts straight away, with any time left over, so walking never stutters.
 * A direction towards a blocked cell turns the walker without moving them.
 */
export function updateWalker(
  walker: Walker,
  intent: WalkIntent,
  dt: number,
  isBlocked: (x: number, y: number) => boolean,
  speeds: WalkSpeeds,
): Walker {
  let current = walker;
  let time = dt;

  if (current.step) {
    const elapsed = current.step.elapsed + time;
    if (elapsed < current.step.duration) return { ...current, step: { ...current.step, elapsed } };
    time = elapsed - current.step.duration;
    current = { ...current, step: null };
  }

  const { direction } = intent;
  while (direction) {
    const [dx, dy] = STEP[direction];
    const x = current.x + dx;
    const y = current.y + dy;
    if (isBlocked(x, y)) return { ...current, facing: direction };
    const duration = intent.run ? speeds.runMs : speeds.walkMs;
    if (!(duration > 0)) throw new Error(`A step must take some time, not ${duration} ms`);
    const step = { fromX: current.x, fromY: current.y, elapsed: time, duration };
    current = { x, y, facing: direction, step, steps: current.steps + 1 };
    if (time < duration) return current;
    time -= duration;
    current = { ...current, step: null };
  }
  return current;
}

/** Where a walker is, in cells: between two cells partway through a step. */
export function walkerPosition(walker: Walker): { x: number; y: number } {
  const { step } = walker;
  if (!step) return { x: walker.x, y: walker.y };
  const t = step.elapsed / step.duration;
  return {
    x: step.fromX + (walker.x - step.fromX) * t,
    y: step.fromY + (walker.y - step.fromY) * t,
  };
}

/**
 * How far through the walk cycle a walker is, counting half-steps, or null when standing still.
 * Each step covers two: it starts on a stride and ends with the feet together.
 */
export function walkPhase(walker: Walker): number | null {
  const { step } = walker;
  if (!step) return null;
  return walker.steps * 2 - 1 + (step.elapsed * 2 >= step.duration ? 1 : 0);
}
