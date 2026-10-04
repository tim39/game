import type { GameDb } from '../db';
import { knownSkills, memberStats } from '../party';
import type { Rng } from '../rng';
import type { EnemyDef, ItemDef, SkillDef } from '../schema';
import type { GameState } from '../state';
import { withBuffs } from '../stats';
import type { Action, Command } from './actions';
import { baseDamage, baseHealing, finalDamage, finalHealing } from './damage';
import type { BattleEvent } from './events';
import { isKo, type Fighter, type FighterId, type Side } from './fighter';
import {
  atTurnEnd,
  atTurnStart,
  buffsOf,
  cureStatuses,
  giveStatus,
  isImmune,
  isMagic,
  knockedOut,
  rescaled,
  speedOf,
  statusTurns,
  tickAmount,
  woken,
  type Change,
} from './statuses';
import { ELEMENTS, type Element, type Rank, type Reaction, type Target } from './terms';
import { byTurn, delay, normalDelay, turnKey, type TurnKey } from './turn-order';
import type { BattleTuning } from './tuning';

/**
 * The battle engine (see Battle system in docs/DESIGN.md): pure, synchronous and deterministic. A
 * battle is a BattleState, plain data that never changes in place. `startBattle` begins one, and
 * `applyAction` plays the turn of whoever's turn it is, returning the new state and what happened,
 * as events in order, up to the next turn that needs an action. Anything left to chance draws on
 * the Rng passed in, so the same seed plays the same battle. The battle scene animates the events,
 * and the simulator and the tests read them.
 */

/** A battle has at most this many enemies. */
export const MAX_ENEMIES = 6;

/** What a battle is against, and who gets the jump. The party comes from the game state. */
export interface BattleSetup {
  /** The enemies' IDs, left to right. */
  readonly enemies: readonly string[];
  /** A preemptive strike lets the party act first; an ambush, the enemies. */
  readonly start?: 'preemptive' | 'ambush';
}

/** How a battle stands: going on, or won, lost or fled. */
export type Outcome = 'ongoing' | 'victory' | 'defeat' | 'fled';

/** What a battle runs by: the tuning, and the skills, items and enemies there are. */
export interface BattleRules {
  readonly tuning: BattleTuning;
  readonly skills: Readonly<Record<string, SkillDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly enemies: Readonly<Record<string, EnemyDef>>;
}

/** A battle in progress, or over. */
export interface BattleState {
  /** Everyone fighting: the party in battle order, then the enemies, left to right. */
  readonly fighters: readonly Fighter[];
  /** Whose turn it is, waiting for their action. Nobody's, once the battle is over. */
  readonly active: FighterId | null;
  readonly outcome: Outcome;
  /** What the party carries, by item ID. Using an item uses it up. */
  readonly inventory: Readonly<Record<string, number>>;
  /** The elements the party knows each kind of enemy's reaction to, by the enemy's ID. */
  readonly known: Readonly<Record<string, readonly Element[]>>;
  /** Whether there's a boss, which can't be fled from. */
  readonly boss: boolean;
  /** How many turns have started, the one in progress included. */
  readonly turn: number;
  readonly rules: BattleRules;
}

/**
 * Starts a battle between the party, as the game state has them, and `setup`'s enemies. Party
 * members fight with their level's stats, their equipment and the skills they know, at full HP and
 * MP. Everyone's first turn comes after their Normal delay times a random number from 0.4 to 1, or
 * straight away for a side that gets the jump. The first turn has started: `active` says whose.
 */
export function startBattle(
  setup: BattleSetup,
  state: GameState,
  db: GameDb,
  tuning: BattleTuning,
  rng: Rng,
): BattleState {
  const { enemies, start } = setup;
  if (enemies.length < 1 || enemies.length > MAX_ENEMIES) {
    throw new RangeError(`A battle has 1 to ${MAX_ENEMIES} enemies, not ${enemies.length}`);
  }
  if (state.party.length === 0) throw new RangeError('A battle needs someone in the party');
  const foes = enemyFighters(enemies, db);
  const fighters = [...state.party.map((id, slot) => partyFighter(state, id, slot, db)), ...foes];
  const ids = fighters.map((fighter) => fighter.id);
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  if (twice !== undefined) throw new RangeError(`Two fighters would both be ${twice}`);

  const jump: Side | undefined =
    start === 'preemptive' ? 'party' : start === 'ambush' ? 'enemies' : undefined;
  const [min, max] = tuning.startCt;
  const ready = fighters.map((fighter) => {
    const roll = rng.range(min, max);
    const ct = fighter.side === jump ? 0 : Math.round(normalDelay(fighter, tuning) * roll);
    return { ...fighter, ct };
  });
  const battle: BattleState = {
    fighters: ready,
    active: null,
    outcome: 'ongoing',
    inventory: state.inventory,
    known: {},
    boss: foes.some((foe) => foe.boss),
    turn: 0,
    rules: { tuning, skills: db.skills, items: db.items, enemies: db.enemies },
  };
  const resolver = new Resolver(battle, rng);
  nextTurn(resolver);
  return resolver.state();
}

