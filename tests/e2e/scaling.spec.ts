import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';

interface Case {
  readonly name: string;
  readonly view: readonly [number, number];
  readonly canvas: readonly [number, number];
}

// Expected on-screen canvas size for each view: whole-number scales of 640×360 where they fit.
const CASES: readonly Case[] = [
  { name: '720p', view: [1280, 720], canvas: [1280, 720] },
  { name: '1080p', view: [1920, 1080], canvas: [1920, 1080] },
  { name: 'laptop', view: [1366, 768], canvas: [1280, 720] },
  { name: 'phone-landscape', view: [844, 390], canvas: [640, 360] },
  { name: 'phone-portrait', view: [390, 844], canvas: [390, 219.375] },
];

/** Opens the title screen, once it has faded in. */
async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.waitForFunction(() => window.__game?.inspect('title')?.fading === false);
}

async function expectCanvasCentered(page: Page, view: Case['view'], canvas: Case['canvas']) {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('the game canvas is not on screen');
  expect(box.width).toBeCloseTo(canvas[0], 0);
  expect(box.height).toBeCloseTo(canvas[1], 0);
  expect(box.x).toBeCloseTo((view[0] - canvas[0]) / 2, 0);
  expect(box.y).toBeCloseTo((view[1] - canvas[1]) / 2, 0);
}

for (const { name, view, canvas } of CASES) {
  test(`fits a ${view[0]}×${view[1]} view (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: view[0], height: view[1] });
    await openTitle(page);
    await expectCanvasCentered(page, view, canvas);
    await page.screenshot({ path: `test-results/screenshots/title-${name}.png` });
  });
}

test('refits when its space changes size, even without a window resize', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openTitle(page);
  await expectCanvasCentered(page, [844, 390], [640, 360]);

  // As when a phone's browser toolbar comes in, which doesn't always resize the window.
  await page.evaluate(() => document.getElementById('game')?.style.setProperty('height', '300px'));
  await expect
    .poll(async () => (await page.locator('#game canvas').boundingBox())?.height)
    .toBeCloseTo(300, 0);
  const width = (300 * 640) / 360;
  await expectCanvasCentered(page, [844, 300], [width, 300]);
});

test('rescales when the window changes size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTitle(page);
  await expectCanvasCentered(page, [1280, 720], [1280, 720]);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect
    .poll(async () => (await page.locator('#game canvas').boundingBox())?.width)
    .toBeCloseTo(1920, 0);
  await expectCanvasCentered(page, [1920, 1080], [1920, 1080]);
});
