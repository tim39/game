import type { Rng, Weighted } from '../rng';
import type { EnemyActionDef } from '../schema';
import { withBuffs } from '../stats';
import type { Action, Command } from './actions';
import {
  activeFighter,
  checkAction,
  checkCommand,
  fighterOf,
  targetChoices,
  type BattleState,
} from './battle';
import { isKo, type Fighter, type FighterId } from './fighter';
import { buffsOf } from './statuses';
import type { TargetRule } from './terms';

/**
 * The enemies' AI (see Enemy behavior in docs/DESIGN.md). Each kind of enemy has a list of actions,
 * or a boss one for each phase, each with a weight, maybe some conditions, and a rule for picking
 * its target. On its turn, an enemy picks at random, by weight, from those whose conditions hold
 * and that it can take now; with none, it attacks. A skill it telegraphed comes on its next turn.
 */

/** What the enemy whose turn it is does. Throws if it's a party member's turn. */
export function chooseEnemyAction(battle: BattleState, rng: Rng): Action {
  const actor = activeFighter(battle);
  if (actor.side !== 'enemies') throw new RangeError(`It's ${actor.name}'s turn, not an enemy's`);
  const telegraphed = actor.telegraph === null ? undefined : telegraphedAction(battle, actor, rng);
  if (telegraphed !== undefined) return telegraphed;

  const options: Weighted<EnemyActionDef>[] = actionsOf(battle, actor)
    .filter((entry) => holds(battle, actor, entry) && canTake(battle, commandOf(entry)))
    .map((entry) => ({ weight: entry.weight ?? 1, value: entry }));
  const entry: EnemyActionDef = options.length > 0 ? rng.weighted(options) : { type: 'attack' };
  switch (entry.type) {
    case 'attack': {
      const target = targetFor(battle, { type: 'attack' }, entry.target, rng);
      if (target === undefined) throw new RangeError(`${actor.name} has nobody to attack`);
      return { type: 'attack', target };
    }
    case 'guard':
      return { type: 'guard' };
    case 'skill': {
      const { skill } = entry;
      const target = targetFor(battle, { type: 'skill', skill }, entry.target, rng);
      if (entry.telegraph) {
        return target === undefined
          ? { type: 'telegraph', skill }
          : { type: 'telegraph', skill, target };
      }
      return target === undefined ? { type: 'skill', skill } : { type: 'skill', skill, target };
    }
  }
}

/** The actions an enemy picks from: a boss's phase's, once it's in one. */
function actionsOf(battle: BattleState, actor: Fighter): readonly EnemyActionDef[] {
  const def = Object.hasOwn(battle.rules.enemies, actor.kind)
    ? battle.rules.enemies[actor.kind]
    : undefined;
  if (!def) throw new RangeError(`There's no enemy called ${actor.kind}`);
  const phase = actor.phase > 0 ? def.phases?.[actor.phase - 1] : undefined;
  return phase?.actions ?? def.actions ?? [];
}

const commandOf = (entry: EnemyActionDef): Command =>
  entry.type === 'skill' ? { type: 'skill', skill: entry.skill } : { type: entry.type };

/**
 * Whether an action's conditions all hold now: the enemy's HP is below the share, it's an Nth turn
 * of theirs, fewer than so many of their side are standing (itself included), and a skill kept for
 * once hasn't been used.
 */
function holds(battle: BattleState, actor: Fighter, entry: EnemyActionDef): boolean {
  const { when } = entry;
  if (when === undefined) return true;
  const { hpBelow, every, alliesBelow } = when;
  if (hpBelow !== undefined && actor.hp / actor.stats.hp >= hpBelow) return false;
  if (every !== undefined && (actor.turns + 1) % every !== 0) return false;
  if (alliesBelow !== undefined) {
    const standing = battle.fighters.filter(
      (fighter) => fighter.side === actor.side && !isKo(fighter),
    ).length;
    if (standing >= alliesBelow) return false;
  }
  if (entry.type === 'skill' && entry.when?.once && actor.skillsUsed.includes(entry.skill)) {
    return false;
  }
  return true;
}

/** Whether a command can be taken now: its user can use it, and there's someone to use it on. */
function canTake(battle: BattleState, command: Command): boolean {
  if (checkCommand(battle, command) !== undefined) return false;
  if (targetChoices(battle, command).length > 0) return true;
  return command.type !== 'attack' && checkAction(battle, command) === undefined;
}

/**
 * Whom a command aimed at one fighter is aimed at, by a rule, of those it could be: anyone, at
 * random; whoever has the least HP for their most (and then the least HP); whoever has the most
 * ATK; or someone who knows a healing skill, or anyone if nobody does. Provoke leaves one choice.
 * Ties go to whoever comes first in battle order. Undefined for a command not aimed at one.
 */
function targetFor(
  battle: BattleState,
  command: Command,
  rule: TargetRule = 'random',
  rng: Rng,
): FighterId | undefined {
  const choices = targetChoices(battle, command);
  if (choices.length === 0) return undefined;
  const fighters = choices.map((id) => fighterOf(battle, id));
  switch (rule) {
    case 'random':
      return rng.pick(choices);
    case 'lowest-hp':
      return fighters.sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp || a.hp - b.hp)[0]?.id;
    case 'highest-atk': {
      const atk = (fighter: Fighter): number =>
        withBuffs(fighter.stats, buffsOf(fighter.statuses), battle.rules.tuning.buffs).atk;
      return fighters.sort((a, b) => atk(b) - atk(a))[0]?.id;
    }
    case 'healer':
      return fighters.find((fighter) => isHealer(battle, fighter))?.id ?? rng.pick(choices);
  }
}

const isHealer = (battle: BattleState, fighter: Fighter): boolean =>
  fighter.skills.some((skill) => battle.rules.skills[skill]?.kind === 'healing');

/**
 * The skill an enemy telegraphed, now that its turn has come: aimed where it was announced if it
 * still can be, or else at someone it can be, at random. Undefined if it can't be used now, as
 * when the enemy is Silenced; then it does something else.
 */
function telegraphedAction(battle: BattleState, actor: Fighter, rng: Rng): Action | undefined {
  if (actor.telegraph === null) return undefined;
  const { skill, target } = actor.telegraph;
  const command: Command = { type: 'skill', skill };
  if (!canTake(battle, command)) return undefined;
  const choices = targetChoices(battle, command);
  if (choices.length === 0) return { type: 'skill', skill };
  const aimed = target !== undefined && choices.includes(target) ? target : rng.pick(choices);
  return { type: 'skill', skill, target: aimed };
}