/**
 * Plays the turn of whoever's turn it is: they take `action`, and the battle carries on to the next
 * turn that needs an action, through the start of each turn on the way (Poison, Regen, Sleep), or
 * until it's over. Throws a RangeError, saying why, for an action they can't take (see
 * `checkAction`).
 */
export function applyAction(
  battle: BattleState,
  action: Action,
  rng: Rng,
): { battle: BattleState; events: BattleEvent[] } {
  const problem = checkAction(battle, action);
  if (problem !== undefined) throw new RangeError(problem);
  const resolver = new Resolver(battle, rng);
  const actor = activeFighter(battle);
  const targets = targetsOf(battle, action);
  resolver.emit({ type: 'action', actor: actor.id, action, targets });
  // Whatever they telegraphed comes now, or not at all.
  if (actor.telegraph !== null) resolver.set({ ...actor, telegraph: null });
  act(resolver, battle, actor.id, action, targets);
  if (!resolver.settle()) {
    endTurn(resolver, actor.id, rankOf(battle, action));
    nextTurn(resolver);
  }
  return { battle: resolver.state(), events: resolver.events };
}

/**
 * Why the fighter whose turn it is can't take an action, or undefined if they can. They must know
 * a skill and have the MP for it, and not be Silenced for a magic one; an item must be a
 * consumable the party has; nobody flees a boss; and the target must be one they can aim at (see
 * `targetChoices`), named only for an action aimed at one fighter.
 */
export function checkAction(battle: BattleState, action: Action): string | undefined {
  const unusable = checkCommand(battle, action);
  if (unusable !== undefined) return unusable;
  const actor = activeFighter(battle);
  const what = nameOf(battle, action);
  const target = targetOf(action);
  if (aimsAtOne(aimOf(battle, action))) {
    if (target === undefined) return `${what} needs a target`;
    if (!targetChoices(battle, action).includes(target)) {
      const aimed = battle.fighters.find((fighter) => fighter.id === target);
      if (!aimed) return `There's nobody called ${target} in this battle`;
      const provoker = provokerOf(battle, actor);
      if (provoker !== undefined && aimed.side === provoker.side) {
        return `${actor.name} is provoked, so can only aim at ${provoker.name}`;
      }
      return `${actor.name} can't aim ${what} at ${aimed.name}`;
    }
  } else if (target !== undefined) {
    return `${what} doesn't take a target`;
  }
  if (targetsOf(battle, action).length === 0) return `There's nobody for ${what} to work on`;
  return undefined;
}

/**
 * Why the fighter whose turn it is can't use a command at all, whatever it's aimed at, or
 * undefined if they can: for menus to grey out what can't be chosen.
 */
export function checkCommand(battle: BattleState, command: Command): string | undefined {
  if (battle.active === null) return 'The battle is over';
  return whyUnusable(battle, activeFighter(battle), command);
}

/**
 * Whom the fighter whose turn it is could aim a command at, if it's aimed at one fighter: any
 * enemy still standing, or only the one who provoked them; any ally still standing, or for one
 * that revives, only those KO'd. A command aimed at a whole side or its user has none.
 */
export function targetChoices(battle: BattleState, command: Command): FighterId[] {
  const actor = activeFighter(battle);
  switch (aimOf(battle, command)) {
    case 'one-enemy': {
      const provoker = provokerOf(battle, actor);
      if (provoker !== undefined) return [provoker.id];
      return standing(battle.fighters, otherSide(actor.side)).map((fighter) => fighter.id);
    }
    case 'one-ally':
      return allies(battle, actor, command).map((fighter) => fighter.id);
    case 'self':
    case 'all-allies':
    case 'all-enemies':
      return [];
  }
}

/**
 * The order of the next `count` turns after this one, for the timeline: as it will be if the
 * fighter whose turn it is takes `pending`, or a Normal action without it. A slow action pushes
 * them back, Delay and staggers push their targets back, Haste and Slow pull and push, and a
 * revived ally gets back in line. It's what happens if the action lands, and staggers only on
 * weaknesses the party knows; after that, everyone takes Normal actions.
 */
