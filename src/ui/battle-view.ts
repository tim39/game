import type { BattleState } from '../core/battle/battle';
import type { BattleEvent } from '../core/battle/events';
import type { FighterId, FighterStatus, Side, Telegraph } from '../core/battle/fighter';

/**
 * A fighter as the battle screen shows them. The battle engine plays a turn all at once, and the
 * screen catches up an event at a time as it animates them, so until it has, what it shows lags
 * behind the battle: `applyEvent` brings a fighter's HP, MP and statuses up to an event.
 */
export interface FighterView {
  readonly id: FighterId;
  readonly side: Side;
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly mp: number;
  readonly maxMp: number;
  /** Their statuses, Guard included, in the order they came. */
  readonly statuses: readonly FighterStatus[];
  /** A skill they've telegraphed, to use on their next turn. */
  readonly telegraph: Telegraph | null;
  /** Which of its phases a boss is in, from 0. */
  readonly phase: number;
}

/** Everyone in the battle as the screen shows them, in battle order. */
export type BattleView = readonly FighterView[];

/** The battle screen showing a battle as it is. */
export function viewOf(battle: BattleState): BattleView {
  return battle.fighters.map((fighter) => ({
    id: fighter.id,
    side: fighter.side,
    name: fighter.name,
    hp: fighter.hp,
    maxHp: fighter.stats.hp,
    mp: fighter.mp,
    maxMp: fighter.stats.mp,
    statuses: Object.keys(fighter.statuses) as FighterStatus[],
    telegraph: fighter.telegraph,
    phase: fighter.phase,
  }));
}

/** What the screen shows once an event has played. Events that change nothing it shows leave it. */
export function applyEvent(view: BattleView, event: BattleEvent): BattleView {
  switch (event.type) {
    case 'action': {
      // Whatever the actor telegraphed comes now, or not at all; a telegraph announces the next.
      const { action } = event;
      const telegraph: Telegraph | null =
        action.type !== 'telegraph'
          ? null
          : action.target === undefined
            ? { skill: action.skill }
            : { skill: action.skill, target: action.target };
      return change(view, event.actor, () => ({ telegraph }));
    }
    case 'damage':
    case 'heal':
    case 'revive':
      return change(view, event.target, () => ({ hp: event.hp }));
    case 'mp':
      return change(view, event.target, () => ({ mp: event.mp }));
    case 'status-added':
      return change(view, event.target, ({ statuses }) => ({
        statuses: statuses.includes(event.status) ? statuses : [...statuses, event.status],
      }));
    case 'status-removed':
      return change(view, event.target, ({ statuses }) => ({
        statuses: statuses.filter((status) => status !== event.status),
      }));
    case 'ko':
      // A KO takes every status away, and whatever they telegraphed.
      return change(view, event.target, () => ({ hp: 0, statuses: [], telegraph: null }));
    case 'phase':
      return change(view, event.fighter, () => ({ phase: event.phase }));
    case 'turn':
    case 'miss':
    case 'status-resisted':
    case 'stagger':
    case 'delay':
    case 'reveal':
    case 'asleep':
    case 'flee':
      return view;
  }
}

/** A fighter by ID. Throws for one that isn't in the battle. */
export function fighterView(view: BattleView, id: FighterId): FighterView {
  const fighter = view.find((each) => each.id === id);
  if (!fighter) throw new RangeError(`There's nobody called ${id} in this battle`);
  return fighter;
}

const change = (
  view: BattleView,
  id: FighterId,
  changes: (fighter: FighterView) => Partial<FighterView>,
): BattleView => {
  const fighter = fighterView(view, id);
  return view.map((each) => (each === fighter ? { ...each, ...changes(each) } : each));
};
