import { describe, expect, test } from 'vitest';
import { directionTowards } from './direction';
import { createNpc, lookAt, updateNpc, type Npc, type NpcPlacement } from './npc';
import { Rng } from './rng';
import { occupies, updateWalker, standingWalker, type WalkWorld } from './walker';

const TUNING = { stepMs: 300, pauseMs: [500, 1500], lookMs: 2000 } as const;
const open: WalkWorld = { isBlocked: () => false };

const placed = (overrides: Partial<NpcPlacement> = {}): NpcPlacement => ({
  id: 'villager',
  sprite: 'villager',
  x: 10,
  y: 10,
  facing: 'down',
  wander: 0,
  ...overrides,
});

/** Runs an NPC for `ms` milliseconds in 16 ms frames, recording every cell it stands in. */
function run(npc: Npc, ms: number, world: WalkWorld, rng: Rng): { npc: Npc; cells: string[] } {
  const cells = new Set<string>();
  for (let t = 0; t < ms; t += 16) {
    npc = updateNpc(npc, 16, world, rng, TUNING);
    cells.add(`${npc.walker.x},${npc.walker.y}`);
  }
  return { npc, cells: [...cells] };
}

test('an NPC placed to stand still never moves', () => {
  const rng = Rng.fromSeed(1);
  const { npc, cells } = run(createNpc(placed(), rng, TUNING), 30_000, open, rng);
  expect(cells).toEqual(['10,10']);
  expect(npc.walker.facing).toBe('down');
  expect(npc.waitMs).toBeNull();
});

describe('a wanderer', () => {
  test('moves about, but never further from home than it may', () => {
    const rng = Rng.fromSeed('wander');
    const { cells } = run(createNpc(placed({ wander: 2 }), rng, TUNING), 120_000, open, rng);
    expect(cells.length).toBeGreaterThan(5);
    for (const cell of cells) {
      const [x = 0, y = 0] = cell.split(',').map(Number);
      expect(Math.abs(x - 10)).toBeLessThanOrEqual(2);
      expect(Math.abs(y - 10)).toBeLessThanOrEqual(2);
    }
  });

  test('stays out of blocked cells', () => {
    const rng = Rng.fromSeed('walls');
    // Walls all round, but for the cells straight above.
    const corridor: WalkWorld = { isBlocked: (x) => x !== 10 };
    const { cells } = run(createNpc(placed({ wander: 3 }), rng, TUNING), 120_000, corridor, rng);
    expect(cells.every((cell) => cell.startsWith('10,'))).toBe(true);
    expect(cells.length).toBeGreaterThan(1);
  });

  test('does the same thing every time with the same seed', () => {
    const go = (): string[] => {
      const rng = Rng.fromSeed(7);
      return run(createNpc(placed({ wander: 2 }), rng, TUNING), 20_000, open, rng).cells;
    };
    expect(go()).toEqual(go());
  });
});

describe('lookAt', () => {
  test('turns an NPC to face someone, then a standing one turns back', () => {
    const rng = Rng.fromSeed(1);
    const looking = lookAt(createNpc(placed(), rng, TUNING), 9, 10, TUNING);
    expect(looking.walker.facing).toBe('left');
    expect(looking.waitMs).toBe(2000);
    expect(run(looking, 1900, open, rng).npc.walker.facing).toBe('left');
    expect(run(looking, 2100, open, rng).npc.walker.facing).toBe('down');
  });

  test('leaves an NPC mid-step alone', () => {
    const rng = Rng.fromSeed(1);
    const npc = createNpc(placed({ wander: 2 }), rng, TUNING);
    const stepping = {
      ...npc,
      walker: updateWalker(npc.walker, { direction: 'up', run: false }, 0, open, {
        walkMs: 300,
        runMs: 300,
      }),
    };
    expect(lookAt(stepping, 9, 10, TUNING)).toBe(stepping);
  });
});

test('directionTowards picks the axis with further to go', () => {
  expect(directionTowards(5, 5, 5, 4)).toBe('up');
  expect(directionTowards(5, 5, 7, 6)).toBe('right');
  expect(directionTowards(5, 5, 4, 8)).toBe('down');
  expect(directionTowards(5, 5, 2, 5)).toBe('left');
});

test('a walker takes up both cells while it steps between them', () => {
  const walker = updateWalker(standingWalker(0, 0), { direction: 'right', run: false }, 10, open, {
    walkMs: 100,
    runMs: 100,
  });
  expect(occupies(walker, 0, 0)).toBe(true);
  expect(occupies(walker, 1, 0)).toBe(true);
  expect(occupies(walker, 2, 0)).toBe(false);
  const arrived = updateWalker(walker, { direction: null, run: false }, 100, open, {
    walkMs: 100,
    runMs: 100,
  });
  expect(occupies(arrived, 0, 0)).toBe(false);
});
