import type { FighterId } from './fighter';

/**
 * What a fighter does on their turn (see Commands in docs/DESIGN.md). An action aimed at one
 * fighter names its target; one aimed at its user or at a whole side doesn't.
 */
export type Action =
  /** Attack: a physical hit of power 1, of their weapon's element if it has one. */
  | { readonly type: 'attack'; readonly target: FighterId }
  /** A skill they know, paid for in MP. */
  | { readonly type: 'skill'; readonly skill: string; readonly target?: FighterId }
  /** A consumable the party carries, used up: only the party uses items. */
  | { readonly type: 'item'; readonly item: string; readonly target?: FighterId }
  /** Guard: halves the damage they take until their next turn. */
  | { readonly type: 'guard' }
  /** Flee: the party's way out, though never from a boss. */
  | { readonly type: 'flee' };

/** An action before its target is chosen, as a menu offers it. Every action is also a command. */
export type Command =
  | { readonly type: 'attack' }
  | { readonly type: 'skill'; readonly skill: string }
  | { readonly type: 'item'; readonly item: string }
  | { readonly type: 'guard' }
  | { readonly type: 'flee' };
