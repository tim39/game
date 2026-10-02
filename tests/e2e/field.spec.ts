import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';

/** Lets the game run a couple of frames, so input has been read and the screen redrawn. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

async function tapKey(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await nextFrames(page);
  }
}

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));

async function warp(page: Page, x: number, y: number): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(([x, y]) => window.__game?.warp('test-shore', x, y), [x, y] as const);
  await page.waitForFunction(() => window.__game?.activeScenes().includes('field') ?? false);
  await nextFrames(page);
}

test('the player walks behind a treetop, but not through trunks or water', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await warp(page, 5, 6);
  expect(await field(page)).toMatchObject({ map: 'test-shore', x: 5, y: 6, underOverhead: false });
  await page.screenshot({ path: 'test-results/screenshots/field-test-shore.png' });

  // (6, 6) is under the canopy of the tree standing on (6, 7) and (7, 7).
  await tapKey(page, 'ArrowRight');
  expect(await field(page)).toMatchObject({ x: 6, y: 6, underOverhead: true });
  await page.screenshot({ path: 'test-results/screenshots/field-behind-tree.png' });

  // Its trunk blocks the way down; turning to face it still counts.
  await tapKey(page, 'ArrowDown');
  expect(await field(page)).toMatchObject({ x: 6, y: 6, facing: 'down', underOverhead: true });

  // Out from under the tree, along to the pond, and no further.
  await tapKey(page, 'ArrowRight', 2);
  expect(await field(page)).toMatchObject({ x: 8, y: 6, underOverhead: false });
  await tapKey(page, 'ArrowRight', 5);
  expect(await field(page)).toMatchObject({ x: 12, y: 6, facing: 'right' });
  expect((await field(page))?.blocked).toMatchObject({ right: true, left: false });

  expect(errors).toEqual([]);
});

test('holding a direction keeps walking', async ({ page }) => {
  await warp(page, 12, 6);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(600); // a step straight away, then one every 180 ms
  await page.keyboard.up('ArrowLeft');
  await nextFrames(page);
  expect(Number((await field(page))?.x)).toBeLessThanOrEqual(9);
});
