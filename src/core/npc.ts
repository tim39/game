import type { Condition } from './conditions';
import { DIRECTIONS, STEP, directionTowards, type Direction } from './direction';
import type { Rng } from './rng';
import { standingWalker, updateWalker, type Walker, type WalkWorld } from './walker';

/** How NPCs move. The numbers live in src/data/balance.ts. */
export interface NpcTuning {
  /** Milliseconds per step: NPCs amble. */
  readonly stepMs: number;
  /** A wanderer waits somewhere between these many milliseconds before each move. */
  readonly pauseMs: readonly [min: number, max: number];
  /** How long an NPC keeps looking at the player after being bumped into. */
  readonly lookMs: number;
}

/** An NPC as a map places it. */
export interface NpcPlacement {
  /** Unique on its map. */
  readonly id: string;
  /** A character sheet: `sprite.<sprite>` in the asset manifest. */
  readonly sprite: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Direction;
  /** How far it may wander from where it's placed, in cells across or down; 0 stands still. */
  readonly wander: number;
  /** The event script talking to it runs, if any (an ID in src/data/events). */
  readonly script?: string;
  /** Only there while this holds, as the player arrives on the map; always, without it. */
  readonly when?: Condition;
}

export interface Npc {
  readonly placement: NpcPlacement;
  readonly walker: Walker;
  /** Milliseconds until it next looks around or moves, or null when it has nothing planned. */
  readonly waitMs: number | null;
}

export function createNpc(placement: NpcPlacement, rng: Rng, tuning: NpcTuning): Npc {
  return {
    placement,
    walker: standingWalker(placement.x, placement.y, placement.facing),
    waitMs: placement.wander > 0 ? rng.range(...tuning.pauseMs) : null,
  };
}

/**
 * Moves an NPC on by `dt` milliseconds. A step under way finishes first. When its wait runs out,
 * a wanderer picks a direction at random, and steps that way if the cell is free and within reach
 * of home, or else just turns to look; an NPC that stands still turns back the way it was placed.
 */
export function updateNpc(
  npc: Npc,
  dt: number,
  world: WalkWorld,
  rng: Rng,
  tuning: NpcTuning,
): Npc {
  const speeds = { walkMs: tuning.stepMs, runMs: tuning.stepMs };
  const { placement, walker } = npc;
  if (walker.step) {
    return {
      ...npc,
      walker: updateWalker(walker, { direction: null, run: false }, dt, world, speeds),
    };
  }
  if (npc.waitMs === null) return npc;
  const waitMs = npc.waitMs - dt;
  if (waitMs > 0) return { ...npc, waitMs };

  if (placement.wander === 0) {
    return { ...npc, walker: { ...walker, facing: placement.facing }, waitMs: null };
  }
  const direction = rng.pick(DIRECTIONS);
  const [dx, dy] = STEP[direction];
  const inReach =
    Math.abs(walker.x + dx - placement.x) <= placement.wander &&
    Math.abs(walker.y + dy - placement.y) <= placement.wander;
  return {
    ...npc,
    walker: inReach
      ? updateWalker(walker, { direction, run: false }, 0, world, speeds)
      : { ...walker, facing: direction },
    waitMs: rng.range(...tuning.pauseMs),
  };
}

/** Turns an NPC to look at (x, y) for a while, unless it's mid-step. */
export function lookAt(npc: Npc, x: number, y: number, tuning: NpcTuning): Npc {
  if (npc.walker.step) return npc;
  const facing = directionTowards(npc.walker.x, npc.walker.y, x, y);
  return { ...npc, walker: { ...npc.walker, facing }, waitMs: tuning.lookMs };
}
