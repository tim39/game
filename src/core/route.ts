import type { Direction } from './direction';
import { updateWalker, type Walker, type WalkSpeeds, type WalkWorld } from './walker';

/** Someone being walked along a route by a script: `taken` is how many steps they've started. */
export interface RouteWalk {
  readonly route: readonly Direction[];
  readonly taken: number;
}

export interface RouteProgress {
  readonly walker: Walker;
  readonly walk: RouteWalk;
  /** Still going, there, or stuck: the next step is into something. */
  readonly status: 'walking' | 'arrived' | 'blocked';
}

/**
 * Moves a walker on along its route by `dt` milliseconds. The next step starts as soon as the last
 * one ends, as when a direction is held, so the walk never stutters. A step that's blocked doesn't
 * happen: the walker stands still, facing it, and the walk is `blocked`.
 */
export function walkRoute(
  walker: Walker,
  walk: RouteWalk,
  dt: number,
  world: WalkWorld,
  speeds: WalkSpeeds,
): RouteProgress {
  const direction = walk.route[walk.taken] ?? null;
  const next = updateWalker(walker, { direction, run: false }, dt, world, speeds);
  const taken = walk.taken + (next.steps - walker.steps);
  const progress = { walker: next, walk: { ...walk, taken } };
  if (next.step) return { ...progress, status: 'walking' };
  return { ...progress, status: taken >= walk.route.length ? 'arrived' : 'blocked' };
}
