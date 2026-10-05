import type { GameDb } from '../db';
import { startGame } from '../party';
import type { CharacterDef, ItemDef, SkillDef } from '../schema';
import type { GameState } from '../state';
import type { Stat } from '../stats';
import type { Element } from './terms';
import type { BattleTuning } from './tuning';

/**
 * Small battle content for the battle engine's tests: three heroes, a few enemies, and skills and
 * items for every rule. The tuning is the game's without chance in it: no variance and no
 * critical hits, and everyone's first turn comes after exactly their Normal delay. Blind, chances
 * and fleeing are still left to chance.
 */
export const TUNING: BattleTuning = {
  delay: { k: 1000, c: 10 },
  ranks: { quick: 0.7, normal: 1, slow: 1.4, 'very-slow': 2 },
  startCt: [1, 1],
  haste: 0.6,
  slow: 1.6,
  weak: 1.5,
  resist: 0.5,
  critChance: 0,
  crit: 1.5,
  guard: 0.5,
  buffs: { up: 1.25, down: 0.75 },
  variance: [1, 1],
  maxDamage: 9999,
  stagger: 0.25,
  bossStagger: 0.5,
  poison: 0.08,
  regen: 0.08,
  blindMiss: 0.5,
  turns: {
    regen: 3,
    sleep: 3,
    silence: 3,
    blind: 3,
    haste: 3,
    slow: 3,
    'atk-up': 3,
    'atk-down': 3,
    'def-up': 3,
    'def-down': 3,
    'mag-up': 3,
    'mag-down': 3,
    'res-up': 3,
    'res-down': 3,
    provoke: 2,
  },
  bossSlow: 0.5,
  flee: { base: 0.5, perSpd: 0.02, min: 0.2, max: 0.95 },
};

type Effect = NonNullable<SkillDef['effects']>[number];

/** The test skills. Everyone knows them all, from level 1. */
export const SKILLS: Readonly<Record<string, SkillDef>> = {
  slash: physical('Slash', { power: 1.5, mp: 3 }),
  sweep: physical('Sweep', { power: 0.5, mp: 4, target: 'all-enemies' }),
  'heavy-blow': physical('Heavy Blow', { power: 2, mp: 0, rank: 'very-slow' }),
  jab: physical('Jab', { power: 0.5, mp: 0, rank: 'quick' }),
  'tide-edge': physical('Tide Edge', { power: 1, mp: 2, element: 'water' }),
  bash: physical('Bash', { power: 0.8, mp: 2, effects: [{ type: 'delay', amount: 0.5 }] }),
  venom: physical('Venom', {
    power: 0.5,
    mp: 2,
    effects: [{ type: 'status', status: 'poison' }],
  }),
  fire: magical('Fire', 'fire'),
  quake: magical('Quake', 'earth', 'all-enemies'),
  gloom: magical('Gloom', 'gloam'),
  heal: { ...about('Heal'), kind: 'healing', power: 1, mp: 4, rank: 'normal', target: 'one-ally' },
  'mend-all': {
    ...about('Mend All'),
    kind: 'healing',
    power: 0.5,
    mp: 8,
    rank: 'slow',
    target: 'all-allies',
  },
  focus: support('Focus', 'self', { type: 'status', status: 'atk-up' }, 'quick'),
  bulwark: support('Bulwark', 'all-allies', { type: 'status', status: 'def-up' }),
  weaken: support('Weaken', 'one-enemy', { type: 'status', status: 'def-down' }),
  haste: support('Haste', 'one-ally', { type: 'status', status: 'haste' }, 'quick'),
  slow: support('Slow', 'one-enemy', { type: 'status', status: 'slow' }),
  sleep: support('Sleep', 'one-enemy', { type: 'status', status: 'sleep' }),
  lullaby: support('Lullaby', 'one-enemy', { type: 'status', status: 'sleep', chance: 0.5 }),
  silence: support('Silence', 'one-enemy', { type: 'status', status: 'silence' }),
  blind: support('Blind', 'one-enemy', { type: 'status', status: 'blind' }),
  regen: support('Regen', 'one-ally', { type: 'status', status: 'regen' }),
  provoke: support('Provoke', 'all-enemies', { type: 'status', status: 'provoke' }, 'quick'),
  insight: support('Insight', 'one-enemy', { type: 'reveal' }, 'quick'),
  raise: support('Raise', 'one-ally', { type: 'revive', hp: 0.5 }),
  rebirth: support('Rebirth', 'all-allies', { type: 'revive', hp: 0.25 }),
  // The enemies'.
  bite: physical('Bite', { power: 1.3, mp: 0 }),
  howl: { ...support('Howl', 'self', { type: 'status', status: 'atk-up' }, 'quick'), mp: 0 },
  crush: physical('Crush', { power: 2.5, mp: 5, rank: 'slow' }),
  'tidal-wave': { ...magical('Tidal Wave', 'water', 'all-enemies'), mp: 8 },
  mend: { ...about('Mend'), kind: 'healing', power: 1, mp: 3, rank: 'normal', target: 'one-ally' },
  esuna: support('Esuna', 'one-ally', { type: 'cure', statuses: ['poison', 'blind', 'slow'] }),
};

/** Stats that are the same at every level. */
const flat = (stats: Record<Stat, number>): CharacterDef['stats'] => ({
  hp: [stats.hp, stats.hp],
  mp: [stats.mp, stats.mp],
  atk: [stats.atk, stats.atk],
  def: [stats.def, stats.def],
  mag: [stats.mag, stats.mag],
  res: [stats.res, stats.res],
  spd: [stats.spd, stats.spd],
});

