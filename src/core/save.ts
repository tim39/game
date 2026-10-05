import { checkedGameState, type GameState } from './state';

/**
 * Saves: the game state, with the version of the save format it's in and when it was saved, as
 * plain JSON. Older saves still load: every change to GameState's shape comes with a migration,
 * which brings saves from the version before up to date. See "Game state and saves" in
 * docs/TECH.md.
 */

/** A saved game, as the browser stores it and the debug menu exports it. */
export interface SaveFile {
  /** The version of the save format: SAVE_VERSION when it's written. */
  readonly version: number;
  /** When it was saved, in ISO 8601: `2026-10-03T14:22:05.123Z`. */
  readonly savedAt: string;
  readonly state: GameState;
}

/**
 * Brings a save's state up a version. It works on plain JSON, since that's all an old state is:
 * the first migration turns a version 1 state into version 2, and so on. What comes out of the
 * last one is checked like any other state.
 */
export type Migration = (state: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/**
 * Version 2 gave party members equipment. Version 1's party only ever held Rowan, who now starts
 * with a Bronze Sword and Travel Clothes, so they get those; anyone else gets nothing.
 */
const giveEquipment: Migration = (state) => {
  const { members } = state;
  if (!isObject(members)) return { ...state };
  const startingGear = (id: string) =>
    id === 'rowan' ? { weapon: 'bronze-sword', armor: 'travel-clothes' } : {};
  return {
    ...state,
    members: Object.fromEntries(
      Object.entries(members).map(([id, member]) => [
        id,
        isObject(member) ? { ...member, equipment: startingGear(id) } : member,
      ]),
    ),
  };
};

/**
 * Version 3 kept members' HP and MP, while they're down, and what the party has learned of how
 * enemies take elements. A version 2 save has everyone at full, which needs nothing, and has
 * learned nothing yet.
 */
const keepWhatsKnown: Migration = (state) => ({ ...state, knownReactions: {} });

/**
 * Every migration, oldest first. A change to GameState's shape adds one, with a test, and that
 * bumps SAVE_VERSION; add a save of the new version to src/core/save-fixtures/ as well.
 */
export const MIGRATIONS: readonly Migration[] = [giveEquipment, keepWhatsKnown];

/** The version saves are written in. Every migration adds one. */
export const SAVE_VERSION = MIGRATIONS.length + 1;

/** Why a save can't be loaded: it's damaged (or not a save at all), or a newer game wrote it. */
export class SaveError extends Error {
  constructor(
    readonly problem: 'damaged' | 'newer',
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** A save of a game state, made at `savedAt` (an ISO 8601 time, which core can't look up). */
export function createSave(state: GameState, savedAt: string): SaveFile {
  return { version: SAVE_VERSION, savedAt: checkedTime(savedAt), state };
}

/** A save as JSON: compact to store, or indented for people to read. */
export const serializeSave = (save: SaveFile, readable = false): string =>
  readable ? `${JSON.stringify(save, null, 2)}\n` : JSON.stringify(save);

/**
 * Reads a save back from JSON: checks that it's a save, brings it up to date through the
 * migrations it needs, and checks the state it ends up with. Throws a SaveError saying what's
 * wrong if any of that fails. `migrations` stand in for the real ones in tests.
 */
export function parseSave(text: string, migrations: readonly Migration[] = MIGRATIONS): SaveFile {
  const latest = migrations.length + 1;
  const damaged = (why: string): SaveError => new SaveError('damaged', why);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw damaged("It isn't JSON");
  }
  if (!isObject(json)) throw damaged("It isn't a JSON object");
  const { version, savedAt } = json;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw damaged(`Its version is ${String(version)}, not a whole number from 1 up`);
  }
  if (version > latest) {
    throw new SaveError(
      'newer',
      `A newer version of the game made it: it's version ${version}, and this game reads up to ${latest}`,
    );
  }
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) {
    throw damaged(`Its time, ${String(savedAt)}, isn't a time`);
  }
  try {
    let state = json.state;
    for (const migrate of migrations.slice(version - 1)) {
      if (!isObject(state)) throw new TypeError("The game state isn't an object");
      state = migrate(state);
    }
    return { version: latest, savedAt, state: checkedGameState(state) };
  } catch (error) {
    throw damaged(error instanceof Error ? error.message : String(error));
  }
}

const isObject = (json: unknown): json is Readonly<Record<string, unknown>> =>
  typeof json === 'object' && json !== null && !Array.isArray(json);

function checkedTime(time: string): string {
  if (Number.isNaN(Date.parse(time))) throw new RangeError(`"${time}" isn't a time`);
  return time;
}