export function previewTurnOrder(battle: BattleState, pending?: Action, count = 10): FighterId[] {
  if (battle.active === null) return [];
  if (pending !== undefined) {
    const problem = checkAction(battle, pending);
    if (problem !== undefined) throw new RangeError(problem);
  }
  const { tuning } = battle.rules;
  const line = new Map<FighterId, Entry>();
  for (const fighter of battle.fighters) {
    if (!isKo(fighter)) line.set(fighter.id, entryOf(fighter, battle));
  }
  const actor = activeFighter(battle);
  // A telegraph does nothing to anyone's place in line until its skill comes.
  if (pending !== undefined && pending.type !== 'telegraph') {
    for (const target of targetsOf(battle, pending)) {
      previewOn(battle, line, actor, pending, fighterOf(battle, target));
    }
  }
  // A fighter's turn in the line ends, with the delay of a `rank` action. Like statuses, Haste and
  // Slow wear off at the end of their last turn.
  const turn = (entry: Entry, rank: Rank): void => {
    entry.ct = delay(entry.spd, rank, entry.speed, tuning);
    if (entry.speedTurns === 0) {
      entry.speed = 1;
      entry.speedTurns = undefined;
    }
  };
  // Without a pending action, the fighter whose turn it is uses what they telegraphed, if anything.
  const own = line.get(actor.id);
  if (own) {
    const rank = pending === undefined ? (own.nextRank ?? 'normal') : rankOf(battle, pending);
    own.nextRank = pending?.type === 'telegraph' ? skillOf(battle, pending.skill).rank : undefined;
    turn(own, rank);
  }

  const order: FighterId[] = [];
  while (order.length < count && line.size > 0) {
    const next = [...line.values()].sort(byTurn)[0];
    if (!next) break;
    order.push(next.id);
    const elapsed = next.ct;
    for (const entry of line.values()) entry.ct -= elapsed;
    if (next.speedTurns !== undefined) next.speedTurns -= 1;
    const rank = next.nextRank ?? 'normal';
    next.nextRank = undefined;
    turn(next, rank);
  }
  return order;
}

/**
 * The chance of the party getting away if they flee now: 50%, plus 2% for each point their average
 * SPD is above the enemies' (or less, below), from 20% to 95%. Only those standing count.
 */
export function fleeChance(battle: BattleState): number {
  const average = (side: Side): number => {
    const fighters = standing(battle.fighters, side);
    return fighters.reduce((sum, fighter) => sum + fighter.stats.spd, 0) / fighters.length;
  };
  const { base, perSpd, min, max } = battle.rules.tuning.flee;
  return Math.min(max, Math.max(min, base + perSpd * (average('party') - average('enemies'))));
}

/** A fighter in a battle, by ID. */
export function fighterOf(battle: BattleState, id: FighterId): Fighter {
  const fighter = battle.fighters.find((each) => each.id === id);
  if (!fighter) throw new RangeError(`There's nobody called ${id} in this battle`);
  return fighter;
}

/** The fighter whose turn it is. */
export function activeFighter(battle: BattleState): Fighter {
  if (battle.active === null) throw new RangeError('The battle is over');
  return fighterOf(battle, battle.active);
}

// Actions: what they're aimed at, how long they take, and whether they can be taken.

/** What a command is aimed at. */
function aimOf(battle: BattleState, command: Command): Target {
  switch (command.type) {
    case 'attack':
      return 'one-enemy';
    case 'skill':
    case 'telegraph':
      return skillOf(battle, command.skill).target;
    case 'item':
      return consumableOf(battle, command.item).target;
    case 'guard':
    case 'flee':
      return 'self';
  }
}

const aimsAtOne = (aim: Target): boolean => aim === 'one-ally' || aim === 'one-enemy';

/**
 * The rank of a command: Attack, Flee and telegraphing are Normal, items and Guard Quick, and a
 * skill its own.
 */
function rankOf(battle: BattleState, command: Command): Rank {
  switch (command.type) {
    case 'skill':
      return skillOf(battle, command.skill).rank;
    case 'item':
    case 'guard':
      return 'quick';
    case 'attack':
    case 'flee':
    case 'telegraph':
      return 'normal';
  }
}

/** A command's name, as a problem with it says it. */
function nameOf(battle: BattleState, command: Command): string {
  switch (command.type) {
    case 'attack':
      return 'Attack';
    case 'skill':
    case 'telegraph':
      return skillOf(battle, command.skill).name;
    case 'item':
      return consumableOf(battle, command.item).name;
    case 'guard':
      return 'Guard';
    case 'flee':
      return 'Flee';
  }
}

/**
 * What a command does besides any hit or healing of its own. A telegraph does nothing yet, but is
 * aimed as its skill will be.
 */
function effectsOf(battle: BattleState, command: Command): NonNullable<SkillDef['effects']> {
  switch (command.type) {
    case 'skill':
    case 'telegraph':
      return skillOf(battle, command.skill).effects ?? [];
    case 'item':
      return consumableOf(battle, command.item).effects;
    case 'attack':
    case 'guard':
    case 'flee':
      return [];
  }
}

const revives = (battle: BattleState, command: Command): boolean =>
  effectsOf(battle, command).some((effect) => effect.type === 'revive');

const targetOf = (action: Action): FighterId | undefined =>
  'target' in action ? action.target : undefined;

/** The fighters an action works on, as it's aimed. */
function targetsOf(battle: BattleState, action: Action): FighterId[] {
  const actor = activeFighter(battle);
  switch (aimOf(battle, action)) {
    case 'self':
      return [actor.id];
    case 'one-ally':
    case 'one-enemy': {
      const target = targetOf(action);
      return target === undefined ? [] : [target];
    }
    case 'all-allies':
      return allies(battle, actor, action).map((fighter) => fighter.id);
    case 'all-enemies':
      return standing(battle.fighters, otherSide(actor.side)).map((fighter) => fighter.id);
  }
}

