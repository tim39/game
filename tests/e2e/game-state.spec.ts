import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { NEW_GAME } from '../../src/data/new-game';

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const state = async (page: Page) => {
  const current = await page.evaluate(() => window.__game?.state());
  if (!current) throw new Error('No game state: is window.__game installed?');
  return current;
};

const location = async (page: Page) => (await state(page)).location;

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await toTitle(page);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Steps one cell (or turns, if the way is blocked) and waits for the step to end. */
async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await nextFrames(page);
    await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  }
}

test('New Game starts afresh: Rowan alone, in bed at Tamsin’s, in their starting gear', async ({
  page,
}) => {
  await toTitle(page);
  // Something from before, which New Game should throw away.
  await page.evaluate(() => {
    window.__game?.setFlag('story.beacon-out');
    window.__game?.give('potion');
  });
  expect(await state(page)).toMatchObject({
    flags: { 'story.beacon-out': true },
    inventory: { potion: 1 },
  });

  await page.keyboard.press('Enter');
  // The opening's first line, over black (kindling-day.spec plays the rest of it).
  await page.waitForFunction(() => {
    const dialogue = window.__game?.inspect('dialogue');
    return (
      String(dialogue?.text).startsWith('Saltmere: a fishing village') && dialogue?.prompt === true
    );
  });
  const { map, x, y, facing } = NEW_GAME.location;
  expect(await page.evaluate(() => window.__game?.inspect('field'))).toMatchObject({
    map,
    x,
    y,
    facing,
    dark: true,
    running: true,
  });

  const { playTimeMs, ...rest } = await state(page);
  expect(rest).toEqual({
    party: ['rowan'],
    members: {
      rowan: { level: 1, exp: 0, equipment: { weapon: 'bronze-sword', armor: 'travel-clothes' } },
    },
    inventory: {},
    gold: 0,
    flags: {},
    vars: {},
    knownReactions: {},
    location: NEW_GAME.location,
  });
  expect(playTimeMs).toBeGreaterThan(0);
});

test('the game state follows the player, step by step and from map to map', async ({ page }) => {
  await warp(page, 'saltmere', 7, 6, 'up');
  // Past the opening, which Tamsin's house plays until Rowan is on lamp duty.
  await page.evaluate(() => window.__game?.setFlag('story.lamp-duty'));
  expect(await location(page)).toEqual({ map: 'saltmere', x: 7, y: 6, facing: 'up' });

  // In at Tamsin's door, and along the back of the house.
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await location(page)).toEqual({ map: 'saltmere-tamsin', x: 5, y: 6, facing: 'up' });
  await step(page, 'ArrowRight', 3);
  expect(await location(page)).toEqual({ map: 'saltmere-tamsin', x: 8, y: 6, facing: 'right' });

  // The wall is in the way, so the player only turns.
  await step(page, 'ArrowDown');
  expect(await location(page)).toEqual({ map: 'saltmere-tamsin', x: 8, y: 6, facing: 'down' });

  await step(page, 'ArrowLeft', 3);
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'saltmere');
  expect(await location(page)).toEqual({ map: 'saltmere', x: 7, y: 6, facing: 'down' });
});

test('the game state follows the player off the edge of a map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await warp(page, 'test-meadow', 2, 7, 'left');
  await step(page, 'ArrowLeft', 2);
  expect(await location(page)).toEqual({ map: 'test-meadow', x: 0, y: 7, facing: 'left' });

  // The step off the edge is off the map, but the player arrives on the shore.
  await page.keyboard.press('ArrowLeft');
  await arrivedOn(page, 'test-shore');
  expect(await location(page)).toEqual({ map: 'test-shore', x: 37, y: 14, facing: 'left' });
  expect(errors).toEqual([]);
});

test('play time counts while the field runs, but not on the title screen', async ({ page }) => {
  await toTitle(page);
  await nextFrames(page);
  expect((await state(page)).playTimeMs).toBe(0);

  await warp(page, 'saltmere', 7, 6, 'down');
  // Over 30 frames, play time keeps up with the clock, give or take a frame. (Headless browsers
  // aren't focused, so Phaser's own delta would fall behind here, at under 60 frames a second.)
  const { played, elapsed } = await page.evaluate(async () => {
    const playTime = () => window.__game?.state().playTimeMs ?? 0;
    const [startMs, startPlay] = [performance.now(), playTime()];
    for (let i = 0; i < 30; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { played: playTime() - startPlay, elapsed: performance.now() - startMs };
  });
  expect(played).toBeGreaterThan(elapsed * 0.75);
  expect(played).toBeLessThan(elapsed + 100);
});

test('debug hooks set flags and give items, and turn down bad IDs', async ({ page }) => {
  await toTitle(page);
  await page.evaluate(() => {
    window.__game?.setFlag('story.beacon-out');
    window.__game?.setFlag('chest.saltmere-01');
    window.__game?.setFlag('chest.saltmere-01', false);
    window.__game?.give('potion', 3);
    window.__game?.give('potion');
  });
  expect(await state(page)).toMatchObject({
    flags: { 'story.beacon-out': true },
    inventory: { potion: 4 },
  });
  expect(Object.keys((await state(page)).flags)).toEqual(['story.beacon-out']);

  await expect(page.evaluate(() => window.__game?.give('Hi Potion'))).rejects.toThrow(
    "isn't kebab-case",
  );
  await expect(page.evaluate(() => window.__game?.setFlag('beacon-out'))).rejects.toThrow(
    'namespaced',
  );
});
