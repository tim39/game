import type { GameDb } from '../core/db';
import { CHARACTERS } from './characters';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';
import { SKILLS } from './skills';

/** The game's content, for the core functions that take a GameDb. */
export const DB: GameDb = {
  characters: CHARACTERS,
  skills: SKILLS,
  items: ITEMS,
  enemies: ENEMIES,
};
