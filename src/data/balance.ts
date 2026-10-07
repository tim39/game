import type { BattleTuning } from '../core/battle/tuning';
import type { EncounterTuning } from '../core/encounters';
import type { ExpCurve } from '../core/levels';
import type { NpcTuning } from '../core/npc';
import type { BuffMultipliers } from '../core/stats';
import type { WalkSpeeds } from '../core/walker';

/** Tuning numbers, and what the simulator plays each area with. */

/**
 * The EXP curve: reaching level L takes 12 × (L − 1)^2.5 EXP in all, rounded, up to level 30.
 * Level 2 takes 12, level 5 takes 384, level 10 takes 2,916 and level 30 takes 54,347. Each level
 * takes more than the last, so later enemies give more EXP. They're tuned to bring the party to
 * each area at its target level (see Levels in docs/DESIGN.md).
 */
export const EXP_CURVE: ExpCurve = { maxLevel: 30, scale: 12, power: 2.5 };

/** ATK, DEF, MAG and RES Up and Down multiply that stat by these (see Status effects). */
export const BUFF_MULTIPLIERS: BuffMultipliers = { up: 1.25, down: 0.75 };

/**
 * The battle rules' numbers (see Battle system in docs/DESIGN.md). An action's delay is
 * round(rank × 1000 / (SPD + 10)): a Normal action at SPD 10 takes 50, and at SPD 40 takes 20.
 */
