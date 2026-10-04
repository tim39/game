import type { SkillDef } from '../core/schema';

/**
 * Every skill, by ID. Who learns which, and when, is in src/data/characters.ts, and which enemies
 * use which in src/data/enemies.ts. So far, Act 1's: Rowan's and Bram's, what Liora knows when she
 * joins, and the wolf's.
 */
export const SKILLS: Readonly<Record<string, SkillDef>> = {
  // Rowan: the sword, and a spark from each Beacon.
  'tide-edge': {
    name: 'Tide Edge',
    description: 'A slash charged with the sea.',
    kind: 'physical',
    element: 'water',
    power: 1.4,
    mp: 4,
    rank: 'normal',
    target: 'one-enemy',
  },
  sweep: {
    name: 'Sweep',
    description: 'A wide swing that catches every enemy.',
    kind: 'physical',
    power: 0.6,
    mp: 5,
    rank: 'normal',
    target: 'all-enemies',
  },
  focus: {
    name: 'Focus',
    description: 'A steadying breath before the next blow. ATK Up.',
    kind: 'support',
    mp: 3,
    rank: 'quick',
    target: 'self',
    effects: [{ type: 'status', status: 'atk-up' }],
  },

  // Bram: the shield.
  'shield-bash': {
    name: 'Shield Bash',
    description: 'A shield blow that knocks the target back in line.',
    kind: 'physical',
    power: 0.8,
    mp: 3,
    rank: 'normal',
    target: 'one-enemy',
    effects: [{ type: 'delay', amount: 0.25 }],
  },
  provoke: {
    name: 'Provoke',
    description: 'Goads every enemy into attacking Bram.',
    kind: 'support',
    mp: 2,
    rank: 'quick',
    target: 'all-enemies',
    effects: [{ type: 'status', status: 'provoke' }],
  },
  bulwark: {
    name: 'Bulwark',
    description: 'Rallies the party behind a raised shield. DEF Up.',
    kind: 'support',
    mp: 6,
    rank: 'normal',
    target: 'all-allies',
    effects: [{ type: 'status', status: 'def-up' }],
  },

  // Liora: healing and Light.
  heal: {
    name: 'Heal',
    description: 'Restores HP to one ally.',
    kind: 'healing',
    power: 1,
    mp: 4,
    rank: 'normal',
    target: 'one-ally',
  },
  radiance: {
    name: 'Radiance',
    description: 'A burst of holy light at one enemy.',
    kind: 'magical',
    element: 'light',
    power: 1.2,
    mp: 5,
    rank: 'normal',
    target: 'one-enemy',
  },
  insight: {
    name: 'Insight',
    description: 'Reveals what an enemy is weak to.',
    kind: 'support',
    mp: 2,
    rank: 'quick',
    target: 'one-enemy',
    effects: [{ type: 'reveal' }],
  },

  // Enemies'.
  bite: {
    name: 'Bite',
    description: 'Teeth, and not gently.',
    kind: 'physical',
    power: 1.4,
    mp: 0,
    rank: 'normal',
    target: 'one-enemy',
  },
  howl: {
    name: 'Howl',
    description: 'A lone howl that steels the howler. ATK Up.',
    kind: 'support',
    mp: 0,
    rank: 'quick',
    target: 'self',
    effects: [{ type: 'status', status: 'atk-up' }],
  },
};
