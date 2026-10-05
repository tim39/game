import { fighterOf, type BattleState } from '../src/core/battle/battle';
import type { BattleEvent } from '../src/core/battle/events';
import type { FighterStatus } from '../src/core/battle/fighter';
import type { Reaction } from '../src/core/battle/terms';

/** One step of a battle: the events an action led to, and the battle after them. */
export interface Step {
  readonly events: readonly BattleEvent[];
  readonly battle: BattleState;
}

/**
 * A battle told turn by turn, a line to a turn, for reading what happened (`npm run sim -- --log`).
 * `start` is the battle as `startBattle` began it, and `steps` the actions taken from there.
 */
export function battleLog(start: BattleState, steps: readonly Step[]): string[] {
  const turns: string[][] = [];
  if (start.active !== null) turns.push([]);
  for (const { events, battle } of steps) {
    const name = (id: string): string => fighterOf(battle, id).name;
    const hp = (id: string, left: number): string => `${left}/${fighterOf(battle, id).stats.hp}`;
    for (const event of events) {
      if (event.type === 'turn') {
        turns.push([]);
        continue;
      }
      const said = describe(event, battle, name, hp);
      if (said !== undefined) turns.at(-1)?.push(said);
    }
  }
  const lines = turns.map((sentences, index) => [`Turn ${index + 1}.`, ...sentences].join(' '));
  const last = steps.at(-1)?.battle ?? start;
  return [...lines, ending(last)];
}

/** How the battle ended, and the party's HP. */
function ending(battle: BattleState): string {
  const party = battle.fighters
    .filter((fighter) => fighter.side === 'party')
    .map((fighter) => `${fighter.name} ${fighter.hp}/${fighter.stats.hp}`)
    .join(', ');
  switch (battle.outcome) {
    case 'victory':
      return `Won. ${party}.`;
    case 'defeat':
      return 'Lost.';
    case 'fled':
      return `Got away. ${party}.`;
    case 'ongoing':
      return `Still going. ${party}.`;
  }
}

/** A sentence for an event, or nothing for one that goes without saying. */
function describe(
  event: Exclude<BattleEvent, { type: 'turn' }>,
  battle: BattleState,
  name: (id: string) => string,
  hp: (id: string, left: number) => string,
): string | undefined {
  const skill = (id: string): string => battle.rules.skills[id]?.name ?? id;
  const item = (id: string): string => battle.rules.items[id]?.name ?? id;
  const at = (target: string | undefined, word = 'on'): string =>
    target === undefined ? '' : ` ${word} ${name(target)}`;
  switch (event.type) {
    case 'action': {
      const { actor, action } = event;
      switch (action.type) {
        case 'attack':
          return `${name(actor)} attacks ${name(action.target)}.`;
        case 'skill':
          return `${name(actor)} uses ${skill(action.skill)}${at(action.target)}.`;
        case 'item':
          return `${name(actor)} uses ${item(action.item)}${at(action.target)}.`;
        case 'guard':
          return `${name(actor)} guards.`;
        case 'flee':
          return `${name(actor)} tries to flee.`;
        case 'telegraph':
          return `${name(actor)} readies ${skill(action.skill)}${at(action.target, 'at')}!`;
      }
      break;
    }
    case 'damage': {
      const how = event.reaction && event.reaction !== 'normal' ? ` (${event.reaction})` : '';
      const critical = event.critical ? ', a critical hit' : '';
      const cause = event.cause === 'poison' ? ' from poison' : '';
      return `${name(event.target)} takes ${event.amount}${cause}${how}${critical}: ${hp(event.target, event.hp)}.`;
    }
    case 'heal': {
      const cause =
        event.cause === 'regen' ? ' from Regen' : event.cause === 'absorb' ? ', absorbing it' : '';
      return `${name(event.target)} recovers ${event.amount} HP${cause}: ${hp(event.target, event.hp)}.`;
    }
    case 'mp':
      return event.amount > 0 ? `${name(event.target)} recovers ${event.amount} MP.` : undefined;
    case 'miss':
      return `It misses ${name(event.target)}.`;
    case 'status-added':
      return event.status === 'guard'
        ? undefined
        : `${name(event.target)} ${becomes(event.status)}.`;
    case 'status-removed':
      switch (event.reason) {
        case 'expired':
          return event.status === 'guard'
            ? undefined
            : `${name(event.target)}'s ${STATUS_NAMES[event.status]} wears off.`;
        case 'cured':
          return `${name(event.target)} is cured of ${STATUS_NAMES[event.status]}.`;
        case 'woke':
          return `${name(event.target)} wakes up.`;
        case 'replaced':
          return undefined;
      }
      break;
    case 'status-resisted':
      return `${name(event.target)} resists ${STATUS_NAMES[event.status]}.`;
    case 'stagger':
      return `${name(event.target)} staggers back.`;
    case 'delay':
      return `${name(event.target)} is knocked back.`;
    case 'reveal': {
      const target = fighterOf(battle, event.target);
      const shown = event.elements.flatMap((element) => {
        const reaction = target.reactions[element] ?? 'normal';
        return reaction === 'normal' ? [] : [`${REACTION_WORDS[reaction]} ${element}`];
      });
      const told =
        shown.length > 0 ? shown.join(', ') : `takes ${event.elements.join(', ')} normally`;
      const kind = battle.rules.enemies[target.kind]?.name ?? target.kind;
      return `The party learns: ${kind} ${told}.`;
    }
    case 'ko':
      return `${name(event.target)} falls.`;
    case 'revive':
      return `${name(event.target)} gets back up: ${hp(event.target, event.hp)}.`;
    case 'phase':
      return `${name(event.fighter)} changes!`;
    case 'asleep':
      return `${name(event.fighter)} is asleep.`;
    case 'flee':
      return event.escaped ? 'The party gets away.' : "But they can't get away.";
  }
  return undefined;
}

const REACTION_WORDS: Readonly<Record<Exclude<Reaction, 'normal'>, string>> = {
  weak: 'is weak to',
  resist: 'resists',
  immune: 'is immune to',
  absorb: 'absorbs',
};

/** What a status is called in a sentence. */
const STATUS_NAMES: Readonly<Record<FighterStatus, string>> = {
  poison: 'Poison',
  regen: 'Regen',
  sleep: 'Sleep',
  silence: 'Silence',
  blind: 'Blind',
  haste: 'Haste',
  slow: 'Slow',
  'atk-up': 'ATK Up',
  'atk-down': 'ATK Down',
  'def-up': 'DEF Up',
  'def-down': 'DEF Down',
  'mag-up': 'MAG Up',
  'mag-down': 'MAG Down',
  'res-up': 'RES Up',
  'res-down': 'RES Down',
  provoke: 'Provoke',
  guard: 'Guard',
};

/** How a status coming on is said, after the fighter's name: `is poisoned`. */
function becomes(status: FighterStatus): string {
  switch (status) {
    case 'poison':
      return 'is poisoned';
    case 'regen':
      return 'starts to regenerate';
    case 'sleep':
      return 'falls asleep';
    case 'silence':
      return 'is silenced';
    case 'blind':
      return 'is blinded';
    case 'haste':
      return 'speeds up';
    case 'slow':
      return 'slows down';
    case 'provoke':
      return 'is provoked';
    case 'guard':
      return 'guards';
    case 'atk-up':
    case 'atk-down':
    case 'def-up':
    case 'def-down':
    case 'mag-up':
    case 'mag-down':
    case 'res-up':
    case 'res-down':
      return `gets ${STATUS_NAMES[status]}`;
  }
}
