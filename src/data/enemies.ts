import type { EnemyDef } from '../core/schema';

/**
 * Every enemy, by ID: its stats, which don't grow, how it takes each element, and what it does on
 * its turn (see Enemy behavior in docs/DESIGN.md). So far, a wolf for the first fights. Stats are
 * starting points, for the simulator and the balance passes to tune.
 */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  // Prowls outside Saltmere. A pair is a fair fight for Rowan and Bram at level 1.
  wolf: {
    name: 'Wolf',
    stats: { hp: 30, mp: 0, atk: 12, def: 6, mag: 2, res: 4, spd: 12 },
    reactions: { fire: 'weak' },
    actions: [
      { type: 'attack', weight: 3 },
      // It goes for whoever's worst hurt.
      { type: 'skill', skill: 'bite', weight: 2, target: 'lowest-hp' },
      // Left alone, it howls to steel itself, once.
      { type: 'skill', skill: 'howl', weight: 4, when: { alliesBelow: 2, once: true } },
    ],
  },
};