/** The allies a command could work on: those standing, or those KO'd, for one that revives. */
const allies = (battle: BattleState, actor: Fighter, command: Command): Fighter[] =>
  battle.fighters.filter(
    (fighter) => fighter.side === actor.side && isKo(fighter) === revives(battle, command),
  );

/** Why a fighter can't use a command at all, whatever it's aimed at. */
function whyUnusable(battle: BattleState, actor: Fighter, command: Command): string | undefined {
  switch (command.type) {
    case 'attack':
    case 'guard':
      return undefined;
    case 'skill':
    case 'telegraph': {
      if (command.type === 'telegraph' && actor.side !== 'enemies') {
        return `${actor.name} can't telegraph`;
      }
      const skill = ownOf(battle.rules.skills, command.skill);
      if (!skill) return `There's no skill called ${command.skill}`;
      if (!actor.skills.includes(command.skill)) return `${actor.name} doesn't know ${skill.name}`;
      if (actor.statuses.silence && isMagic(skill)) {
        return `${actor.name} can't use ${skill.name} while silenced`;
      }
      if (actor.mp < skill.mp) {
        return `${actor.name} needs ${skill.mp} MP for ${skill.name}, and has ${actor.mp}`;
      }
      return undefined;
    }
    case 'item': {
      if (actor.side !== 'party') return `${actor.name} can't use items`;
      const item = ownOf(battle.rules.items, command.item);
      if (!item) return `There's no item called ${command.item}`;
      if (item.kind !== 'consumable') return `${item.name} can't be used`;
      if ((ownOf(battle.inventory, command.item) ?? 0) < 1) return `The party has no ${item.name}`;
      if (battle.boss && item.effects.some((effect) => effect.type === 'escape')) {
        return "There's no escaping a boss";
      }
      return undefined;
    }
    case 'flee':
      if (actor.side !== 'party') return `${actor.name} can't flee`;
      if (battle.boss) return "There's no fleeing from a boss";
      return undefined;
  }
}

/** The fighter still standing who provoked this one, whom they have to aim at. */
function provokerOf(battle: BattleState, fighter: Fighter): Fighter | undefined {
  const from = fighter.statuses.provoke?.from;
  return battle.fighters.find(
    (each) => each.id === from && each.side !== fighter.side && !isKo(each),
  );
}

function skillOf(battle: BattleState, id: string): SkillDef {
  const skill = ownOf(battle.rules.skills, id);
  if (!skill) throw new RangeError(`There's no skill called ${id}`);
  return skill;
}

function consumableOf(battle: BattleState, id: string): Extract<ItemDef, { kind: 'consumable' }> {
  const item = ownOf(battle.rules.items, id);
  if (!item) throw new RangeError(`There's no item called ${id}`);
  if (item.kind !== 'consumable') throw new RangeError(`${item.name} can't be used`);
  return item;
}

// Playing out a turn.

/** A battle part way through a turn: `applyAction` changes one, then hands back a new state. */
class Resolver {
  readonly rules: BattleRules;
  readonly tuning: BattleTuning;
  readonly events: BattleEvent[] = [];
  inventory: Readonly<Record<string, number>>;
  known: Readonly<Record<string, readonly Element[]>>;
  outcome: Outcome;
  active: FighterId | null = null;
  turn: number;
  private readonly fighters: Map<FighterId, Fighter>;

  constructor(
    private readonly battle: BattleState,
    readonly rng: Rng,
  ) {
    this.rules = battle.rules;
    this.tuning = battle.rules.tuning;
    this.fighters = new Map(battle.fighters.map((fighter) => [fighter.id, fighter]));
    this.inventory = battle.inventory;
    this.known = battle.known;
    this.outcome = battle.outcome;
    this.turn = battle.turn;
  }

  get(id: FighterId): Fighter {
    const fighter = this.fighters.get(id);
    if (!fighter) throw new RangeError(`There's nobody called ${id} in this battle`);
    return fighter;
  }

  set(fighter: Fighter): void {
    this.fighters.set(fighter.id, fighter);
  }

  all(): Fighter[] {
    return [...this.fighters.values()];
  }

  emit(...events: readonly BattleEvent[]): void {
    this.events.push(...events);
  }

  apply(change: Change): void {
    this.set(change.fighter);
    this.emit(...change.events);
  }

  /** Ends the battle once a side is all KO'd. Returns whether it's over. */
  settle(): boolean {
    if (this.outcome === 'ongoing') {
      const all = this.all();
      if (standing(all, 'enemies').length === 0) this.outcome = 'victory';
      else if (standing(all, 'party').length === 0) this.outcome = 'defeat';
    }
    return this.outcome !== 'ongoing';
  }

