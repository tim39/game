import type { CharacterDef } from '../core/schema';

/**
 * The party: who can join it, and their stats, each at level 1 and at level 30. In between, stats
 * grow evenly (src/core/stats.ts). Each character's stats follow their role in docs/DESIGN.md, which
 * characters.test.ts holds them to. They're starting points, for the simulator and the balance
 * passes to tune.
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
  },
};
