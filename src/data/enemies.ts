import type { EnemyDef } from '../core/schema';

/**
 * Every enemy, by ID: its stats, which don't grow, how it takes each element, what beating it gives
 * and what it does on its turn (see Enemy behavior in docs/DESIGN.md). So far, a wolf for the first
 * fights, and the Tide Caves and the Drowned Warden, its boss, tuned with the simulator (`npm run
 * sim`) to the target levels: a battle in the caves gives about 50 EXP, so the eight or so on its
 * main path take the party from level 2 to 5 by the Warden. Each fights as `monster.<id>` in the
 * asset manifest, and notes which of the pack's monsters that is.
 */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  // Prowls outside Saltmere. A pair is a fair fight for Rowan and Bram at level 1. The pack has no
  // wolf, so it's the pack's DogBlack.
  wolf: {
    name: 'Wolf',
    stats: { hp: 30, mp: 0, atk: 12, def: 6, mag: 2, res: 4, spd: 12 },
    exp: 6,
    gold: 5,
    drops: [{ item: 'potion', chance: 0.1 }],
    reactions: { fire: 'weak' },
    actions: [
      { type: 'attack', weight: 3 },
      // It goes for whoever's worst hurt.
      { type: 'skill', skill: 'bite', weight: 2, target: 'lowest-hp' },
      // Left alone, it howls to steel itself, once.
      { type: 'skill', skill: 'howl', weight: 4, when: { alliesBelow: 2, once: true } },
    ],
  },

  // The Tide Caves, under the lighthouse.

  // Quick and frail. The pack's BlueBat.
  'cave-bat': {
    name: 'Cave Bat',
    stats: { hp: 38, mp: 0, atk: 10, def: 3, mag: 2, res: 4, spd: 16 },
    exp: 15,
    gold: 4,
    drops: [{ item: 'eye-drops', chance: 0.1 }],
    reactions: { wind: 'weak' },
  },
  // Slow, and hard to crack; it hides in its shell once it's hurt. The pack's Mollusc.
  'reef-snail': {
    name: 'Reef Snail',
    stats: { hp: 76, mp: 0, atk: 12, def: 12, mag: 0, res: 4, spd: 3 },
    exp: 33,
    gold: 8,
    drops: [{ item: 'antidote', chance: 0.1 }],
    reactions: { water: 'resist', earth: 'weak' },
    actions: [
      { type: 'attack', weight: 3 },
      { type: 'skill', skill: 'shell-up', weight: 4, when: { hpBelow: 0.5, once: true } },
    ],
  },
  // Squeezes whoever's worst hurt, and inks whoever hits hardest. The pack's Octopus2.
  'grotto-octopus': {
    name: 'Grotto Octopus',
    stats: { hp: 58, mp: 9, atk: 12, def: 6, mag: 8, res: 8, spd: 9 },
    exp: 30,
    gold: 7,
    // The cure for its ink.
    drops: [{ item: 'eye-drops', chance: 0.15 }],
    reactions: { water: 'absorb', fire: 'weak' },
    actions: [
      { type: 'attack', weight: 2 },
      { type: 'skill', skill: 'squeeze', weight: 2, target: 'lowest-hp' },
      { type: 'skill', skill: 'ink', weight: 1, target: 'highest-atk' },
    ],
  },
  // Drifts in the mist, and chills with magic more than it hits. The pack's Spirit.
  'drowned-wisp': {
    name: 'Drowned Wisp',
    stats: { hp: 46, mp: 12, atk: 5, def: 8, mag: 12, res: 12, spd: 11 },
    exp: 32,
    gold: 9,
    drops: [{ item: 'ether', chance: 0.08 }],
    reactions: { light: 'weak', fire: 'weak', water: 'absorb', gloam: 'immune' },
    actions: [
      { type: 'attack', weight: 1 },
      { type: 'skill', skill: 'mist-touch', weight: 3 },
    ],
  },
  // Drifts in the tide pools, and stings to send whoever it touches to sleep. The pack's Slime.
  'tide-jelly': {
    name: 'Tide Jelly',
    stats: { hp: 54, mp: 0, atk: 11, def: 5, mag: 4, res: 10, spd: 6 },
    exp: 28,
    gold: 7,
    drops: [{ item: 'potion', chance: 0.12 }],
    reactions: { water: 'absorb', wind: 'weak' },
    actions: [
      { type: 'attack', weight: 2 },
      { type: 'skill', skill: 'numbing-sting', weight: 2 },
    ],
  },
  // Quick to bite, and its bite poisons; it goes for whoever's worst hurt. The pack's Snake3.
  'sea-snake': {
    name: 'Sea Snake',
    stats: { hp: 48, mp: 0, atk: 13, def: 5, mag: 2, res: 5, spd: 14 },
    exp: 28,
    gold: 8,
    // The cure for its venom.
    drops: [{ item: 'antidote', chance: 0.15 }],
    reactions: { water: 'resist', earth: 'weak' },
    actions: [
      { type: 'attack', weight: 2 },
      { type: 'skill', skill: 'venom-bite', weight: 2, target: 'lowest-hp' },
    ],
  },
  // The boss, a Hollowed knight (see docs/STORY.md), who waits in the Beacon chamber. Every fourth
  // turn it telegraphs Undertow, and below half its HP, as the sea pours from its cracked armor,
  // every third, cleaving whoever's worst hurt in between. The pack's GiantBlueSamurai.
  'drowned-warden': {
    name: 'Drowned Warden',
    stats: { hp: 450, mp: 60, atk: 60, def: 16, mag: 44, res: 14, spd: 8 },
    exp: 300,
    gold: 200,
    drops: [{ item: 'ember-feather', chance: 1 }],
    reactions: { light: 'weak', earth: 'weak', water: 'absorb' },
    boss: true,
    actions: [
      { type: 'attack', weight: 3, target: 'highest-atk' },
      { type: 'skill', skill: 'tide-cleave', weight: 2 },
      { type: 'skill', skill: 'undertow', weight: 100, when: { every: 4 }, telegraph: true },
    ],
    phases: [
      {
        below: 0.5,
        banner: "The Warden's armor cracks, and the sea pours out!",
        actions: [
          { type: 'attack', weight: 2 },
          { type: 'skill', skill: 'tide-cleave', weight: 3, target: 'lowest-hp' },
          { type: 'skill', skill: 'undertow', weight: 100, when: { every: 3 }, telegraph: true },
        ],
      },
    ],
  },
};