  state(): BattleState {
    return {
      ...this.battle,
      fighters: this.all(),
      active: this.outcome === 'ongoing' ? this.active : null,
      outcome: this.outcome,
      inventory: this.inventory,
      known: this.known,
      turn: this.turn,
    };
  }
}

/** What an action does, once it's been checked: `battle` is the battle as the turn started. */
function act(
  resolver: Resolver,
  battle: BattleState,
  actorId: FighterId,
  action: Action,
  targets: FighterId[],
): void {
  switch (action.type) {
    case 'attack': {
      const element = resolver.get(actorId).attackElement;
      for (const target of targets) {
        strike(resolver, actorId, target, { kind: 'physical', power: 1, element });
      }
      return;
    }
    case 'skill': {
      const skill = skillOf(battle, action.skill);
      const actor = resolver.get(actorId);
      if (!actor.skillsUsed.includes(action.skill)) {
        resolver.set({ ...actor, skillsUsed: [...actor.skillsUsed, action.skill] });
      }
      if (skill.mp > 0) changeMp(resolver, actorId, -skill.mp);
      for (const target of targets) useSkill(resolver, actorId, skill, target);
      return;
    }
    case 'telegraph': {
      // Nothing happens yet: the skill comes on their next turn.
      const actor = resolver.get(actorId);
      const target = targetOf(action);
      const telegraph =
        target === undefined ? { skill: action.skill } : { skill: action.skill, target };
      resolver.set({ ...actor, telegraph });
      return;
    }
    case 'item': {
      const item = consumableOf(battle, action.item);
      const left = (ownOf(resolver.inventory, action.item) ?? 0) - 1;
      const inventory = { ...resolver.inventory, [action.item]: left };
      if (left === 0) delete inventory[action.item];
      resolver.inventory = inventory;
      for (const target of targets) applyEffects(resolver, actorId, item.effects, target);
      return;
    }
    case 'guard': {
      const actor = resolver.get(actorId);
      resolver.set({ ...actor, statuses: { ...actor.statuses, guard: {} } });
      resolver.emit({ type: 'status-added', target: actorId, status: 'guard' });
      return;
    }
    case 'flee': {
      const escaped = resolver.rng.chance(fleeChance(battle));
      if (escaped) resolver.outcome = 'fled';
      resolver.emit({ type: 'flee', escaped });
      return;
    }
  }
}

/** A skill used on one target: its hit or healing, then its effects, if the hit landed. */
function useSkill(
  resolver: Resolver,
  actorId: FighterId,
  skill: SkillDef,
  target: FighterId,
): void {
  switch (skill.kind) {
    case 'physical':
    case 'magical': {
      const hit = { kind: skill.kind, power: skill.power, element: skill.element };
      if (!strike(resolver, actorId, target, hit)) return;
      break;
    }
    case 'healing': {
      const actor = resolver.get(actorId);
      const { mag } = withBuffs(actor.stats, buffsOf(actor.statuses), resolver.tuning.buffs);
      const variance = resolver.rng.range(...resolver.tuning.variance);
      const amount = finalHealing(baseHealing(skill.power, mag), variance, resolver.tuning);
      changeHp(resolver, target, amount);
      break;
    }
    case 'support':
      break;
  }
  applyEffects(resolver, actorId, skill.effects ?? [], target);
}

/** A physical or magical hit, with its power, maybe of an element. */
interface Hit {
  readonly kind: 'physical' | 'magical';
  readonly power: number;
  readonly element?: Element | undefined;
}

/**
 * One fighter hits another (see Damage in docs/DESIGN.md): a Blinded fighter's physical attack may
 * miss, and a physical hit may be critical. Returns whether it landed on a fighter left standing.
 */
function strike(resolver: Resolver, actorId: FighterId, targetId: FighterId, hit: Hit): boolean {
  const { rng, tuning } = resolver;
  const actor = resolver.get(actorId);
  const target = resolver.get(targetId);
  if (isKo(target)) return false;
  const physical = hit.kind === 'physical';
  if (physical && actor.statuses.blind && rng.chance(tuning.blindMiss)) {
    resolver.emit({ type: 'miss', target: targetId });
    return false;
  }
  const a = withBuffs(actor.stats, buffsOf(actor.statuses), tuning.buffs);
  const d = withBuffs(target.stats, buffsOf(target.statuses), tuning.buffs);
  const reaction = reactionOf(target, hit.element);
  const critical = physical && rng.chance(tuning.critChance);
  const variance = rng.range(...tuning.variance);
  const base = physical ? baseDamage(hit.power, a.atk, d.def) : baseDamage(hit.power, a.mag, d.res);
  const guarded = target.statuses.guard !== undefined;
  const amount = finalDamage(base, { reaction, critical, guarded, variance }, tuning);
  return land(resolver, targetId, amount, hit.element, reaction, critical);
}

/**
 * A hit lands: it does its damage, or heals a target that absorbs its element; a weakness
 * staggers them; and the party learns how they take its element. Returns whether they're standing.
 */
