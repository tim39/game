import type { Stats } from '../stats';
import type { Element, Reaction, Status } from './terms';

/** The fighters in a battle, the party's and the enemies, as the battle engine keeps them. */

/** A fighter's ID in a battle: a party member's character ID, or an enemy's with a letter. */
export type FighterId = string;

/** Which side a fighter is on. */
export type Side = 'party' | 'enemies';

/** The statuses a fighter can have: those skills and items give, and Guard, from the command. */
export type FighterStatus = Status | 'guard';

/** A status a fighter has. */
export interface StatusState {
  /**
   * How many of the fighter's turns it lasts, counting from the next to start: each turn's start
   * takes one off, and it wears off at the end of the turn that takes the last. Poison and Guard
   * have none: Poison lasts until it's cured, and Guard until the guarder's next turn starts.
   */
  readonly turns?: number;
  /** Who gave it, for Provoke: whom the fighter has to aim at. */
  readonly from?: FighterId;
}

/** Someone in a battle. It never changes in place: the engine makes a new one instead. */
export interface Fighter {
  readonly id: FighterId;
  readonly side: Side;
  /** Their character's ID, or their kind of enemy's: `rowan`, `wolf`. */
  readonly kind: string;
  /** The name the battle shows: `Rowan`, or `Wolf A` when there's more than one. */
  readonly name: string;
  /** Their place on their side, from 0 at the left. */
  readonly slot: number;
  /** Their stats, with equipment but before buffs. HP and MP here are the most they can have. */
  readonly stats: Stats;
  /** HP left: 0 means they're KO'd, and off the timeline. */
  readonly hp: number;
  readonly mp: number;
  /** Their CT: the time until their turn. Whoever's turn it is has 0. */
  readonly ct: number;
  readonly statuses: Readonly<Partial<Record<FighterStatus, StatusState>>>;
  /** Whether they've been staggered since their last turn, as that can only happen once. */
  readonly staggered: boolean;
  /** How they take each element they don't take normally. */
  readonly reactions: Readonly<Partial<Record<Element, Reaction>>>;
  readonly boss: boolean;
  /** The element their Attack has, from their weapon. */
  readonly attackElement?: Element;
  /** The skills they can use, in their menu's order. */
  readonly skills: readonly string[];
  /** How many turns they've had. */
  readonly turns: number;
}

export const isKo = (fighter: Fighter): boolean => fighter.hp === 0;
