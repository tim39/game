import type { Action } from './actions';
import type { FighterId, FighterStatus } from './fighter';
import type { Element, Reaction, Status } from './terms';

/**
 * What happens in a battle, in order: the battle engine returns these, and they're all the battle
 * scene reads to animate it, and all a log needs to tell it.
 */
export type BattleEvent =
  /** A fighter's turn starts. */
  | { readonly type: 'turn'; readonly fighter: FighterId }
  /** The fighter whose turn it is acts, on these fighters. */
  | {
      readonly type: 'action';
      readonly actor: FighterId;
      readonly action: Action;
      readonly targets: readonly FighterId[];
    }
  /** A Blinded fighter's physical attack misses. */
  | { readonly type: 'miss'; readonly target: FighterId }
  /** A fighter loses HP to a hit, or to Poison, and has `hp` left. */
  | {
      readonly type: 'damage';
      readonly target: FighterId;
      readonly amount: number;
      readonly hp: number;
      /** The hit's element, and how the target took it. */
      readonly element?: Element;
      readonly reaction?: Reaction;
      readonly critical?: boolean;
      readonly cause?: 'poison';
    }
  /** A fighter gains HP, from healing, an item, Regen or an element they absorb, and has `hp`. */
  | {
      readonly type: 'heal';
      readonly target: FighterId;
      readonly amount: number;
      readonly hp: number;
      readonly cause?: 'regen' | 'absorb';
    }
  /** A fighter spends MP on a skill (`amount` is below 0) or gets some back, and has `mp`. */
  | {
      readonly type: 'mp';
      readonly target: FighterId;
      readonly amount: number;
      readonly mp: number;
    }
  | {
      readonly type: 'status-added';
      readonly target: FighterId;
      readonly status: FighterStatus;
      /** How many of their turns it lasts, for the statuses that wear off. */
      readonly turns?: number;
    }
  | {
      readonly type: 'status-removed';
      readonly target: FighterId;
      readonly status: FighterStatus;
      /** It ran out, it was cured, they woke from Sleep when hit, or its opposite replaced it. */
      readonly reason: 'expired' | 'cured' | 'woke' | 'replaced';
    }
  /** A status didn't take: it was left to chance, or the target is immune. */
  | { readonly type: 'status-resisted'; readonly target: FighterId; readonly status: Status }
  /** Hitting a weakness pushes the target back in line, by `push`. */
  | { readonly type: 'stagger'; readonly target: FighterId; readonly push: number }
  /** A Delay effect pushes the target back in line, by `push`. */
  | { readonly type: 'delay'; readonly target: FighterId; readonly push: number }
  /** The party learns how the target's kind of enemy takes these elements. */
  | { readonly type: 'reveal'; readonly target: FighterId; readonly elements: readonly Element[] }
  /** A fighter runs out of HP. */
  | { readonly type: 'ko'; readonly target: FighterId }
  /** A KO'd fighter gets back up, with `hp`. */
  | { readonly type: 'revive'; readonly target: FighterId; readonly hp: number }
  /** A fighter's turn passes while they sleep. */
  | { readonly type: 'asleep'; readonly fighter: FighterId }
  /** The party tries to get away. */
  | { readonly type: 'flee'; readonly escaped: boolean };