function land(
  resolver: Resolver,
  targetId: FighterId,
  amount: number,
  element: Element | undefined,
  reaction: Reaction,
  critical = false,
): boolean {
  if (reaction === 'absorb') changeHp(resolver, targetId, amount, 'absorb');
  else {
    const hit = element === undefined ? {} : { element, reaction };
    damage(resolver, targetId, amount, { ...hit, ...(critical ? { critical } : {}) });
  }
  const target = resolver.get(targetId);
  if (reaction === 'weak' && !isKo(target) && !target.staggered) {
    const share = resolver.tuning.stagger * (target.boss ? resolver.tuning.bossStagger : 1);
    const push = Math.round(normalDelay(target, resolver.tuning) * share);
    resolver.set({ ...target, ct: target.ct + push, staggered: true });
    resolver.emit({ type: 'stagger', target: targetId, push });
  }
  if (element !== undefined) {
    const fresh = learn(resolver, target, [element]);
    if (fresh.length > 0) resolver.emit({ type: 'reveal', target: targetId, elements: fresh });
  }
  return !isKo(resolver.get(targetId));
}

/** What an action does to a target besides its hit or healing, effect by effect, in order. */
function applyEffects(
  resolver: Resolver,
  actorId: FighterId,
  effects: NonNullable<SkillDef['effects']>,
  targetId: FighterId,
): void {
  const { rng, tuning } = resolver;
  for (const effect of effects) {
    const target = resolver.get(targetId);
    // Reviving only works on the KO'd, and everything else but escaping only on those standing.
    if (effect.type !== 'escape' && isKo(target) !== (effect.type === 'revive')) continue;
    switch (effect.type) {
      case 'delay': {
        const push = Math.round(normalDelay(target, tuning) * effect.amount);
        resolver.set({ ...target, ct: target.ct + push });
        resolver.emit({ type: 'delay', target: targetId, push });
        break;
      }
      case 'status':
        if (
          isImmune(target, effect.status) ||
          (effect.chance !== undefined && !rng.chance(effect.chance))
        ) {
          resolver.emit({ type: 'status-resisted', target: targetId, status: effect.status });
        } else {
          resolver.apply(giveStatus(target, effect.status, actorId, tuning));
        }
        break;
      case 'cure':
        resolver.apply(cureStatuses(target, effect.statuses, tuning));
        break;
      case 'reveal':
        // Insight shows how they take every element, known already or not.
        if (target.side === 'enemies') {
          learn(resolver, target, ELEMENTS);
          resolver.emit({ type: 'reveal', target: targetId, elements: ELEMENTS });
        }
        break;
      case 'restore':
        if (effect.hp !== undefined) changeHp(resolver, targetId, effect.hp);
        if (effect.mp !== undefined) changeMp(resolver, targetId, effect.mp);
        break;
      case 'revive': {
        const hp = Math.max(1, Math.floor(target.stats.hp * effect.hp));
        resolver.set({ ...target, hp, ct: normalDelay(target, tuning) });
        resolver.emit({ type: 'revive', target: targetId, hp });
        break;
      }
      case 'damage': {
        // A bomb: so much damage, of its element, which Guard halves but nothing else changes.
        const reaction = reactionOf(target, effect.element);
        const guarded = target.statuses.guard !== undefined;
        const factors = { reaction, critical: false, guarded, variance: 1 };
        land(
          resolver,
          targetId,
          finalDamage(effect.amount, factors, tuning),
          effect.element,
          reaction,
        );
        break;
      }
      case 'escape':
        resolver.outcome = 'fled';
        resolver.emit({ type: 'flee', escaped: true });
        break;
    }
  }
}

/** A fighter takes damage, which wakes them if they're asleep (Poison's doesn't), or KOs them. */
function damage(
  resolver: Resolver,
  targetId: FighterId,
  amount: number,
  details: Pick<
    Extract<BattleEvent, { type: 'damage' }>,
    'element' | 'reaction' | 'critical' | 'cause'
  >,
): void {
  const target = resolver.get(targetId);
  const hp = Math.max(0, target.hp - amount);
  resolver.emit({ type: 'damage', target: targetId, amount, hp, ...details });
  if (hp === 0) {
    resolver.set(knockedOut(target));
    resolver.emit({ type: 'ko', target: targetId });
    return;
  }
  if (amount > 0 && details.cause !== 'poison') resolver.apply(woken({ ...target, hp }));
  else resolver.set({ ...target, hp });
  enterPhase(resolver, targetId);
}

/**
 * A boss whose HP has fallen below a later phase's share enters it (the last, if it's below
 * several), and never goes back, even if healed.
 */
