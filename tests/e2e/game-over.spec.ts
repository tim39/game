import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';
import type { AudioInfo } from '../../src/systems/audio';

// Battles take a while to play out, even at 4×, more so with other tests running beside them, and
// these lose one before fighting it again.
test.describe.configure({ timeout: 90_000 });

interface BattleInfo {
  outcome: string;
  turn: number;
  active: string | null;
  choosing: boolean;
  waiting: boolean;
  banner: string | null;
  timeline: { id: string; telegraph: boolean; changed: boolean }[];
  status: string[];
}

interface GameOverInfo {
  ready: boolean;
  selected: string;
  items: { label: string; enabled: boolean }[];
  hint: string;
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const battle = async (page: Page): Promise<BattleInfo> =>
  (await page.evaluate(() => window.__game?.inspect('battle'))) as unknown as BattleInfo;
const gameOver = async (page: Page): Promise<GameOverInfo> =>
  (await page.evaluate(() => window.__game?.inspect('game-over'))) as unknown as GameOverInfo;
const audio = async (page: Page): Promise<AudioInfo> =>
  (await page.evaluate(() => window.__game?.audio())) as AudioInfo;
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await nextFrames(page);
  }
}

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Opens the game at the title, with battles at the debug menu's 4× speed. */
async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => window.__game?.battleSpeed(4));
}

/** Waits until the field alone is running on `map`, with the fade in over and the player still. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    const scenes = window.__game?.activeScenes() ?? [];
    return scenes.join() === 'field' && info?.map === id && info.fading === false && !info.moving;
  }, map);
}

async function warp(page: Page, [map, x, y, facing]: [string, number, number, Direction]) {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Waits until the battle waits for the player: to choose, or to see how it ended. */
async function waitForPlayer(page: Page): Promise<BattleInfo> {
  await page.waitForFunction(
    () => {
      const info = window.__game?.inspect('battle');
      return info?.choosing === true || info?.waiting === true;
    },
    undefined,
    { timeout: 60_000 },
  );
  return battle(page);
}

/** Takes the same command every turn (the keys that pick it, then Confirm) until it's over. */
async function fightUntilOver(page: Page, ...command: string[]): Promise<BattleInfo> {
  for (let turn = 0; turn < 100; turn++) {
    const info = await waitForPlayer(page);
    if (info.waiting) return info;
    await press(page, ...command, 'KeyZ');
  }
  throw new Error('The battle went on too long');
}

/** From Attack, round to Guard, at the bottom of the command window. */
const GUARD = 'ArrowUp';
/** The first item in the list, at whoever it starts aimed at. */
const FIRST_ITEM = ['ArrowDown', 'ArrowDown', 'KeyZ', 'KeyZ', 'KeyZ'];

/** Says how a battle lost ends, and waits for the Game Over screen to fade in and take a choice. */
async function toGameOver(page: Page): Promise<GameOverInfo> {
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('game-over')?.ready === true);
  return gameOver(page);
}

/** Moves the Game Over screen's cursor to a choice, by its label, and presses Confirm. */
async function choose(page: Page, label: string): Promise<void> {
  const { items, selected } = await gameOver(page);
  const from = items.findIndex((item) => item.label === selected);
  const to = items.findIndex((item) => item.label === label);
  expect(to, `${label} is on the Game Over screen`).toBeGreaterThanOrEqual(0);
  for (let move = 0; move < (to - from + items.length) % items.length; move++) {
    await press(page, 'ArrowDown');
  }
  expect((await gameOver(page)).selected).toBe(label);
  await press(page, 'KeyZ');
}

