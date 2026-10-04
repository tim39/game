/**
 * The battle's terms, as skills, items and enemies name them (see Battle system in
 * docs/DESIGN.md). What each one does is the battle engine's to say.
 */

/** The six elements: one for each Beacon, and Light and Gloam. */
export const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'light', 'gloam'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * How a fighter takes an element: a weakness takes more damage and staggers them, a resistance
 * less, immunity none at all, and absorbing it heals them instead.
 */
export const REACTIONS = ['weak', 'normal', 'resist', 'immune', 'absorb'] as const;
export type Reaction = (typeof REACTIONS)[number];

/**
 * The statuses skills and items can give and cure. KO and Guard aren't among them: running out
 * of HP is what KOs, and Guard is a command.
 */
export const STATUSES = [
  'poison',
  'regen',
  'sleep',
  'silence',
  'blind',
  'haste',
  'slow',
  'atk-up',
  'atk-down',
  'def-up',
  'def-down',
  'mag-up',
  'mag-down',
  'res-up',
  'res-down',
  'provoke',
] as const;
export type Status = (typeof STATUSES)[number];

/** How long an action takes, which sets how soon the actor's next turn comes (see Turn order). */
export const RANKS = ['quick', 'normal', 'slow', 'very-slow'] as const;
export type Rank = (typeof RANKS)[number];

/** Who an action is aimed at: the one using it, or one or all on either side. */
export const TARGETS = ['self', 'one-ally', 'all-allies', 'one-enemy', 'all-enemies'] as const;
export type Target = (typeof TARGETS)[number];

/**
 * How an enemy picks whom to aim an action at, of those it could: anyone, at random; whoever has
 * the least HP for their most; whoever has the most ATK; or a healer. Provoke overrides them all.
 */
export const TARGET_RULES = ['random', 'lowest-hp', 'highest-atk', 'healer'] as const;
export type TargetRule = (typeof TARGET_RULES)[number];
