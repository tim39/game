import { baseHealing, finalHealing } from './battle/damage';
import type { BattleTuning } from './battle/tuning';
import type { GameDb } from './db';
import { memberStats, memberVitals } from './party';
import type { ItemDef, SkillDef } from './schema';
import {
  inParty,
  itemCount,
  removeItem,
  setVitals,
  type CharacterId,
  type GameState,
  type ItemId,
  type Vitals,
} from './state';

/**
 * Items and skills used outside battle, from the menu (see Menu in docs/DESIGN.md). There, they do
 * what they do in battle to HP and MP: restoring them, healing, and getting the KO'd back up. The
 * rest is for battles alone: statuses don't last past one, so curing does nothing, and bombs and
 * Smoke Pellets can't be used at all. Healing has no variance outside battle: it comes to what a
 * battle's does on average.
 */

type Effect = NonNullable<SkillDef['effects']>[number];

/** What using something does to whoever it's used on, outside battle. */
interface FieldUse {
  /** At one member, or at the whole party at once; or, for a skill aimed at its user, at them. */
  readonly aim: 'one' | 'all' | 'self';
  /** How much HP a healing skill restores. */
  readonly healing?: number;
  readonly effects: readonly Effect[];
}

/** Whom something can be used on outside battle, and how it's aimed. */
export interface FieldTargets {
  /** On everyone it reaches at once, rather than on one of them. */
  readonly all: boolean;
  /** Those it would do something for, in party order: none if it can't be used now. */
  readonly members: readonly CharacterId[];
}

const NOBODY: FieldTargets = { all: false, members: [] };

/** Whether an item does anything outside battle: restores HP or MP, or gets the KO'd back up. */
export const worksOutsideBattle = (item: ItemDef): boolean => itemUse(item) !== null;

/** Whom an item could be used on now: the party members it would do something for. */
export function itemTargets(state: GameState, item: ItemId, db: GameDb): FieldTargets {
  const def = own(db.items, item);
  const use = def ? itemUse(def) : null;
  if (!use || itemCount(state, item) < 1) return NOBODY;
  return reach(state, use, null, db);
}

/**
 * Uses one of an item on `on`: one member, or everyone it reaches, for an item that works on the
 * whole party. Throws if the party has none, or it would do nothing for any of them.
 */
export function useItem(
  state: GameState,
  item: ItemId,
  on: readonly CharacterId[],
  db: GameDb,
): GameState {
  const def = own(db.items, item);
  const use = def ? itemUse(def) : null;
  if (!def || !use) throw new RangeError(`${def?.name ?? item} can't be used outside battle`);
  checkTargets(def.name, itemTargets(state, item, db), on);
  return applyUse(removeItem(state, item), use, on, db);
}

/** Whether a skill does anything outside battle: heals, restores HP or MP, or revives. */
export const castableOutsideBattle = (skill: SkillDef): boolean => skillUse(skill, 1) !== null;

/**
 * Whom a member could cast one of their skills on now: those it would do something for. Nobody,
 * if the caster is KO'd or hasn't the MP for it.
 */
export function skillTargets(
  state: GameState,
  caster: CharacterId,
  skill: string,
  db: GameDb,
): FieldTargets {
  const def = own(db.skills, skill);
  // Whatever it comes to, healing restores at least 1 HP, so it helps anyone who's hurt.
  const use = def ? skillUse(def, 1) : null;
  if (!def || !use || !inParty(state, caster)) return NOBODY;
  const { now } = memberVitals(state, caster, db);
  if (now.hp === 0 || now.mp < def.mp) return NOBODY;
  return reach(state, use, caster, db);
}

/**
 * A member casts a skill on `on` (one member, or everyone it reaches), paying its MP: healing, by
 * their MAG, and its effects. Throws if they can't cast it, or it would do nothing for anyone in
 * `on`.
 */
