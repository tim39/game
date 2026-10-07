import { expect, test } from '@playwright/test';
import type {} from '../../src/debug/api';

test('the game boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();

  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  expect(await page.evaluate(() => window.__game?.activeScenes())).toEqual(['title']);
  // Over its picture: Saltmere's lighthouse at night.
  expect(await page.evaluate(() => window.__game?.inspect('title'))).toMatchObject({
    picture: 'title',
    selected: 'New Game',
  });

  // It fades in.
  await page.waitForFunction(() => window.__game?.inspect('title')?.fading === false);
  await page.screenshot({ path: 'test-results/screenshots/title.png' });
  expect(errors).toEqual([]);
});
