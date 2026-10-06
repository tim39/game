import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';

interface OptionsInfo {
  cursor: number;
  row: string;
  rows: string[];
  help: string[];
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const options = async (page: Page): Promise<OptionsInfo> =>
  (await page.evaluate(() => window.__game?.inspect('options'))) as unknown as OptionsInfo;
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await nextFrames(page);
  }
}

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function toTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** From the title screen, with the cursor on New Game, opens Options. */
async function openFromTitle(page: Page): Promise<void> {
  await press(page, 'ArrowUp', 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('options') ?? false);
}

const DEFAULTS = [
  'Text speed Normal',
  'Battle speed 1x',
  'Encounters Normal',
  'Always run Off',
  'Music 60%',
  'Sound 80%',
  'Screen shake On',
  'Reduce flashing Off',
];

test('Options opens from the title, and what it sets lasts after the page reloads', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await toTitle(page);
  await openFromTitle(page);
  const opened = await options(page);
  expect(opened).toMatchObject({
    row: 'textSpeed',
    help: ['How fast lines of dialogue type out.'],
  });
  expect(opened.rows).toEqual(DEFAULTS);
  await page.screenshot({ path: 'test-results/screenshots/options.png' });

  // Fast text, 2x battles, the music down a notch, and gentler flashes.
  await press(page, 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown');
  await press(page, 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'KeyZ');
  const changed = await options(page);
  expect(changed.rows).toEqual([
    'Text speed Fast',
    'Battle speed 2x',
    'Encounters Normal',
    'Always run Off',
    'Music 50%',
    'Sound 80%',
    'Screen shake On',
    'Reduce flashing On',
  ]);
  expect(changed.help).toEqual(['Fewer, gentler flashes in battle.']);
  // The music follows its volume at once.
  await page.waitForFunction(() =>
    (window.__game?.audio().tracks ?? []).every((track) => track.volume <= 0.5),
  );
  await page.screenshot({ path: 'test-results/screenshots/options-changed.png' });

  // Cancel goes back to the title, which carries on.
  await press(page, 'KeyX');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'title');
  expect(await page.evaluate(() => window.__game?.inspect('options'))).toEqual({});

  await page.reload();
  await toTitle(page);
  await openFromTitle(page);
  expect((await options(page)).rows).toEqual(changed.rows);
  expect(errors).toEqual([]);
});

test('Options opens from the main menu too, and Menu goes back to it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await toTitle(page);
  await page.evaluate(() => window.__game?.warp('saltmere', 7, 6, 'down'));
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.map === 'saltmere' && info.fading === false && !info.moving;
  });
  await press(page, 'KeyC');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('main-menu') ?? false);
  // Options is second from the bottom, above Save.
  await press(page, 'ArrowUp', 'ArrowUp', 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('options') ?? false);
  expect((await options(page)).rows).toEqual(DEFAULTS);
  // Always run, on.
  await press(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'KeyZ');
  expect((await options(page)).rows[3]).toBe('Always run On');
  await press(page, 'KeyC');
  await page.waitForFunction(() => window.__game?.inspect('main-menu')?.page !== undefined);
  expect(await activeScenes(page)).toEqual(['main-menu']);
  // Kept for next time, as Options closed.
  const kept = await page.evaluate(() => localStorage.getItem('fifth-flame:settings'));
  expect(JSON.parse(kept ?? '{}') as unknown).toMatchObject({ alwaysRun: true });
  expect(errors).toEqual([]);
});

test.describe('on a phone held sideways (16x9)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 667, height: 375 } });

  test('Options shows under the touch controls', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await toTitle(page);
    await openFromTitle(page);
    // A phone's first visit runs by default.
    expect((await options(page)).rows[3]).toBe('Always run On');
    await press(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    await page.screenshot({ path: 'test-results/screenshots/options-phone-16x9.png' });
    expect(errors).toEqual([]);
  });
});
