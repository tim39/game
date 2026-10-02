import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';
import { NEW_GAME_START } from '../../src/data/new-game';

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
}

async function openSample(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await tapKey(page, 'Enter'); // New Game
  await page.waitForFunction(
    () => window.__game?.activeScenes().includes('dialogue-sample') ?? false,
  );
  await nextFrames(page);
}

const sample = (page: Page) => page.evaluate(() => window.__game?.inspect('dialogue-sample'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

/** Every line of the current page fits the panel, measured in real font pixels, in at most 3 lines. */
function expectFits(info: Record<string, unknown> | undefined): void {
  const widths = info?.lineWidths as number[];
  expect(widths.length).toBeGreaterThan(0);
  expect(widths.length).toBeLessThanOrEqual(3);
  for (const width of widths) expect(width).toBeLessThanOrEqual(info?.maxWidth as number);
}

test('New Game shows the dialogue preview, one page per Confirm, then the field', async ({
  page,
}) => {
  await openSample(page);

  const first = await sample(page);
  expect(first?.speaker).toBe('Tamsin');
  expectFits(first);

  await tapKey(page, 'KeyZ');
  expect((await sample(page))?.page).toBe(1);
  await tapKey(page, 'KeyZ');
  const last = await sample(page);
  expect(last?.speaker).toBe('Preview');
  expectFits(last);

  await tapKey(page, 'KeyZ');
  expect(await activeScenes(page)).toEqual(['field']);
  expect(await page.evaluate(() => window.__game?.inspect('field'))).toMatchObject(NEW_GAME_START);
});

test('Cancel leaves the preview straight away', async ({ page }) => {
  await openSample(page);
  await tapKey(page, 'Escape');
  expect(await activeScenes(page)).toEqual(['title']);
});

// Screenshots for judging how readable the text is, on desktop and on a phone held both ways.
for (const [name, width, height] of [
  ['desktop', 1280, 720],
  ['phone-landscape', 844, 390],
  ['phone-portrait', 390, 844],
] as const) {
  test(`dialogue preview screenshot (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSample(page);
    await page.screenshot({ path: `test-results/screenshots/dialogue-${name}.png` });
  });
}
