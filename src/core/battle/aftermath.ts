import type { GameDb } from '../db';
import type { ExpCurve } from '../levels';
import { knownSkills, memberStats, memberVitals } from '../party';
import type { Rng } from '../rng';
import {
  addGold,
  addItem,
  gainExp,
  itemCount,
  learnReactions,
  removeItem,
  setVitals,
  type CharacterId,
  type GameState,
  type ItemId,
} from '../state';
import type { Stats } from '../stats';
import type { BattleState } from './battle';

/**
 * What a battle leaves behind once it's over (see Winning and losing in docs/DESIGN.md): the items
 * the party used, what they learned of the enemies, and the HP and MP they have left all go back
 * into the game state, and winning gives them the enemies' EXP, gold and drops.
 */

/** What winning a battle gives the party. */
export interface Rewards {
  /** EXP for each member of the party, KO'd or not: all the enemies'. */
  readonly exp: number;
  readonly gold: number;
  /** Items the enemies dropped: how many of each, by ID, in the order they first dropped. */
  readonly items: Readonly<Record<ItemId, number>>;
}

/** A member of the party who went up a level, or several. */
export interface LevelUp {
  readonly id: CharacterId;
  /** The level they were, and the one they reached. */
  readonly from: number;
  readonly to: number;
  /** Their stats before and after, with their equipment's bonuses. */
  readonly before: Stats;
  readonly after: Stats;
  /** Skills they learned on the way, by ID, in the order their menu lists them. */
  readonly skills: readonly string[];
}

/** The game state after a battle, with what the battle gave. */
export interface Aftermath {
  readonly state: GameState;
  /** What the party won, or null for a battle they fled or lost. */
  readonly rewards: Rewards | null;
  /** Everyone who went up a level, in battle order. */
  readonly levelUps: readonly LevelUp[];
}

/**
 * Rolls for what the enemies of a battle give: all of their EXP and gold, and the items they drop.
 * Each item an enemy can drop is rolled for on its own, so one enemy may drop more than one.
 */
export function rollRewards(battle: BattleState, rng: Rng): Rewards {
  let exp = 0;
  let gold = 0;
  const items: Record<ItemId, number> = {};
  for (const fighter of battle.fighters) {
    if (fighter.side !== 'enemies') continue;
    const enemy = Object.hasOwn(battle.rules.enemies, fighter.kind)
      ? battle.rules.enemies[fighter.kind]
      : undefined;
    if (!enemy) throw new RangeError(`There's no enemy called ${fighter.kind}`);
    exp += enemy.exp;
    gold += enemy.gold;
    for (const { item, chance } of enemy.drops ?? []) {
      if (rng.chance(chance)) items[item] = (items[item] ?? 0) + 1;
    }
  }
  return { exp, gold, items };
}

/**
 * The game state after a battle that's over. Whatever the party did, they did: the items they used
 * are gone, and they know what they learned of how enemies take elements. Winning or fleeing, they
 * come away with the HP and MP the battle left them; winning, the KO'd get back up with 1 HP, and
 * the party gets what `rollRewards` rolls: everyone gains the EXP, KO'd or not, and levels up as far
 * as it takes them. A battle lost leaves the game as it was, to go on from before it.
 */
export function battleAftermath(
  state: GameState,
  battle: BattleState,
  db: GameDb,
  curve: ExpCurve,
  rng: Rng,
): Aftermath {
  const { outcome } = battle;
  if (outcome === 'ongoing') throw new RangeError("The battle isn't over yet");
  if (outcome === 'defeat') return { state, rewards: null, levelUps: [] };

  let next = withInventory(state, battle.inventory);
  next = learnReactions(next, battle.known);
  for (const fighter of battle.fighters) {
    if (fighter.side !== 'party') continue;
    const hp = outcome === 'victory' ? Math.max(fighter.hp, 1) : fighter.hp;
    const { most } = memberVitals(next, fighter.kind, db);
    next = setVitals(next, fighter.kind, { hp, mp: fighter.mp }, most);
  }
  if (outcome === 'fled') return { state: next, rewards: null, levelUps: [] };

  const rewards = rollRewards(battle, rng);
  next = addGold(next, rewards.gold);
  for (const [item, count] of Object.entries(rewards.items)) next = addItem(next, item, count);
  const levelUps: LevelUp[] = [];
  for (const id of next.party) {
    const from = levelOf(next, id);
    const before = memberStats(next, id, db);
    const knew = knownSkills(next, id, db);
    next = gainExp(next, id, rewards.exp, curve);
    const to = levelOf(next, id);
    if (to === from) continue;
    const skills = knownSkills(next, id, db).filter((skill) => !knew.includes(skill));
    levelUps.push({ id, from, to, before, after: memberStats(next, id, db), skills });
  }
  return { state: next, rewards, levelUps };
}

/** The party with `inventory` for an inventory: what's been used taken out, and anything new put in. */
function withInventory(state: GameState, inventory: Readonly<Record<ItemId, number>>): GameState {
  let next = state;
  for (const item of new Set([...Object.keys(state.inventory), ...Object.keys(inventory)])) {
    const now = Object.hasOwn(inventory, item) ? (inventory[item] ?? 0) : 0;
    const change = now - itemCount(state, item);
    if (change > 0) next = addItem(next, item, change);
    else if (change < 0) next = removeItem(next, item, -change);
  }
  return next;
}

function levelOf(state: GameState, id: CharacterId): number {
  const member = Object.hasOwn(state.members, id) ? state.members[id] : undefined;
  if (!member) throw new RangeError(`${id} isn't in the party`);
  return member.level;
}
