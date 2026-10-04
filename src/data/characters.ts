import type { CharacterDef } from '../core/schema';

/**
 * The party: who can join it, and their stats, each at level 1 and at level 30. In between, stats
 * grow evenly (src/core/stats.ts). Each character's stats follow their role in docs/DESIGN.md, which
 * characters.test.ts holds them to. They're starting points, for the simulator and the balance
 * passes to tune. Each also has the gear they join with, what they can equip, and the skills they
 * learn (src/data/skills.ts): at a level, or once a story flag is set.
 */
export const CHARACTERS: Readonly<Record<string, CharacterDef>> = {
  // Sword, all-rounder: a little of everything, and the most ATK.
  rowan: {
    name: 'Rowan',
    stats: {
      hp: [60, 900],
      mp: [12, 110],
      atk: [12, 115],
      def: [9, 85],
      mag: [7, 70],
      res: [7, 70],
      spd: [11, 28],
    },
    weapon: 'sword',
    armor: ['light'],
    equipment: { weapon: 'bronze-sword', armor: 'travel-clothes' },
    skills: [
      { skill: 'sweep', level: 3 },
      // The Tide Beacon's last spark leaps into Rowan, in its chamber under the lighthouse.
      { skill: 'tide-edge', flag: 'story.tide-spark' },
      { skill: 'focus', level: 6 },
    ],
  },
  // Knight, tank: the most HP and DEF, and the slowest.
  bram: {
    name: 'Bram',
    stats: {
      hp: [85, 1300],
      mp: [6, 55],
      atk: [11, 105],
      def: [13, 120],
      mag: [3, 35],
      res: [8, 80],
      spd: [7, 18],
    },
    weapon: 'axe',
    armor: ['light', 'heavy'],
    equipment: { weapon: 'hand-axe', armor: 'chain-mail' },
    skills: [
      { skill: 'shield-bash', level: 1 },
      { skill: 'provoke', level: 2 },
      { skill: 'bulwark', level: 5 },
    ],
  },
  // Priestess, healer: the most MP, MAG and RES, and frail.
  liora: {
    name: 'Liora',
    stats: {
      hp: [45, 700],
      mp: [18, 180],
      atk: [6, 55],
      def: [7, 65],
      mag: [12, 120],
      res: [11, 105],
      spd: [9, 24],
    },
    weapon: 'staff',
    armor: ['light', 'robe'],
    equipment: { weapon: 'oak-staff', armor: 'linen-robe' },
    // She joins at the end of Act 1 knowing these. Regen, Haste and Quicken come with Act 2.
    skills: [
      { skill: 'heal', level: 1 },
      { skill: 'radiance', level: 1 },
      { skill: 'insight', level: 1 },
    ],
  },
  // Thief: the fastest by far.
  cass: {
    name: 'Cass',
    stats: {
      hp: [50, 760],
      mp: [10, 100],
      atk: [10, 95],
      def: [7, 65],
      mag: [6, 60],
      res: [7, 70],
      spd: [14, 36],
    },
    // Her daggers, robes and skills come with Act 2.
    weapon: 'dagger',
    armor: ['light', 'robe'],
    equipment: {},
    skills: [],
  },
};
