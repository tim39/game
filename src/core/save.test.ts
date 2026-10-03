import { describe, expect, test } from 'vitest';
import {
  MIGRATIONS,
  SAVE_VERSION,
  SaveError,
  createSave,
  parseSave,
  serializeSave,
  type Migration,
} from './save';
import { addItem, createGameState, setFlag, type GameState } from './state';

const SAVED_AT = '2026-10-03T14:22:05.123Z';

const game = (): GameState => {
  let state = createGameState({
    location: { map: 'saltmere-tamsin', x: 6, y: 3, facing: 'up' },
    party: ['rowan'],
  });
  state = setFlag(state, 'chest.saltmere-tamsin-01');
  return addItem(state, 'potion');
};

/** A save as stored, with some of it changed: `{ version: 2 }`, say. */
const stored = (changes: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...createSave(game(), SAVED_AT), ...changes });

/** Expects reading `text` to fail, for the reason given. */
function expectProblem(text: string, problem: SaveError['problem'], message: string): void {
  let error: unknown;
  try {
    parseSave(text);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SaveError);
  expect(error).toMatchObject({ problem });
  expect((error as Error).message).toContain(message);
}

describe('saves', () => {
  test('keep the game state, the version and when they were saved', () => {
    const save = createSave(game(), SAVED_AT);
    expect(save).toEqual({ version: SAVE_VERSION, savedAt: SAVED_AT, state: game() });
    expect(() => createSave(game(), 'teatime')).toThrow(RangeError);
  });

  test('read back as they were, compact or readable', () => {
    const save = createSave(game(), SAVED_AT);
    const compact = serializeSave(save);
    const readable = serializeSave(save, true);
    expect(compact).not.toContain('\n');
    expect(readable).toContain('\n  "version": ');
    expect(readable.endsWith('}\n')).toBe(true);
    expect(parseSave(compact)).toEqual(save);
    expect(parseSave(readable)).toEqual(save);
  });

  test('leave behind anything else that came along with them', () => {
    expect(parseSave(stored({ cheats: true }))).toEqual(createSave(game(), SAVED_AT));
  });

  test('that aren’t saves at all are turned down', () => {
    expectProblem('', 'damaged', "isn't JSON");
    expectProblem('{"version": 1, "savedAt"', 'damaged', "isn't JSON");
    expectProblem('[1, 2, 3]', 'damaged', "isn't a JSON object");
    expectProblem('"save"', 'damaged', "isn't a JSON object");
    expectProblem('null', 'damaged', "isn't a JSON object");
  });

  test('need a version that is a whole number from 1 up', () => {
    for (const version of [undefined, null, 0, -1, 1.5, '1']) {
      expectProblem(stored({ version }), 'damaged', 'not a whole number from 1 up');
    }
  });

  test('need the time they were saved', () => {
    for (const savedAt of [undefined, 1759501325123, 'yesterday']) {
      expectProblem(stored({ savedAt }), 'damaged', "isn't a time");
    }
  });

  test('with a damaged state are turned down, saying what’s wrong', () => {
    expectProblem(stored({ state: null }), 'damaged', "The game state isn't an object");
    const noGold = { ...game(), gold: -10 };
    expectProblem(stored({ state: noGold }), 'damaged', 'from 0 up, not -10');
  });

  test('made by a newer version of the game can’t be read', () => {
    expectProblem(stored({ version: SAVE_VERSION + 1 }), 'newer', `reads up to ${SAVE_VERSION}`);
  });
});

describe('migrations', () => {
  test('each add a version', () => {
    expect(SAVE_VERSION).toBe(MIGRATIONS.length + 1);
  });

  // Stand-ins for two changes to GameState: version 2 renamed gold to coins, and version 3
  // renamed it back and added 10 to it, all in coins.
  const toV2: Migration = ({ gold, ...rest }) => ({ ...rest, coins: gold });
  const toV3: Migration = ({ coins, ...rest }) => ({ ...rest, gold: Number(coins) + 10 });
  const versions = [toV2, toV3];
  const v1 = { ...game(), gold: 5 };
  const v2 = { ...game(), coins: 5 };
  const atVersion = (version: number, state: unknown): string =>
    JSON.stringify({ version, savedAt: SAVED_AT, state });

  test('bring an old save up to date, one version at a time and in order', () => {
    const latest = { version: 3, savedAt: SAVED_AT, state: { ...game(), gold: 15 } };
    expect(parseSave(atVersion(1, v1), versions)).toEqual(latest);
    expect(parseSave(atVersion(2, v2), versions)).toEqual(latest);
    expect(parseSave(atVersion(3, { ...game(), gold: 15 }), versions)).toEqual(latest);
  });

  test('that fail, or give a state that breaks the rules, mean a damaged save', () => {
    const broken: Migration = () => {
      throw new Error('The rats got to it');
    };
    expect(() => parseSave(atVersion(1, v1), [broken])).toThrow('The rats got to it');
    // A version 1 state that says it's version 2 has no coins to turn back into gold.
    expect(() => parseSave(atVersion(2, v1), versions)).toThrow('gold is a whole number');
    expect(() => parseSave(atVersion(1, [v1]), versions)).toThrow(SaveError);
  });
});

/**
 * Real saves from every version of the game, exported from the debug menu, and what each holds.
 * Bumping SAVE_VERSION means adding one: export a save from the new version as `v<n>.json`.
 */
const FIXTURES = import.meta.glob<string>('./save-fixtures/v*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const FIXTURE_HOLDS: Readonly<Record<number, Partial<GameState>>> = {
  // A new game, saved in Tamsin's house after opening the chest at the foot of Rowan's bed.
  1: {
    party: ['rowan'],
    members: { rowan: { level: 1, exp: 0 } },
    inventory: { potion: 1 },
    gold: 0,
    flags: { 'chest.saltmere-tamsin-01': true },
    vars: {},
    location: { map: 'saltmere-tamsin', x: 2, y: 3, facing: 'left' },
  },
};

describe('a save from every version', () => {
  const versions = Object.keys(FIXTURES).map((path) => Number(/v(\d+)\.json$/.exec(path)?.[1]));

  test('is kept in save-fixtures/, from version 1 to this one', () => {
    expect(versions.sort((a, b) => a - b)).toEqual(
      Array.from({ length: SAVE_VERSION }, (_, i) => i + 1),
    );
    expect(Object.keys(FIXTURE_HOLDS).map(Number)).toEqual(versions);
  });

  test.each(Object.entries(FIXTURES))('%s still loads, with all it held', (path, text) => {
    const version = Number(/v(\d+)\.json$/.exec(path)?.[1]);
    expect(JSON.parse(text)).toMatchObject({ version });
    const save = parseSave(text);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.state).toMatchObject(FIXTURE_HOLDS[version] ?? {});
    expect(save.state.playTimeMs).toBeGreaterThan(0);
  });
});
