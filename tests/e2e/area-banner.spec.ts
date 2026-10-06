import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { AREA_BANNER_MS } from '../../src/data/balance';

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const banner = (page: Page) => page.evaluate(() => window.__game?.inspect('field')?.banner);

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

/** One step: the press, a couple of frames for the game to read it, then the step itself. */
async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
}

/** Puts the player on `map` at (x, y), from the title screen or wherever they are. */
async function warp(page: Page, map: string, x: number, y: number, facing: Direction = 'down') {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** The banner fades in, stays and fades out over this long. */
const SHOWN_MS = AREA_BANNER_MS.fadeIn + AREA_BANNER_MS.hold + AREA_BANNER_MS.fadeOut;

test('starting somewhere names its area, in a banner that fades away', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Just below the house's door, on the test shore.
  await warp(page, 'test-shore', 18, 4);
  expect(await banner(page)).toBe('Test Shore');
  // Faded all the way in.
  await page.waitForTimeout(AREA_BANNER_MS.fadeIn);
  await page.screenshot({ path: 'test-results/screenshots/area-banner.png' });
  await page.waitForFunction(() => window.__game?.inspect('field')?.banner === null, undefined, {
    timeout: SHOWN_MS + 2000,
  });

  // Inside the house, part of the shore, the area's name, not the house's.
  await warp(page, 'test-house', 4, 5);
  expect(await banner(page)).toBe('Test Shore');
  expect(errors).toEqual([]);
});

test('going between maps in one area shows nothing, and into another, its name', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'test-shore', 18, 4);
  // In through the door and down the stairs: the house and its cellar are part of the shore.
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-house');
  expect(await banner(page)).toBeNull();
  await warp(page, 'test-house', 7, 3);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-cellar');
  expect(await banner(page)).toBeNull();
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-house');
  expect(await banner(page)).toBeNull();

  // Off the shore's east edge, into the meadow, another area.
  await warp(page, 'test-shore', 39, 14);
  await page.keyboard.press('ArrowRight');
  await arrivedOn(page, 'test-meadow');
  expect(await banner(page)).toBe('Test Meadow');
  // And back, three steps west and off the edge: the shore's name again, having been away.
  for (let step = 0; step < 3; step++) await tapKey(page, 'ArrowLeft');
  await arrivedOn(page, 'test-shore');
  expect(await banner(page)).toBe('Test Shore');
  expect(errors).toEqual([]);
});

test('a battle cuts the banner short', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.battleSpeed(4));
  await warp(page, 'north-road', 11, 15, 'up');
  expect(await banner(page)).toBe('The North Road');
  // The next step brings a battle.
  await page.evaluate(() => window.__game?.encounters({ seed: 1, countdown: 1, rate: 'normal' }));
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__game?.inspect('field')?.encountering === true);
  await page.keyboard.up('ArrowUp');
  expect(await banner(page)).toBeNull();
  expect(errors).toEqual([]);
});

test.describe('on a phone held sideways', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 667, height: 375 } });

  test('the banner stays clear of the touch controls', async ({ page }) => {
    await toTitle(page);
    await warp(page, 'north-road', 11, 15, 'up');
    expect(await banner(page)).toBe('The North Road');
    await page.waitForTimeout(AREA_BANNER_MS.fadeIn);
    await page.screenshot({ path: 'test-results/screenshots/area-banner-phone.png' });
  });
});
