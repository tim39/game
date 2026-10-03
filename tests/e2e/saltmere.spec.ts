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

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
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

/** Presses Confirm, and waits for the dialogue box to show something. */
async function talk(page: Page): Promise<Record<string, unknown> | undefined> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('dialogue') ?? false);
  return page.evaluate(() => window.__game?.inspect('dialogue'));
}

/** Confirm finishes typing the line, and Confirm again goes on. */
async function readOn(page: Page): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await page.keyboard.press('KeyZ');
}

/** Reads the last line, and waits for the field to carry on. */
async function closeDialogue(page: Page): Promise<void> {
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

test('a new game starts in Saltmere, at Tamsin’s door', async ({ page }) => {
  const { map, x, y, facing } = NEW_GAME.location;
  expect(map).toBe('saltmere');
  await warp(page, map, x, y, facing);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-start.png' });
});

test('into Tamsin’s house to talk to her, and back out', async ({ page }) => {
  const errors = watchErrors(page);
  await warp(page, 'saltmere', 7, 6, 'up');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await field(page)).toMatchObject({ x: 5, y: 6, facing: 'up' });

  // Tamsin stands by the oven, at (8, 3).
  await step(page, 'ArrowRight', 3);
  await step(page, 'ArrowUp', 2);
  expect(await field(page)).toMatchObject({ x: 8, y: 4, facing: 'up' });
  expect(await talk(page)).toMatchObject({ name: 'Tamsin' });
  // She asks for an answer, which she answers in turn.
  await readOn(page);
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 2,
  );
  await page.screenshot({ path: 'test-results/screenshots/saltmere-tamsin.png' });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() =>
    String(window.__game?.inspect('dialogue')?.text).startsWith("That's my lamplighter."),
  );
  await closeDialogue(page);

  await step(page, 'ArrowDown', 2);
  await step(page, 'ArrowLeft', 3);
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 7, y: 6, facing: 'down' });
  expect(errors).toEqual([]);
});

test('into the fisher’s cottage and back out', async ({ page }) => {
  await warp(page, 'saltmere', 28, 6, 'up');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-cottage');
  expect(await field(page)).toMatchObject({ x: 4, y: 5, facing: 'up' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-cottage.png' });
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 28, y: 6, facing: 'down' });
});

test('up the lighthouse to the Beacon, past the shut way down to the caves', async ({ page }) => {
  const errors = watchErrors(page);
  await warp(page, 'saltmere', 40, 21, 'up');
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lighthouse-outside.png' });
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse');
  expect(await field(page)).toMatchObject({ x: 4, y: 4, facing: 'up' });

  // The stairs down are roped off: they block the way, and say so.
  await step(page, 'ArrowLeft', 2);
  await step(page, 'ArrowUp', 2);
  expect(await field(page)).toMatchObject({ x: 2, y: 2, facing: 'up', blocked: { up: true } });
  expect(await talk(page)).toMatchObject({ name: '' });
  await closeDialogue(page);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lighthouse.png' });

  // The stairs up, at (6, 1), lead to the lamp room.
  await step(page, 'ArrowRight', 4);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse-top');
  expect(await field(page)).toMatchObject({ x: 1, y: 2, facing: 'right' });

  // The Beacon burns at (3, 2).
  await step(page, 'ArrowRight');
  expect(await talk(page)).toMatchObject({ name: '' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lamp-room.png' });
  await closeDialogue(page);

  await step(page, 'ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse');
  expect(await field(page)).toMatchObject({ x: 6, y: 2, facing: 'down' });
  expect(errors).toEqual([]);
});

test('Saltmere’s villagers can be talked to', async ({ page }) => {
  const errors = watchErrors(page);
  // The fisher stands at the end of the dock, at (16, 24); the vendor behind the baskets.
  await warp(page, 'saltmere', 16, 23, 'down');
  expect(await talk(page)).toMatchObject({ name: 'Villager' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-dock.png' });
  await closeDialogue(page);

  await page.evaluate(() => window.__game?.warp('saltmere', 12, 7, 'down'));
  await arrivedOn(page, 'saltmere');
  expect(await talk(page)).toMatchObject({ name: 'Villager' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-square.png' });
  await closeDialogue(page);
  expect(errors).toEqual([]);
});
