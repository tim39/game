/**
 * Stats: what a character has at each level, and what equipment and buffs make of that (see
 * Characters and progression in docs/DESIGN.md). Stats are whole numbers, rounded down.
 */

/** Every stat a fighter has: HP and MP, attack and defense, magic and resistance, and speed. */
export const STATS = ['hp', 'mp', 'atk', 'def', 'mag', 'res', 'spd'] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Readonly<Record<Stat, number>>;

/** Characters' stats are given at level 1 and at this level, and grow evenly in between. */
export const GROWTH_LEVEL = 30;

/** A character's stats as their data gives them: each at level 1 and at level 30. */
export type StatGrowth = Readonly<Record<Stat, readonly [atLevel1: number, atLevel30: number]>>;

/**
 * A character's stats at a level, before equipment. Each grows evenly from its level 1 value to
 * its level 30 one, rounded down, and would carry on at the same rate past level 30.
 */
export function statsAtLevel(growth: StatGrowth, level: number): Stats {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError(`A level is a whole number from 1 up, not ${level}`);
  }
  return statsOf((stat) => {
    const [first, last] = growth[stat];
    return Math.floor(first + ((last - first) * (level - 1)) / (GROWTH_LEVEL - 1));
  });
}

/**
 * Stats with equipment's bonuses added, each piece's to the stats it names. A bonus can be a
 * penalty, but a stat never goes below 0.
 */
export function withEquipment(stats: Stats, bonuses: readonly Partial<Stats>[]): Stats {
  return statsOf((stat) =>
    Math.max(
      0,
      bonuses.reduce((sum, bonus) => sum + (bonus[stat] ?? 0), stats[stat]),
    ),
  );
}

/** The stats that buffs and debuffs change: ATK, DEF, MAG and RES Up and Down. */
export const BUFFABLE_STATS = ['atk', 'def', 'mag', 'res'] as const;
export type BuffableStat = (typeof BUFFABLE_STATS)[number];

/** Which stats are up and which are down. Nothing stacks: a stat is up, down or neither. */
export type Buffs = Readonly<Partial<Record<BuffableStat, 'up' | 'down'>>>;

/** What Up and Down multiply a stat by: BUFF_MULTIPLIERS in src/data/balance.ts. */
export type BuffMultipliers = Readonly<Record<'up' | 'down', number>>;

/** Stats as buffs and debuffs change them, rounded down. HP, MP and SPD have none. */
export function withBuffs(stats: Stats, buffs: Buffs, multipliers: BuffMultipliers): Stats {
  return statsOf((stat) => {
    const buff = isBuffable(stat) ? buffs[stat] : undefined;
    return buff === undefined ? stats[stat] : Math.floor(stats[stat] * multipliers[buff]);
  });
}

const isBuffable = (stat: Stat): stat is BuffableStat =>
  (BUFFABLE_STATS as readonly string[]).includes(stat);

/** Stats made a stat at a time. */
const statsOf = (value: (stat: Stat) => number): Stats => ({
  hp: value('hp'),
  mp: value('mp'),
  atk: value('atk'),
  def: value('def'),
  mag: value('mag'),
  res: value('res'),
  spd: value('spd'),
});
