import { describe, expect, test } from 'vitest';
import { walkRoute, type RouteProgress, type RouteWalk } from './route';
import { standingWalker, type WalkWorld } from './walker';

const SPEEDS = { walkMs: 200, runMs: 100 };
const open: WalkWorld = { isBlocked: () => false };

/** Walks the route in 16 ms frames until it ends, noting where the walker was each frame. */
function walkAll(route: RouteWalk['route'], world = open) {
  let progress: RouteProgress = {
    walker: standingWalker(5, 5, 'down'),
    walk: { route, taken: 0 },
    status: 'walking',
  };
  const frames: { x: number; y: number; stepping: boolean }[] = [];
  for (let frame = 0; frame < 500 && progress.status === 'walking'; frame++) {
    progress = walkRoute(progress.walker, progress.walk, 16, world, SPEEDS);
    frames.push({ x: progress.walker.x, y: progress.walker.y, stepping: !!progress.walker.step });
  }
  return { progress, frames };
}

describe('walkRoute', () => {
  test('walks the route a step at a time, and arrives', () => {
    const { progress } = walkAll(['left', 'left', 'up']);
    expect(progress.status).toBe('arrived');
    expect(progress.walker).toMatchObject({ x: 3, y: 4, facing: 'up', step: null, steps: 3 });
  });

  test('goes straight from one step into the next, without standing still between', () => {
    const { frames } = walkAll(['right', 'right', 'right']);
    // Stepping every frame until the last, which is where it stands.
    expect(frames.slice(0, -1).every((frame) => frame.stepping)).toBe(true);
    expect(frames.at(-1)).toEqual({ x: 8, y: 5, stepping: false });
    // Three 200 ms steps, in 16 ms frames.
    expect(frames.length).toBe(Math.ceil(600 / 16));
  });

  test('stops at a blocked step, facing it', () => {
    const wall: WalkWorld = { isBlocked: (x) => x === 7 };
    const { progress } = walkAll(['right', 'right', 'up'], wall);
    expect(progress.status).toBe('blocked');
    expect(progress.walk.taken).toBe(1);
    expect(progress.walker).toMatchObject({ x: 6, y: 5, facing: 'right', step: null });
  });

  test('with nowhere to go, has already arrived', () => {
    const walker = standingWalker(1, 1);
    const progress = walkRoute(walker, { route: [], taken: 0 }, 16, open, SPEEDS);
    expect(progress.status).toBe('arrived');
    expect(progress.walker).toEqual(walker);
  });
});
