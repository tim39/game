import type { SkillDef } from '../schema';
import type { BuffableStat, Buffs } from '../stats';
import type { BattleEvent } from './events';
import type { Fighter, FighterId, FighterStatus, StatusState } from './fighter';
import type { Status } from './terms';
import type { BattleTuning } from './tuning';

/**
 * Statuses (see Status effects in docs/DESIGN.md): how long each lasts, which replace which, what
 * they change, and what the start and end of a fighter's turn do to them.
 */

type Statuses = Fighter['statuses'];

/** A fighter changed, and what happened to them, in order. */
export interface Change {
  readonly fighter: Fighter;
  readonly events: readonly BattleEvent[];
}

/**
 * Each status's opposite. Nothing stacks, so a stat is up, down or neither, and a fighter is
 * Hasted, Slowed or neither: giving one takes its opposite away.
 */
export const OPPOSITES: Readonly<Partial<Record<Status, Status>>> = {
  haste: 'slow',
  slow: 'haste',
  'atk-up': 'atk-down',
  'atk-down': 'atk-up',
  'def-up': 'def-down',
  'def-down': 'def-up',
  'mag-up': 'mag-down',
  'mag-down': 'mag-up',
  'res-up': 'res-down',
  'res-down': 'res-up',
};

/** The statuses that raise and lower each stat. */
const BUFFS: Readonly<Record<BuffableStat, readonly [up: Status, down: Status]>> = {
  atk: ['atk-up', 'atk-down'],
  def: ['def-up', 'def-down'],
  mag: ['mag-up', 'mag-down'],
  res: ['res-up', 'res-down'],
};

/**
 * How many of their own turns a status lasts on a fighter. Slow lasts half as long on a boss,
 * rounded up, and Poison has no count: it lasts until it's cured.
 */
export function statusTurns(
  status: Status,
  boss: boolean,
  tuning: BattleTuning,
): number | undefined {
  if (status === 'poison') return undefined;
  const turns = tuning.turns[status];
  return boss && status === 'slow' ? Math.ceil(turns * tuning.bossSlow) : turns;
}

/** Whether a status can't take on a fighter at all: a boss can't be put to sleep. */
export const isImmune = (fighter: Fighter, status: Status): boolean =>
  fighter.boss && status === 'sleep';

/** What a fighter's delays are multiplied by: Haste's or Slow's, or 1. */
export function speedOf(statuses: Statuses, tuning: BattleTuning): number {
  if (statuses.haste) return tuning.haste;
  if (statuses.slow) return tuning.slow;
  return 1;
}

/** Which of a fighter's stats are up, and which are down. */
export function buffsOf(statuses: Statuses): Buffs {
  const buffs: Partial<Record<BuffableStat, 'up' | 'down'>> = {};
  for (const [stat, [up, down]] of Object.entries(BUFFS) as [BuffableStat, [Status, Status]][]) {
    if (statuses[up]) buffs[stat] = 'up';
    else if (statuses[down]) buffs[stat] = 'down';
  }
  return buffs;
}

/** Whether Silence stops a skill: magical and healing skills are magic. */
export const isMagic = (skill: SkillDef): boolean =>
  skill.kind === 'magical' || skill.kind === 'healing';

/**
 * What Poison takes, or Regen gives, at the start of a turn: a share of max HP, rounded down, and
 * at least 1.
 */
export const tickAmount = (maxHp: number, share: number): number =>
  Math.max(1, Math.floor(maxHp * share));

/** A CT stretched or shrunk as Haste or Slow come and go, rounded. */
export const rescaled = (ct: number, before: number, after: number): number =>
  before === after ? ct : Math.round((ct * after) / before);

/**
 * A fighter given a status by `from`. Giving it again starts its count over, and giving it takes
 * away its opposite. Haste and Slow change the wait for their next turn at once.
 */
export function giveStatus(
  fighter: Fighter,
  status: Status,
  from: FighterId,
  tuning: BattleTuning,
): Change {
  const events: BattleEvent[] = [];
  const statuses = copyOf(fighter.statuses);
  const opposite = OPPOSITES[status];
  if (opposite !== undefined && statuses[opposite]) {
    delete statuses[opposite];
    events.push({
      type: 'status-removed',
      target: fighter.id,
      status: opposite,
      reason: 'replaced',
    });
  }
  const turns = statusTurns(status, fighter.boss, tuning);
  const counted = turns === undefined ? {} : { turns };
  statuses[status] = status === 'provoke' ? { ...counted, from } : counted;
  events.push({ type: 'status-added', target: fighter.id, status, ...counted });
  const ct = rescaled(fighter.ct, speedOf(fighter.statuses, tuning), speedOf(statuses, tuning));
  return { fighter: { ...fighter, statuses, ct }, events };
}

/** A fighter cured of the statuses given that they have. Haste and Slow going changes their wait. */
export function cureStatuses(
  fighter: Fighter,
  cured: readonly Status[],
  tuning: BattleTuning,
): Change {
  const events: BattleEvent[] = [];
  const statuses = copyOf(fighter.statuses);
  for (const status of cured) {
    if (!statuses[status]) continue;
    delete statuses[status];
    events.push({ type: 'status-removed', target: fighter.id, status, reason: 'cured' });
  }
  const ct = rescaled(fighter.ct, speedOf(fighter.statuses, tuning), speedOf(statuses, tuning));
  return { fighter: { ...fighter, statuses, ct }, events };
}

/** A sleeping fighter, woken up by a hit. */
export function woken(fighter: Fighter): Change {
  if (!fighter.statuses.sleep) return { fighter, events: [] };
  const statuses = copyOf(fighter.statuses);
  delete statuses.sleep;
  return {
    fighter: { ...fighter, statuses },
    events: [{ type: 'status-removed', target: fighter.id, status: 'sleep', reason: 'woke' }],
  };
}

/**
 * A fighter as their turn starts: Guard ends, they can be staggered again, and each status that
 * wears off counts this turn off.
 */
export function atTurnStart(fighter: Fighter): Change {
  const events: BattleEvent[] = [];
  const statuses: Partial<Record<FighterStatus, StatusState>> = {};
  for (const [status, state] of entriesOf(fighter.statuses)) {
    if (status === 'guard') {
      events.push({ type: 'status-removed', target: fighter.id, status, reason: 'expired' });
    } else {
      statuses[status] = state.turns === undefined ? state : { ...state, turns: state.turns - 1 };
    }
  }
  return { fighter: { ...fighter, statuses, staggered: false }, events };
}

/** A fighter as their turn ends: the statuses whose last turn it was wear off. */
export function atTurnEnd(fighter: Fighter): Change {
  const events: BattleEvent[] = [];
  const statuses: Partial<Record<FighterStatus, StatusState>> = {};
  for (const [status, state] of entriesOf(fighter.statuses)) {
    if (state.turns !== undefined && state.turns <= 0) {
      events.push({ type: 'status-removed', target: fighter.id, status, reason: 'expired' });
    } else {
      statuses[status] = state;
    }
  }
  return { fighter: { ...fighter, statuses }, events };
}

/** A fighter out of HP: KO'd, off the timeline, and with every status gone. */
export const knockedOut = (fighter: Fighter): Fighter => ({
  ...fighter,
  hp: 0,
  ct: 0,
  statuses: {},
  staggered: false,
});

const copyOf = (statuses: Statuses): Partial<Record<FighterStatus, StatusState>> => ({
  ...statuses,
});

const entriesOf = (statuses: Statuses): [FighterStatus, StatusState][] =>
  Object.entries(statuses) as [FighterStatus, StatusState][];
