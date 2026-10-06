import { describe, expect, test } from 'vitest';
import type { GameDb } from './db';
import { defineEvent, type EventScript } from './events';
import { createScriptContext, type Stage } from './script-context';
import { createGameState, setVitals, type GameState } from './state';

const START = createGameState({
  location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
  party: ['rowan'],
});

/** Bram, who joins with his axe. */
const DB: GameDb = {
  characters: {
    bram: {
      name: 'Bram',
      stats: {
        hp: [85, 1300],
        mp: [6, 55],
        atk: [11, 105],
        def: [13, 120],
        mag: [3, 35],
        res: [8, 80],
        spd: [7, 18],
      },
      weapon: 'axe',
      armor: ['heavy'],
      equipment: { weapon: 'hand-axe' },
      skills: [],
    },
  },
  skills: {},
  items: {},
  enemies: {},
};

/** A stage that answers at once, writes down everything asked of it, and picks `answers` in turn. */
function fakeStage(answers: number[] = []): { stage: Stage; log: string[] } {
  const log: string[] = [];
  const done = (entry: string): Promise<void> => {
    log.push(entry);
    return Promise.resolve();
  };
  const stage: Stage = {
    say: (speaker, text) => done(`say ${speaker}: ${text}`),
    choice: (options) => {
      log.push(`choice ${options.join(' / ')}`);
      return Promise.resolve(answers.shift() ?? 0);
    },
    wait: (ms) => done(`wait ${ms}`),
    face: (actor, toward) => done(`face ${actor} ${toward}`),
    move: (actor, route) => done(`move ${actor} ${route.join(' ')}`),
    fadeOut: (ms) => done(`fadeOut ${ms ?? 'default'}`),
    fadeIn: (ms) => done(`fadeIn ${ms ?? 'default'}`),
    teleport: (map, spawn) => done(`teleport ${map} ${spawn}`),
    shop: (id) => done(`shop ${id}`),
    jingle: (sound) => done(`jingle ${sound}`),
    bgm: (track) => {
      log.push(`bgm ${track ?? 'off'}`);
    },
    sfx: (sound) => {
      log.push(`sfx ${sound}`);
    },
  };
  return { stage, log };
}

/** Runs a script against a fake stage and a game state, and reports what it did. */
async function run(script: EventScript, state = START, answers: number[] = []) {
  const { stage, log } = fakeStage(answers);
  let current = state;
  const store = { get: () => current, set: (next: GameState) => (current = next) };
  await script(createScriptContext(stage, store, DB));
  return { log, state: current };
}

// A chest that gives its Potions once, kept closed by a flag.
const chest = defineEvent(async (ev) => {
  if (ev.flag('chest.test-01')) {
    await ev.say('sign', 'The chest is empty.');
    return;
  }
  ev.setFlag('chest.test-01');
  ev.giveItem('potion', 2);
  await ev.say('sign', 'Found 2 Potions!');
});

describe('the game state verbs', () => {
  test('read and change the game state, so a flag can keep a chest closed', async () => {
    const first = await run(chest);
    expect(first.log).toEqual(['say sign: Found 2 Potions!']);
    expect(first.state.inventory).toEqual({ potion: 2 });
    expect(first.state.flags).toEqual({ 'chest.test-01': true });

    const second = await run(chest, first.state);
    expect(second.log).toEqual(['say sign: The chest is empty.']);
    expect(second.state.inventory).toEqual({ potion: 2 });
  });

  test('cover vars, items, gold and the party', async () => {
    const { state } = await run(
      defineEvent((ev) => {
        ev.setVar('test.visits', ev.var('test.visits') + 3);
        ev.giveItem('ether');
        ev.giveItem('potion', 3);
        ev.takeItem('potion');
        ev.giveGold(50);
        ev.takeGold(20);
        ev.joinParty('bram');
        expect(ev.hasItem('potion', 2)).toBe(true);
        expect(ev.hasItem('potion', 3)).toBe(false);
        expect(ev.gold()).toBe(30);
        return Promise.resolve();
      }),
    );
    expect(state).toMatchObject({
      vars: { 'test.visits': 3 },
      inventory: { ether: 1, potion: 2 },
      gold: 30,
      party: ['rowan', 'bram'],
      members: { bram: { level: 1, exp: 0, equipment: { weapon: 'hand-axe' } } },
    });
  });

  test('heal everyone in the party back to their most HP and MP, KO’d or not', async () => {
    const hurt = setVitals(START, 'rowan', { hp: 0, mp: 3 }, { hp: 50, mp: 10 });
    const rest = defineEvent((ev) => {
      ev.heal();
      return Promise.resolve();
    });
    expect((await run(rest, hurt)).state.members.rowan).toEqual({
      level: 1,
      exp: 0,
      equipment: {},
    });
    expect((await run(rest)).state).toBe(START);
  });

  test('turn down what the game state does, which fails the script', async () => {
    const greedy = defineEvent((ev) => {
      ev.takeItem('potion');
      return Promise.resolve();
    });
    await expect(run(greedy)).rejects.toThrow('the party has 0');
    const misnamed = defineEvent((ev) => {
      ev.setFlag('beacon-out');
      return Promise.resolve();
    });
    await expect(run(misnamed)).rejects.toThrow(RangeError);
  });
});

describe('the on-screen verbs', () => {
  test('go to the stage in order, and a choice answers with what was picked', async () => {
    const scene = defineEvent(async (ev) => {
      await ev.fadeOut();
      ev.bgm(null);
      await ev.teleport('saltmere', 'tamsin');
      ev.bgm('bgm.sad');
      await ev.fadeIn(500);
      ev.sfx('sfx.door');
      await ev.move('tamsin', ['left', 'up']);
      await ev.face('tamsin', 'player');
      await ev.wait(250);
      await ev.say('tamsin', 'Well?');
      const pick = await ev.choice(['Yes', 'No']);
      await ev.say('tamsin', pick === 1 ? 'Suit yourself.' : 'Good.');
    });
    const { log } = await run(scene, START, [1]);
    expect(log).toEqual([
      'fadeOut default',
      'bgm off',
      'teleport saltmere tamsin',
      'bgm bgm.sad',
      'fadeIn 500',
      'sfx sfx.door',
      'move tamsin left up',
      'face tamsin player',
      'wait 250',
      'say tamsin: Well?',
      'choice Yes / No',
      'say tamsin: Suit yourself.',
    ]);
  });

  test('hold the script until they finish', async () => {
    let finishSaying = (): void => undefined;
    const { stage } = fakeStage();
    stage.say = () => new Promise((resolve) => (finishSaying = resolve));
    let state: GameState = START;
    const ev = createScriptContext(stage, { get: () => state, set: (next) => (state = next) }, DB);
    const running = (async () => {
      await ev.say('tamsin', 'Hold on.');
      ev.setFlag('story.held');
    })();
    await Promise.resolve();
    expect(state.flags).toEqual({});
    finishSaying();
    await running;
    expect(state.flags).toEqual({ 'story.held': true });
  });
});
