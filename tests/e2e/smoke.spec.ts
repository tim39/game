import { expect, test } from '@playwright/test';

test('the game boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();

  // Give the first scene a couple of frames to draw before the screenshot.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.screenshot({ path: 'test-results/screenshots/boot.png' });

  expect(errors).toEqual([]);
});
