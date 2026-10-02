import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';
import { FIELD_SPEEDS } from '../../src/data/balance';

interface FieldInfo {
  map: string;
  x: number;
  y: number;
  facing: string;
  moving: boolean;
  stepMs: number | null;
  frame: number;
  pixel: { x: number; y: number };
  view: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  blocked: Record<string, boolean>;
  underOverhead: boolean;
}

/** Lets the game run a couple of frames, so input has been read and the screen redrawn. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = async (page: Page): Promise<FieldInfo> =>
  (await page.evaluate(() => window.__game?.inspect('field'))) as unknown as FieldInfo;

/** Waits for the player to finish stepping, then for the camera to catch up. */
async function waitUntilStill(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  await nextFrames(page);
}

async function tapKey(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await nextFrames(page);
    await waitUntilStill(page);
  }
}

async function warp(page: Page, x: number, y: number): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(([x, y]) => window.__game?.warp('test-shore', x, y), [x, y] as const);
  await page.waitForFunction(() => window.__game?.activeScenes().includes('field') ?? false);
  // Every arrival fades in from black.
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
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

  // Its trunk blocks the way down; the player turns to face it.
  await tapKey(page, 'ArrowDown');
  expect(await field(page)).toMatchObject({ x: 6, y: 6, facing: 'down', underOverhead: true });

  // Out from under the tree, along to the pond, and no further.
  await tapKey(page, 'ArrowRight', 2);
  expect(await field(page)).toMatchObject({ x: 8, y: 6, underOverhead: false });
  await tapKey(page, 'ArrowRight', 5);
  expect(await field(page)).toMatchObject({ x: 12, y: 6, facing: 'right' });
  expect((await field(page)).blocked).toMatchObject({ right: true, left: false });

  expect(errors).toEqual([]);
});

test('a step slides between tiles, animating, and ends exactly on the next one', async ({
  page,
}) => {
  await warp(page, 4, 15);
  await page.keyboard.down('ArrowRight');
  await nextFrames(page);
  const during = await field(page);
  await page.keyboard.up('ArrowRight');
  // The step claims its cell at once, and the sprite is on its way there, in a stride.
  expect(during).toMatchObject({ x: 5, moving: true, facing: 'right' });
  expect(during.pixel.x).toBeGreaterThan(4 * 16);
  expect(during.pixel.x).toBeLessThan(5 * 16);
  expect(during.frame).not.toBe(3);

  await waitUntilStill(page);
  // Standing again: on the tile, feet together (row 0, the right-facing column).
  expect(await field(page)).toMatchObject({ x: 5, pixel: { x: 5 * 16, y: 15 * 16 }, frame: 3 });
});

test('a second tap during a step still counts', async ({ page }) => {
  await warp(page, 4, 15);
  await page.keyboard.press('ArrowRight');
  await nextFrames(page);
  await page.keyboard.press('ArrowRight');
  await waitUntilStill(page);
  await waitUntilStill(page);
  expect((await field(page)).x).toBe(6);
});

test('holding Run takes steps twice as fast', async ({ page }) => {
  // Reads each step's length from the game, so a slow machine can't make this flaky.
  const stepWhileHolding = async (keys: string[]): Promise<number> => {
    for (const key of keys) await page.keyboard.down(key);
    await nextFrames(page);
    const { stepMs } = await field(page);
    for (const key of keys) await page.keyboard.up(key);
    await waitUntilStill(page);
    return stepMs ?? 0;
  };
  await warp(page, 4, 15);
  expect(await stepWhileHolding(['ArrowRight'])).toBe(FIELD_SPEEDS.walkMs);
  expect(await stepWhileHolding(['ShiftLeft', 'ArrowRight'])).toBe(FIELD_SPEEDS.runMs);
  expect(FIELD_SPEEDS.runMs).toBeLessThan(FIELD_SPEEDS.walkMs);
});

test('the camera follows the player, but never past the map’s edges', async ({ page }) => {
  // Near the top-left corner, the view stops at the edges.
  await warp(page, 3, 2);
  let info = await field(page);
  expect(info.size).toEqual({ width: 640, height: 384 });
  expect(info.view).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });

  // Out in the open, the player is in the middle of the view.
  await warp(page, 20, 15);
  info = await field(page);
  expect(info.view.x + info.view.width / 2).toBe(info.pixel.x + 8);
  expect(info.view.y + info.view.height / 2).toBe(info.pixel.y + 8);
  await page.screenshot({ path: 'test-results/screenshots/field-camera.png' });

  // Walking towards the bottom-right corner, the view stops at the edges.
  await warp(page, 36, 22);
  info = await field(page);
  expect(info.view.x + info.view.width).toBe(640);
  expect(info.view.y + info.view.height).toBe(384);
});