test('a battle lost ends in the Game Over screen, and Retry battle fights it again from the start', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Rowan, worn down, against a Wolf, with the first move and a Fire Bomb that would win it.
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 4 });
    window.__game?.give('fire-bomb');
    window.__game?.battle(['wolf'], { seed: 1, start: 'preemptive' });
  });
  const first = await waitForPlayer(page);

  // Guarding every turn, Rowan falls. The battle's music gives way to the Game Over jingle.
  const lost = await fightUntilOver(page, GUARD);
  expect(lost).toMatchObject({ outcome: 'defeat', banner: 'The party has fallen...' });
  const jingle = await audio(page);
  expect(jingle).toMatchObject({ music: null, playing: ['sfx.game-over'] });
  expect(jingle.sounds.at(-1)).toBe('sfx.game-over');
  // Once the timeline's last turns have faded away.
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/game-over-fallen.png' });

  // Nothing's saved yet, so Load save can't be chosen. The cursor starts on Retry battle.
  const screen = await toGameOver(page);
  expect(await activeScenes(page)).toEqual(['game-over']);
  expect(screen).toEqual({
    ready: true,
    selected: 'Retry battle',
    items: [
      { label: 'Retry battle', enabled: true },
      { label: 'Load save', enabled: false },
      { label: 'Title', enabled: true },
    ],
    hint: 'Z or Enter to choose',
  });
  await page.screenshot({ path: 'test-results/screenshots/game-over.png' });
  // Load save, greyed out, does nothing.
  await press(page, 'ArrowDown', 'KeyZ');
  expect(await gameOver(page)).toMatchObject({ selected: 'Load save', ready: true });
  await press(page, 'ArrowUp');

  // The same battle, from its first turn: Rowan as they went in, Fire Bomb and all, and the music.
  await press(page, 'KeyZ');
  const again = await waitForPlayer(page);
  expect(await activeScenes(page)).toEqual(['battle']);
  expect(again).toMatchObject({
    outcome: 'ongoing',
    turn: first.turn,
    active: 'rowan',
    timeline: first.timeline,
    status: ['Rowan HP 4/60 MP 12'],
  });
  expect(await audio(page)).toMatchObject({ music: 'bgm.battle', playing: [] });

  // This time, the Fire Bomb.
  await press(page, ...FIRST_ITEM);
  expect(await waitForPlayer(page)).toMatchObject({ outcome: 'victory', waiting: true });
  // Through the victory panel, to the field.
  for (let shown = 0; shown < 5 && (await activeScenes(page))?.join() !== 'field'; shown++) {
    await press(page, 'KeyZ');
  }
  await arrivedOn(page, 'saltmere');
  const after = await state(page);
  expect(after.members.rowan).toMatchObject({ exp: 6, hp: 4 });
  expect(after.inventory).not.toHaveProperty('fire-bomb');
  expect(errors).toEqual([]);
});

test('Load save carries on from a save, and Cancel there goes back to the Game Over', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Saved in Slot 1, by Tamsin's door.
  await warp(page, ['saltmere', 7, 6, 'down']);
  await press(page, 'KeyC');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  await press(page, 'KeyZ', 'KeyX');
  await arrivedOn(page, 'saltmere');

  // Then a fight with two Wolves and 1 HP, which doesn't go well.
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 1 });
    window.__game?.battle(['wolf', 'wolf'], { seed: 1 });
  });
  await fightUntilOver(page, GUARD);
  expect((await toGameOver(page)).items[1]).toEqual({ label: 'Load save', enabled: true });

  // The save menu opens over it, on the latest save; Cancel goes back, still on Load save.
  await choose(page, 'Load save');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  expect(await page.evaluate(() => window.__game?.inspect('save-menu'))).toMatchObject({
    mode: 'load',
    selected: 'Slot 1',
  });
  await press(page, 'KeyX');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'game-over');
  expect(await gameOver(page)).toMatchObject({ selected: 'Load save', ready: true });

  // Loaded: back by Tamsin's door, with Rowan as they were then, and the village's music.
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  await press(page, 'KeyZ');
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 7, y: 6, facing: 'down' });
  expect((await state(page)).members.rowan).not.toHaveProperty('hp');
  await page.waitForFunction(() => window.__game?.audio().music === 'bgm.saltmere');
  expect((await audio(page)).paused).toEqual([]);
  expect(errors).toEqual([]);
});

test('a random battle lost and fought again hands the field back where it was, music and all', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Cancel on the title screen lets the music play, as a player's first key press would.
  await press(page, 'KeyX');
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 20 });
    window.__game?.give('smoke-pellet');
  });
  await warp(page, ['north-road', 11, 15, 'up']);
  // The next step brings the pair of Wolves this seed has waiting.
  await page.evaluate(() => window.__game?.encounters({ seed: 1, countdown: 1, rate: 'normal' }));
  await press(page, 'ArrowUp');
  await page.waitForFunction(() => window.__game?.inspect('field')?.encountering === true);
  const first = await waitForPlayer(page);

  // Rowan, guarding every turn, falls; the field sleeps on under the Game Over, its music paused.
  await fightUntilOver(page, GUARD);
  await toGameOver(page);
  expect(await audio(page)).toMatchObject({ music: null, paused: ['bgm.saltmere'] });

  // Fought again from the start, and this time Rowan gets away.
  await choose(page, 'Retry battle');
  const again = await waitForPlayer(page);
  expect(again).toMatchObject({ turn: first.turn, timeline: first.timeline, status: first.status });
  expect(await audio(page)).toMatchObject({ music: 'bgm.battle', paused: ['bgm.saltmere'] });
  await press(page, ...FIRST_ITEM);
  await arrivedOn(page, 'north-road');
  expect(await field(page)).toMatchObject({ x: 11, y: 14, encountering: false });
  await page.waitForFunction(() => window.__game?.audio().music === 'bgm.saltmere');
  expect((await audio(page)).paused).toEqual([]);
  expect((await state(page)).inventory).not.toHaveProperty('smoke-pellet');
  expect(errors).toEqual([]);
});