export const BATTLE_TUNING: BattleTuning = {
  delay: { k: 1000, c: 10 },
  ranks: { quick: 0.7, normal: 1, slow: 1.4, 'very-slow': 2 },
  startCt: [0.4, 1],
  haste: 0.6,
  slow: 1.6,
  weak: 1.5,
  resist: 0.5,
  critChance: 0.05,
  crit: 1.5,
  guard: 0.5,
  buffs: BUFF_MULTIPLIERS,
  variance: [0.9, 1.1],
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

/**
 * Random battles (see Encounters in docs/DESIGN.md): 24 to 40 steps apart at the Normal rate, half
 * as often at Low and twice as often at High; 8% start with a preemptive strike, and 4% with an
 * ambush.
 */
export const ENCOUNTER_TUNING: EncounterTuning = {
  steps: [24, 40],
  rates: { off: 0, low: 0.5, normal: 1, high: 2 },
  preemptive: 0.08,
  ambush: 0.04,
};

/** How long the player takes to cross one tile, walking and running. */
export const FIELD_SPEEDS: WalkSpeeds = { walkMs: 240, runMs: 120 };

/** Going between maps fades to black and back, this long each way. */
export const MAP_FADE_MS = 250;

/** A night's rest fades to black and back this slowly, either side of the morning jingle. */
export const REST_FADE_MS = 500;

/**
 * Story scenes fade to black and back this slowly where they move on in time or place: the opening,
 * the Kindling, the night the Beacon goes out, and the way home from its chamber.
 */
export const SCENE_FADE_MS = 600;

/** Someone a script sees off, gone out of sight, fades from the map this fast. */
export const LEAVE_FADE_MS = 300;

/** A script's picture, such as the intro's, fades in and away this slowly. */
export const PICTURE_FADE_MS = 700;

/**
 * Pulling a lever in the Tide Caves fades to black this fast, the tide turns, and it fades back in
 * at the same speed, after holding black for `hold` as the sea rushes.
 */
export const TIDE_FADE_MS = { fade: 300, hold: 500 } as const;

/**
 * Arriving somewhere new, the area banner fades in this fast, stays this long, and fades out this
 * slowly, in milliseconds.
 */
export const AREA_BANNER_MS = { fadeIn: 300, hold: 2000, fadeOut: 500 } as const;

/**
 * The Gloam's mist, over a map whose mood has it: how much of it shows, and how fast it drifts
 * across, in pixels a second.
 */
export const MIST = { alpha: 0.35, drift: { x: 6, y: 2 } } as const;

/**
 * A picture's lights (see src/data/pictures.ts): a glow pulses this much either side of full, once
 * every `pulseMs`; and a lighthouse's beam turns once round every `turnMs`, reaching `length` cells,
 * `spread` degrees across, this bright at its brightest.
 */
export const LIGHTS = {
  pulse: 0.15,
  pulseMs: 2400,
  beam: { turnMs: 9000, length: 16, spread: 10, alpha: 0.4 },
} as const;

/** What a night at each inn costs (see Items and economy in docs/DESIGN.md). */
export const INN_PRICES = { saltmere: 10, test: 20 } as const;

/**
 * How long the battle screen takes over what it shows, in milliseconds: a party member stepping
 * forward when their turn comes and back after it, lunging at a target, a hit landing, a number or
 * word floating up over someone, the pause after each action, a message in the banner, falling,
 * fading in and out of the battle, and turns sliding along the timeline. `settings.battleSpeed`
 * speeds them all up.
 */
export const BATTLE_PACING = {
  step: 160,
  lunge: 140,
  hit: 280,
  pop: 800,
  between: 220,
  banner: 1000,
  ko: 450,
  fade: 350,
  slide: 180,
} as const;

/** Music crossfades this long: the new track fades in as the old one fades out. */
export const MUSIC_FADE_MS = 1000;

/** Once a battle is won or lost, its music fades out this fast, as the jingle plays. */
export const JINGLE_FADE_MS = 250;

/**
 * The Game Over screen fades in from black this slowly, and takes no choice until it has, so a
 * press meant for the battle's last words can't pick one.
 */
export const GAME_OVER_FADE_MS = 1000;

/**
 * A sound effect asked for again within this long of the last time plays only once, so a cursor
 * moving fast through a menu doesn't stack its clicks.
 */
export const SOUND_REPEAT_MS = 50;

/**
 * How NPCs move: a slower step than the player's, a pause of 1.5–4 s before each wander, and how
 * long they keep looking at the player after being bumped into.
 */
export const NPC_TUNING: NpcTuning = { stepMs: 360, pauseMs: [1500, 4000], lookMs: 3000 };

/**
 * How fast dialogue types out, in characters a second, at each of the Options screen's text
 * speeds: at Normal, a full box of about 140 characters in under three seconds. Confirm shows the
 * rest at once.
 */
export const TEXT_SPEED = { slow: 25, normal: 50, fast: 100 } as const;

/** The party at a point in an area: their level, the gear they wear, and the items they carry. */
export interface PartyCheckpoint {
  readonly level: number;
  /** Gear each member has on in place of what they started with, by character. */
  readonly gear?: Readonly<Record<string, readonly string[]>>;
  readonly items: Readonly<Record<string, number>>;
}

/**
 * An area, as the simulator plays it (`npm run sim`, see Levels in docs/DESIGN.md): who's in the
 * party, its encounter table and its boss, how long its main path is, and the party as they arrive
 * and as they reach the boss, at the area's target levels. Its battles are played at the first,
 * and its boss at the second; its main path is walked from the first, to see that it brings the
 * party to the second's level.
 */
export interface AreaBalance {
  readonly name: string;
  readonly party: readonly string[];
  /** Its encounter table, in src/data/encounters.ts. */
  readonly encounters: string;
  /** The boss's group of enemies. */
  readonly boss: readonly string[];
  /**
   * How many steps its main path takes, from the Light Shrine at the way in to the boss: the
   * shortest walk that opens every chest, counting only the steps that count towards random
   * battles (see Encounters in docs/DESIGN.md), measured on its maps.
   */
  readonly steps: number;
  readonly arrival: PartyCheckpoint;
  readonly atBoss: PartyCheckpoint;
}

/** Every area the simulator plays, in the order the game reaches them. */
export const AREAS: Readonly<Record<string, AreaBalance>> = {
  'tide-caves': {
    name: 'the Tide Caves',
    party: ['rowan', 'bram'],
    encounters: 'tide-caves',
    boss: ['drowned-warden'],
    // From the Light Shrine on the first floor to the door of the Beacon chamber, opening every
    // chest and pulling the levers that takes: 77 steps on the first floor, 118 on the second and
    // 84 on the third.
    steps: 279,
    // On arrival, at level 2 from the fight in the square, in the gear they started in, with what
    // Saltmere gives: Tamsin's Potion and two more bought with the village's chest gold, its Ether
    // and Ember Feather, and two Fire Bombs, its chest's and Bram's.
    arrival: { level: 2, items: { potion: 3, ether: 1, 'ember-feather': 1, 'fire-bomb': 2 } },
    // At the Warden, Rowan has the Iron Sword from the second floor's chest. Of the Potions the
    // party brings and the first and third floors' chests give, the way down uses up all but about
    // one; the chests give an Ether and a Fire Bomb more.
    atBoss: {
      level: 5,
      gear: { rowan: ['iron-sword'] },
      items: { potion: 1, ether: 2, 'ember-feather': 1, 'fire-bomb': 3 },
    },
  },
};

/** What the simulator holds each area to (see Levels in docs/DESIGN.md). */
export interface SimTargets {
  /** Normal battles are won at least this share of the time, in this many rounds. */
  readonly battles: { readonly won: number; readonly rounds: readonly [min: number, max: number] };
  /** The boss is beaten this share of the time. */
  readonly boss: { readonly won: readonly [min: number, max: number] };
  /**
   * Walking the main path, the party falls on the way at most this share of the time; and it
   * reaches the boss at the boss's target level, on average.
   */
  readonly walk: { readonly fell: number };
}

/**
 * At an area's target level, a party run by simple AI wins its normal battles more than 95% of the
 * time in 3 to 6 rounds, and beats its boss 60% to 85% of the time. Walking its main path from
 * the target level on arrival, it gets to the boss at the boss's target level, and falls on the
 * way no more than 5% of the time.
 */
export const SIM_TARGETS: SimTargets = {
  battles: { won: 0.95, rounds: [3, 6] },
  boss: { won: [0.6, 0.85] },
  walk: { fell: 0.05 },
};