function enterPhase(resolver: Resolver, id: FighterId): void {
  const fighter = resolver.get(id);
  if (fighter.side !== 'enemies') return;
  const phases = ownOf(resolver.rules.enemies, fighter.kind)?.phases ?? [];
  const share = fighter.hp / fighter.stats.hp;
  const phase = phases.filter((each) => share < each.below).length;
  if (phase <= fighter.phase) return;
  resolver.set({ ...fighter, phase });
  resolver.emit({ type: 'phase', fighter: id, phase });
}

/** A fighter gains HP, up to their most. */
function changeHp(
  resolver: Resolver,
  targetId: FighterId,
  amount: number,
  cause?: 'regen' | 'absorb',
): void {
  const target = resolver.get(targetId);
  const hp = Math.min(target.stats.hp, target.hp + amount);
  resolver.set({ ...target, hp });
  resolver.emit({ type: 'heal', target: targetId, amount, hp, ...(cause ? { cause } : {}) });
}

/** A fighter spends MP (an amount below 0) or gets some back, up to their most. */
function changeMp(resolver: Resolver, targetId: FighterId, amount: number): void {
  const target = resolver.get(targetId);
  const mp = Math.max(0, Math.min(target.stats.mp, target.mp + amount));
  resolver.set({ ...target, mp });
  resolver.emit({ type: 'mp', target: targetId, amount, mp });
}

/**
 * The party learns how an enemy's kind takes elements, for the rest of the battle. Returns those
 * they didn't know.
 */
function learn(resolver: Resolver, target: Fighter, elements: readonly Element[]): Element[] {
  if (target.side !== 'enemies') return [];
  const known = ownOf(resolver.known, target.kind) ?? [];
  const fresh = elements.filter((element) => !known.includes(element));
  if (fresh.length > 0) {
    const all = ELEMENTS.filter((element) => known.includes(element) || fresh.includes(element));
    resolver.known = { ...resolver.known, [target.kind]: all };
  }
  return fresh;
}

/**
 * A fighter's turn ends: their CT becomes the delay of what they did, Haste or Slow included, and
 * statuses whose last turn it was wear off.
 */
function endTurn(resolver: Resolver, id: FighterId, rank: Rank): void {
  const fighter = resolver.get(id);
  if (isKo(fighter)) return;
  const ct = delay(
    fighter.stats.spd,
    rank,
    speedOf(fighter.statuses, resolver.tuning),
    resolver.tuning,
  );
  resolver.apply(atTurnEnd({ ...fighter, ct, turns: fighter.turns + 1 }));
}

/**
 * The battle moves on to the next turn that needs an action: whoever has the lowest CT goes, and
 * that much time passes for everyone. As each turn starts, Guard ends and statuses count down;
 * Poison and Regen take and give HP; and a sleeping fighter's turn passes them by.
 */
function nextTurn(resolver: Resolver): void {
  const { tuning } = resolver;
  for (;;) {
    const next = resolver
      .all()
      .filter((fighter) => !isKo(fighter))
      .sort((a, b) => byTurn(turnKey(a), turnKey(b)))[0];
    if (!next) return;
    for (const fighter of resolver.all()) {
      if (!isKo(fighter)) resolver.set({ ...fighter, ct: fighter.ct - next.ct });
    }
    resolver.turn += 1;
    resolver.emit({ type: 'turn', fighter: next.id });
    resolver.apply(atTurnStart(resolver.get(next.id)));

    const poisoned = resolver.get(next.id);
    if (poisoned.statuses.poison) {
      damage(resolver, next.id, tickAmount(poisoned.stats.hp, tuning.poison), { cause: 'poison' });
      if (resolver.settle()) return;
      if (isKo(resolver.get(next.id))) continue;
    }
    const healing = resolver.get(next.id);
    if (healing.statuses.regen && healing.hp < healing.stats.hp) {
      changeHp(resolver, next.id, tickAmount(healing.stats.hp, tuning.regen), 'regen');
    }
    if (resolver.get(next.id).statuses.sleep) {
      resolver.emit({ type: 'asleep', fighter: next.id });
      endTurn(resolver, next.id, 'normal');
      continue;
    }
    resolver.active = next.id;
    return;
  }
}

// The preview's timeline.

/**
 * A fighter in the preview's line: when their turn comes, Haste or Slow while they last, and the
 * rank of the skill they've telegraphed, for their next turn.
 */
interface Entry extends TurnKey {
  readonly id: FighterId;
  ct: number;
  nextRank: Rank | undefined;
  /** What Haste or Slow multiply their delays by, or 1. */
  speed: number;
  /** How many more turns Haste or Slow last, counting as statuses do. */
  speedTurns: number | undefined;
  staggered: boolean;
}

function entryOf(fighter: Fighter, battle: BattleState): Entry {
  const { haste, slow } = fighter.statuses;
  const { telegraph } = fighter;
  return {
    ...turnKey(fighter),
    id: fighter.id,
    nextRank: telegraph === null ? undefined : skillOf(battle, telegraph.skill).rank,
    speed: speedOf(fighter.statuses, battle.rules.tuning),
    speedTurns: (haste ?? slow)?.turns,
    staggered: fighter.staggered,
  };
}

