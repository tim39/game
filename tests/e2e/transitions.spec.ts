import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));

/** One step: the press, a couple of frames for the game to read it, then the step itself. */
async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

async function warp(page: Page, map: string, x: number, y: number): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(([id, x, y]) => window.__game?.warp(id, x, y), [map, x, y] as const);
  await arrivedOn(page, map);
}

test('a door leads into the house, fading through black, and back out', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  // Just below the house's door, on the test shore.
  await warp(page, 'test-shore', 18, 4);
  await page.screenshot({ path: 'test-results/screenshots/transition-shore-house.png' });
  await page.keyboard.press('ArrowUp');
  await nextFrames(page);
  // Stepping into the doorway starts the fade at once.
  expect(await field(page)).toMatchObject({ map: 'test-shore', x: 18, y: 3, leaving: true });
  expect((await field(page))?.fading).toBe(true);

  await arrivedOn(page, 'test-house');
  expect(await field(page)).toMatchObject({ x: 4, y: 5, facing: 'up', leaving: false });
  await page.screenshot({ path: 'test-results/screenshots/transition-house.png' });

  // Back out through the door at the bottom of the room.
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'test-shore');
  expect(await field(page)).toMatchObject({ x: 18, y: 4, facing: 'down' });
  expect(errors).toEqual([]);
});

test('stairs lead down to the cellar and back up', async ({ page }) => {
  await warp(page, 'test-house', 7, 3);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-cellar');
  expect(await field(page)).toMatchObject({ x: 2, y: 2, facing: 'down' });
  await page.screenshot({ path: 'test-results/screenshots/transition-cellar.png' });

  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-house');
  expect(await field(page)).toMatchObject({ x: 7, y: 3, facing: 'down' });
});

test('walking off the east edge leads to the meadow, and off its west edge back', async ({
  page,
}) => {
  await warp(page, 'test-shore', 39, 14);
  // The path runs off the edge; other edges are walls.
  expect((await field(page))?.blocked).toMatchObject({ right: false });

  await page.keyboard.press('ArrowRight');
  await arrivedOn(page, 'test-meadow');
  expect(await field(page)).toMatchObject({ x: 2, y: 7, facing: 'right' });
  await page.screenshot({ path: 'test-results/screenshots/transition-meadow.png' });

  // Back the way we came: three steps west and off the edge.
  for (let step = 0; step < 3; step++) await tapKey(page, 'ArrowLeft');
  await arrivedOn(page, 'test-shore');
  expect(await field(page)).toMatchObject({ x: 37, y: 14, facing: 'left', underOverhead: false });
});