export function castSkill(
  state: GameState,
  caster: CharacterId,
  skill: string,
  on: readonly CharacterId[],
  db: GameDb,
  tuning: BattleTuning,
): GameState {
  const def = own(db.skills, skill);
  if (!def || !castableOutsideBattle(def)) {
    throw new RangeError(`${def?.name ?? skill} can't be cast outside battle`);
  }
  checkTargets(def.name, skillTargets(state, caster, skill, db), on);
  // Healing by the caster's MAG, as in battle, without the variance.
  const { mag } = memberStats(state, caster, db);
  const healing = def.kind === 'healing' ? finalHealing(baseHealing(def.power, mag), 1, tuning) : 0;
  const use = skillUse(def, healing);
  if (!use) throw new RangeError(`${def.name} can't be cast outside battle`);
  const { now, most } = memberVitals(state, caster, db);
  const paid = setVitals(state, caster, { hp: now.hp, mp: now.mp - def.mp }, most);
  return applyUse(paid, use, on, db);
}

/** What an item does outside battle, or null if nothing: only items aimed at allies can be used. */
function itemUse(item: ItemDef): FieldUse | null {
  if (item.kind !== 'consumable') return null;
  const effects = item.effects.filter(worksOnVitals);
  if (effects.length === 0) return null;
  if (item.target === 'one-ally') return { aim: 'one', effects };
  if (item.target === 'all-allies') return { aim: 'all', effects };
  return null;
}

/** What a skill does outside battle, with its healing at `healing`, or null if nothing. */
function skillUse(skill: SkillDef, healing: number): FieldUse | null {
  const effects = (skill.effects ?? []).filter(worksOnVitals);
  const heals = skill.kind === 'healing';
  if (!heals && effects.length === 0) return null;
  const aim =
    skill.target === 'one-ally'
      ? 'one'
      : skill.target === 'all-allies'
        ? 'all'
        : skill.target === 'self'
          ? 'self'
          : null;
  if (aim === null) return null;
  return { aim, effects, ...(heals ? { healing } : {}) };
}

/** Effects that work outside battle: those that restore HP or MP, or revive. */
const worksOnVitals = (effect: Effect): boolean =>
  effect.type === 'restore' || effect.type === 'revive';

/** Those a use would do something for, as it's aimed, in party order. */
function reach(
  state: GameState,
  use: FieldUse,
  caster: CharacterId | null,
  db: GameDb,
): FieldTargets {
  const candidates = use.aim === 'self' && caster !== null ? [caster] : state.party;
  const members = candidates.filter((id) => {
    const { now, most } = memberVitals(state, id, db);
    const after = afterUse(use, now, most);
    return after.hp !== now.hp || after.mp !== now.mp;
  });
  return { all: use.aim === 'all', members };
}

/**
 * What a use leaves someone with, effect by effect as in battle: getting someone back up only
 * works on the KO'd, and everything else only on those standing.
 */
function afterUse(use: FieldUse, now: Vitals, most: Vitals): Vitals {
  let { hp, mp } = now;
  if (use.healing !== undefined && hp > 0) hp = Math.min(most.hp, hp + use.healing);
  for (const effect of use.effects) {
    const down = hp === 0;
    if (effect.type === 'revive' && down) hp = Math.max(1, Math.floor(most.hp * effect.hp));
    if (effect.type === 'restore' && !down) {
      if (effect.hp !== undefined) hp = Math.min(most.hp, hp + effect.hp);
      if (effect.mp !== undefined) mp = Math.min(most.mp, mp + effect.mp);
    }
  }
  return { hp, mp };
}

/** Applies a use to each of `on`: their HP and MP as it leaves them. */
function applyUse(
  state: GameState,
  use: FieldUse,
  on: readonly CharacterId[],
  db: GameDb,
): GameState {
  return on.reduce((game, id) => {
    const { now, most } = memberVitals(game, id, db);
    return setVitals(game, id, afterUse(use, now, most), most);
  }, state);
}

/** Throws unless `on` is one of those it would help, or, aimed at everyone, all of them. */
function checkTargets(name: string, targets: FieldTargets, on: readonly CharacterId[]): void {
  if (targets.members.length === 0) throw new RangeError(`${name} would do nothing for anyone`);
  if (targets.all ? on.length !== targets.members.length : on.length !== 1) {
    const whom = targets.all ? `everyone it helps, ${targets.members.join(', ')}` : 'one ally';
    throw new RangeError(`${name} is used on ${whom}, not ${on.join(', ') || 'nobody'}`);
  }
  const wrong = on.find((id) => !targets.members.includes(id));
  if (wrong !== undefined) throw new RangeError(`${name} would do nothing for ${wrong}`);
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