/** What an action does to one target's place in line, as `applyAction` would if it all landed. */
function previewOn(
  battle: BattleState,
  line: Map<FighterId, Entry>,
  actor: Fighter,
  action: Action,
  target: Fighter,
): void {
  const { tuning } = battle.rules;
  const effects = effectsOf(battle, action);
  if (isKo(target)) {
    if (effects.some((effect) => effect.type === 'revive')) {
      line.set(target.id, { ...entryOf(target, battle), ct: normalDelay(target, tuning) });
    }
    return;
  }
  const entry = line.get(target.id);
  if (!entry) return;
  const stagger = (element: Element | undefined): void => {
    if (element === undefined || entry.staggered || reactionOf(target, element) !== 'weak') return;
    if (target.side === 'enemies' && !ownOf(battle.known, target.kind)?.includes(element)) return;
    const share = tuning.stagger * (target.boss ? tuning.bossStagger : 1);
    entry.ct += Math.round(normalDelay(target, tuning) * share);
    entry.staggered = true;
  };
  stagger(hitElementOf(battle, action, actor));
  for (const effect of effects) {
    if (effect.type === 'damage') stagger(effect.element);
    else if (effect.type === 'delay') {
      entry.ct += Math.round(normalDelay(target, tuning) * effect.amount);
    } else if (
      effect.type === 'status' &&
      (effect.status === 'haste' || effect.status === 'slow')
    ) {
      const speed = effect.status === 'haste' ? tuning.haste : tuning.slow;
      entry.ct = rescaled(entry.ct, entry.speed, speed);
      entry.speed = speed;
      entry.speedTurns = statusTurns(effect.status, target.boss, tuning);
    }
  }
}

/** The element of an action's own hit: Attack's from the weapon, or a skill's. */
function hitElementOf(battle: BattleState, action: Action, actor: Fighter): Element | undefined {
  if (action.type === 'attack') return actor.attackElement;
  if (action.type !== 'skill') return undefined;
  const skill = skillOf(battle, action.skill);
  return skill.kind === 'physical' || skill.kind === 'magical' ? skill.element : undefined;
}

// Making fighters.

function partyFighter(state: GameState, id: string, slot: number, db: GameDb): Fighter {
  const stats = memberStats(state, id, db);
  const character = ownOf(db.characters, id);
  if (!character) throw new RangeError(`There's no character called ${id}`);
  const weapon = ownOf(state.members, id)?.equipment.weapon;
  const item = weapon === undefined ? undefined : ownOf(db.items, weapon);
  return {
    id,
    side: 'party',
    kind: id,
    name: character.name,
    slot,
    stats,
    hp: stats.hp,
    mp: stats.mp,
    ct: 0,
    statuses: {},
    staggered: false,
    reactions: {},
    boss: false,
    ...(item?.kind === 'weapon' && item.element !== undefined
      ? { attackElement: item.element }
      : {}),
    skills: knownSkills(state, id, db),
    turns: 0,
    phase: 0,
    skillsUsed: [],
    telegraph: null,
  };
}

/** The enemies, lettered A, B and so on by kind when there's more than one of a kind. */
function enemyFighters(kinds: readonly string[], db: GameDb): Fighter[] {
  const seen = new Map<string, number>();
  return kinds.map((kind, slot) => {
    const def = ownOf(db.enemies, kind);
    if (!def) throw new RangeError(`There's no enemy called ${kind}`);
    const index = seen.get(kind) ?? 0;
    seen.set(kind, index + 1);
    const letter = String.fromCharCode(65 + index);
    const several = kinds.filter((each) => each === kind).length > 1;
    return {
      id: `${kind}-${letter.toLowerCase()}`,
      side: 'enemies',
      kind,
      name: several ? `${def.name} ${letter}` : def.name,
      slot,
      stats: def.stats,
      hp: def.stats.hp,
      mp: def.stats.mp,
      ct: 0,
      statuses: {},
      staggered: false,
      reactions: def.reactions ?? {},
      boss: def.boss ?? false,
      skills: skillsOf(def),
      turns: 0,
      phase: 0,
      skillsUsed: [],
      telegraph: null,
    };
  });
}

/** The skills an enemy uses, in any phase. */
const skillsOf = (def: EnemyDef): string[] => [
  ...new Set(
    [def.actions ?? [], ...(def.phases ?? []).map((phase) => phase.actions)]
      .flat()
      .flatMap((action) => (action.type === 'skill' ? [action.skill] : [])),
  ),
];

// Small helpers.

const otherSide = (side: Side): Side => (side === 'party' ? 'enemies' : 'party');

const standing = (fighters: readonly Fighter[], side: Side): Fighter[] =>
  fighters.filter((fighter) => fighter.side === side && !isKo(fighter));

const reactionOf = (fighter: Fighter, element: Element | undefined): Reaction =>
  element === undefined ? 'normal' : (fighter.reactions[element] ?? 'normal');

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const ownOf = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
