import type { CharacterDef, EnemyDef, ItemDef, SkillDef } from './schema';

/**
 * The content the rules work with: who can be in the party, their skills, the items, and the
 * enemies. Core functions that need it take it as an argument, so tests can use small fixtures; the
 * game's is DB in src/data/db.ts.
 */
export interface GameDb {
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly skills: Readonly<Record<string, SkillDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly enemies: Readonly<Record<string, EnemyDef>>;
}
