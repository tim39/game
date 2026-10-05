import type { GameDb } from './db';
import type { CharacterDef } from './schema';
import {
  createGameState,
  hasFlag,
  joinParty,
  type CharacterId,
  type GameState,
  type MemberState,
  type NewGame,
  type Vitals,
} from './state';
import { statsAtLevel, withEquipment, type Stats } from './stats';

/**
 * The party, as the content makes it: the gear people join with, and what a member's level and
 * equipment make of them. The content is passed in as a GameDb (src/core/db.ts).
 */

/** A new game as `start` says, with everyone in the party wearing the gear they start with. */
export function startGame(start: NewGame, db: GameDb): GameState {
  const empty = createGameState({ ...start, party: [] });
  return start.party.reduce((state, id) => recruit(state, id, db), empty);
}

/** Someone joins the party at level 1, wearing the gear their character starts with. */
export const recruit = (state: GameState, id: CharacterId, db: GameDb): GameState =>
  joinParty(state, id, characterOf(db, id).equipment);

/** A member's stats: their level's, with their equipment's bonuses (see src/core/stats.ts). */
export function memberStats(state: GameState, id: CharacterId, db: GameDb): Stats {
  const member = memberOf(state, id);
  const bonuses = Object.values(member.equipment).map((item) => {
    const def = Object.hasOwn(db.items, item) ? db.items[item] : undefined;
    if (def?.kind !== 'weapon' && def?.kind !== 'armor' && def?.kind !== 'accessory') {
      throw new RangeError(`${id} has on ${item}, which isn't equipment`);
    }
    return def.stats;
  });
  return withEquipment(statsAtLevel(characterOf(db, id).stats, member.level), bonuses);
}

/**
 * A member's HP and MP now, as the game state keeps them, and the most they can have: full, unless
 * it says they're down, and never more than their most (gear that raised it may have come off).
 */
export function memberVitals(
  state: GameState,
  id: CharacterId,
  db: GameDb,
): { readonly now: Vitals; readonly most: Vitals } {
  const member = memberOf(state, id);
  const { hp, mp } = memberStats(state, id, db);
  return {
    now: { hp: Math.min(member.hp ?? hp, hp), mp: Math.min(member.mp ?? mp, mp) },
    most: { hp, mp },
  };
}

/**
 * The skills a member knows, in the order their menu lists them: those they've reached the level
 * for, and those whose story flag is set.
 */
export function knownSkills(state: GameState, id: CharacterId, db: GameDb): string[] {
  const { level } = memberOf(state, id);
  return characterOf(db, id)
    .skills.filter((learn) =>
      learn.flag === undefined ? level >= (learn.level ?? Infinity) : hasFlag(state, learn.flag),
    )
    .map((learn) => learn.skill);
}

function characterOf(db: GameDb, id: CharacterId): CharacterDef {
  const character = Object.hasOwn(db.characters, id) ? db.characters[id] : undefined;
  if (!character) throw new RangeError(`There's no character called ${id}`);
  return character;
}

function memberOf(state: GameState, id: CharacterId): MemberState {
  const member = Object.hasOwn(state.members, id) ? state.members[id] : undefined;
  if (!member) throw new RangeError(`${id} isn't in the party`);
  return member;
}
