import { expect, test } from 'vitest';
import { chestScript, type Chest, type ChestText } from './chest';
import type { GameDb } from './db';
import { createScriptContext, type Stage, type StateStore } from './script-context';
import { createGameState, setFlag, type GameState } from './state';

const START = createGameState({
  location: { map: 'test-cellar', x: 2, y: 2, facing: 'down' },
  party: ['rowan'],
});

/** Chests need no content: they only give items and gold, and say so. */
const NO_CONTENT: GameDb = { characters: {}, skills: {}, items: {}, enemies: {} };

const TEXT: ChestText = {
  speaker: 'sign',
  found: (contents) =>
    'gold' in contents ? `Found ${contents.gold} gold!` : `Found ${contents.item}!`,
  empty: 'The chest is empty.',
};

const POTION: Chest = { flag: 'chest.test-01', item: 'potion' };

/** A stage that writes down what's said. A chest does nothing else. */
function talkingStage(said: string[]): Stage {
  const offStage = (): Promise<never> => Promise.reject(new Error('A chest only says things'));
  const silent = (): never => {
    throw new Error('A chest only says things');
  };
  return {
    say: (speaker, line) => {
      said.push(`${speaker}: ${line}`);
      return Promise.resolve();
    },
    choice: offStage,
    wait: offStage,
    face: offStage,
    move: offStage,
    leave: offStage,
    fadeOut: offStage,
    fadeIn: offStage,
    teleport: offStage,
    shop: offStage,
    battle: offStage,
    jingle: offStage,
    bgm: silent,
    sfx: silent,
  };
}

function storeOf(state: GameState): StateStore {
  let current = state;
  return {
    get: () => current,
    set: (next) => {
      current = next;
    },
  };
}

/** Opens a chest, and reports what was said and the game state afterwards. */
async function open(chest: Chest, state: GameState = START) {
  const said: string[] = [];
  const store = storeOf(state);
  await chestScript(chest, TEXT)(createScriptContext(talkingStage(said), store, NO_CONTENT));
  return { said, state: store.get() };
}

test('a chest opens once: it gives what is inside, sets its flag and says so', async () => {
  const first = await open(POTION);
  expect(first.said).toEqual(['sign: Found potion!']);
  expect(first.state.inventory).toEqual({ potion: 1 });
  expect(first.state.flags).toEqual({ 'chest.test-01': true });

  const again = await open(POTION, first.state);
  expect(again.said).toEqual(['sign: The chest is empty.']);
  expect(again.state).toBe(first.state);
});

test('a chest can hold gold', async () => {
  const { said, state } = await open({ flag: 'chest.test-02', gold: 30 });
  expect(said).toEqual(['sign: Found 30 gold!']);
  expect(state.gold).toBe(30);
  expect(state.inventory).toEqual({});
});

test('each chest goes by its own flag, whatever set it', async () => {
  const opened = await open(POTION);
  const other = await open({ flag: 'chest.test-02', item: 'ether' }, opened.state);
  expect(other.state.inventory).toEqual({ potion: 1, ether: 1 });

  // A story script can empty a chest before the player gets there.
  const emptied = setFlag(START, 'chest.test-01');
  const late = await open(POTION, emptied);
  expect(late.said).toEqual(['sign: The chest is empty.']);
  expect(late.state).toBe(emptied);
});

test('a chest that cannot say what is inside stays shut', async () => {
  const mute: ChestText = {
    ...TEXT,
    found: () => {
      throw new Error("There's no item called potion");
    },
  };
  const said: string[] = [];
  const store = storeOf(START);
  await expect(
    chestScript(POTION, mute)(createScriptContext(talkingStage(said), store, NO_CONTENT)),
  ).rejects.toThrow("There's no item called potion");
  expect(said).toEqual([]);
  expect(store.get()).toBe(START);
});
