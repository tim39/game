import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';

interface FakePad {
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  axes: number[];
}
type WindowWithPad = Window & { __fakePad: FakePad };

async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const title = (page: Page) => page.evaluate(() => window.__game?.inspect('title'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
}

test('the keyboard moves the title cursor, wraps around, and confirms', async ({ page }) => {
  await openTitle(page);
  expect((await title(page))?.selected).toBe('New Game');

  await tapKey(page, 'ArrowDown');
  expect((await title(page))?.selected).toBe('Continue');
  await tapKey(page, 'KeyS'); // WASD works too
  expect((await title(page))?.selected).toBe('Options');
  await tapKey(page, 'ArrowDown');
  expect((await title(page))?.selected).toBe('New Game');
  await tapKey(page, 'ArrowUp');
  expect((await title(page))?.selected).toBe('Options');

  // Disabled items ignore Confirm; New Game responds.
  await tapKey(page, 'Enter');
  expect(await activeScenes(page)).toEqual(['title']);
  await tapKey(page, 'ArrowDown');
  await tapKey(page, 'KeyZ');
  expect(await activeScenes(page)).toContain('dialogue-sample');
});

test('holding a direction repeats, and letting go stops it', async ({ page }) => {
  await openTitle(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(700); // the press, then a repeat at 300 ms and every 80 ms after
  await page.keyboard.up('ArrowDown');
  await nextFrames(page);
  const moves = Number((await title(page))?.cursorMoves);
  expect(moves).toBeGreaterThanOrEqual(3);

  await page.waitForTimeout(300);
  expect(Number((await title(page))?.cursorMoves)).toBe(moves);
});

test('a gamepad moves the title cursor and confirms', async ({ page }) => {
  // Headless browsers have no gamepads, so stand in a fake "standard" one the test controls.
  await page.addInitScript(() => {
    const pad = {
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
      mapping: 'standard',
      connected: true,
      id: 'Test pad',
      index: 0,
      timestamp: 0,
    };
    (window as unknown as WindowWithPad).__fakePad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await openTitle(page);

  const setButton = (index: number, pressed: boolean) =>
    page.evaluate(
      ([i, p]) => {
        const button = (window as unknown as WindowWithPad).__fakePad.buttons[i as number];
        if (button) button.pressed = p as boolean;
      },
      [index, pressed],
    );
  const setStickY = (y: number) =>
    page.evaluate((value) => {
      (window as unknown as WindowWithPad).__fakePad.axes[1] = value;
    }, y);

  // Each input is held for a couple of frames, well short of the 300 ms auto-repeat.
  await setButton(13, true); // d-pad down
  await nextFrames(page);
  await setButton(13, false);
  await nextFrames(page);
  expect((await title(page))?.selected).toBe('Continue');

  await setStickY(-1); // left stick up
  await nextFrames(page);
  await setStickY(0);
  await nextFrames(page);
  expect((await title(page))?.selected).toBe('New Game');

  await setButton(0, true); // bottom face button
  await nextFrames(page);
  await setButton(0, false);
  await nextFrames(page);
  expect(await activeScenes(page)).toContain('dialogue-sample');
});