const KNOWS_ALL: CharacterDef['skills'] = Object.keys(SKILLS).map((skill) => ({
  skill,
  level: 1,
}));

/** Rowan, the first of the test party: SPD 10, so his Normal delay is 50. */
export const ROWAN = hero('Rowan', 'sword', {
  hp: 100,
  mp: 20,
  atk: 20,
  def: 10,
  mag: 10,
  res: 10,
  spd: 10,
});

/**
 * Rowan, Bram and Liora, with simple stats. Their Normal delays are 50, 67 and 56; the Wolf's is
 * 45, the Slime's 83 and the Warden's 50.
 */
export const DB: GameDb = {
  characters: {
    rowan: ROWAN,
    bram: hero('Bram', 'axe', { hp: 150, mp: 10, atk: 15, def: 20, mag: 5, res: 10, spd: 5 }),
    liora: hero('Liora', 'staff', { hp: 80, mp: 50, atk: 8, def: 8, mag: 20, res: 15, spd: 8 }),
  },
  skills: SKILLS,
  items: {
    potion: consumable('Potion', 'one-ally', { type: 'restore', hp: 50 }),
    ether: consumable('Ether', 'one-ally', { type: 'restore', mp: 10 }),
    feather: consumable('Feather', 'one-ally', { type: 'revive', hp: 0.25 }),
    antidote: consumable('Antidote', 'one-ally', { type: 'cure', statuses: ['poison'] }),
    'fire-bomb': consumable('Fire Bomb', 'one-enemy', {
      type: 'damage',
      amount: 40,
      element: 'fire',
    }),
    smoke: consumable('Smoke', 'self', { type: 'escape' }),
    'flame-sword': {
      ...about('Flame Sword'),
      kind: 'weapon',
      weapon: 'sword',
      element: 'fire',
      price: 100,
      stats: { atk: 5 },
    },
    shard: { ...about('Shard'), kind: 'key' },
  },
  enemies: {
    wolf: {
      name: 'Wolf',
      stats: { hp: 60, mp: 10, atk: 12, def: 6, mag: 4, res: 4, spd: 12 },
      exp: 6,
      gold: 5,
      drops: [{ item: 'potion', chance: 0.5 }],
      reactions: { fire: 'weak', water: 'resist', earth: 'immune', gloam: 'absorb' },
      actions: [
        { type: 'attack', weight: 3 },
        { type: 'skill', skill: 'bite', weight: 2, target: 'lowest-hp' },
        { type: 'skill', skill: 'howl', weight: 4, when: { alliesBelow: 2, once: true } },
      ],
    },
    slime: {
      name: 'Slime',
      stats: { hp: 40, mp: 0, atk: 8, def: 4, mag: 0, res: 4, spd: 2 },
      exp: 3,
      gold: 2,
    },
    warden: {
      name: 'Drowned Warden',
      stats: { hp: 500, mp: 50, atk: 25, def: 15, mag: 10, res: 12, spd: 10 },
      exp: 100,
      gold: 150,
      drops: [
        { item: 'feather', chance: 1 },
        { item: 'ether', chance: 1 },
      ],
      reactions: { fire: 'weak' },
      boss: true,
      // Every third turn it telegraphs a Crush; below half its HP, it calls the tide as well.
      actions: [
        { type: 'attack', weight: 2, target: 'highest-atk' },
        { type: 'skill', skill: 'crush', when: { every: 3 }, telegraph: true, weight: 100 },
      ],
      phases: [
        {
          below: 0.5,
          actions: [
            { type: 'attack', target: 'healer' },
            { type: 'skill', skill: 'tidal-wave', weight: 2 },
            { type: 'skill', skill: 'crush', when: { every: 3 }, telegraph: true, weight: 100 },
          ],
        },
      ],
    },
  },
};

/** A new game with `party` in it, carrying `inventory`. */
export const gameWith = (
  party: readonly string[] = ['rowan', 'bram', 'liora'],
  inventory: Readonly<Record<string, number>> = { potion: 3, feather: 1, 'fire-bomb': 2 },
): GameState =>
  startGame({ location: { map: 'test-shore', x: 4, y: 5, facing: 'down' }, party, inventory }, DB);

// Content, made briefly.

function about(name: string): { name: string; description: string } {
  return { name, description: `${name}, for the tests.` };
}

function hero(
  name: string,
  weapon: CharacterDef['weapon'],
  stats: Record<Stat, number>,
): CharacterDef {
  return { name, stats: flat(stats), weapon, armor: ['light'], equipment: {}, skills: KNOWS_ALL };
}

function physical(
  name: string,
  skill: {
    power: number;
    mp: number;
    rank?: SkillDef['rank'];
    target?: 'one-enemy' | 'all-enemies';
    element?: Element;
    effects?: readonly Effect[];
  },
): SkillDef {
  const { rank = 'normal', target = 'one-enemy', ...rest } = skill;
  return { ...about(name), kind: 'physical', rank, target, ...rest };
}

function magical(
  name: string,
  element: Element,
  target: 'one-enemy' | 'all-enemies' = 'one-enemy',
): SkillDef {
  return { ...about(name), kind: 'magical', element, power: 1, mp: 4, rank: 'normal', target };
}

function support(
  name: string,
  target: SkillDef['target'],
  effect: Effect,
  rank: SkillDef['rank'] = 'normal',
): SkillDef {
  return { ...about(name), kind: 'support', mp: 2, rank, target, effects: [effect] };
}

function consumable(name: string, target: SkillDef['target'], effect: Effect): ItemDef {
  return { ...about(name), kind: 'consumable', price: 10, target, effects: [effect] };
}
