import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const dialogue = (page: Page) => page.evaluate(() => window.__game?.inspect('dialogue'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

async function npcFacing(page: Page, id: string): Promise<string | undefined> {
  const npcs = (await field(page))?.npcs as { id: string; facing: string }[];
  return npcs.find((npc) => npc.id === id)?.facing;
}

/** Puts the player on `map` at (x, y), facing `facing`, and fails the test on any console error. */
async function warp(
  page: Page,
  map: string,
  x: number,
  y: number,
  facing: Direction,
): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
  return errors;
}

/** Waits for the dialogue box to show `text`. */
async function untilSaid(page: Page, text: string): Promise<void> {
  await page.waitForFunction((said) => window.__game?.inspect('dialogue')?.text === said, text);
}

/** Presses Confirm to talk, and waits for the dialogue box to show `text`. */
async function talkUntilSaid(page: Page, text: string): Promise<void> {
  await page.keyboard.press('KeyZ');
  await untilSaid(page, text);
}

/** Confirm finishes typing the line, and Confirm again goes on. */
async function readOn(page: Page): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await page.keyboard.press('KeyZ');
}

/** Reads the last line, and waits for the box to close and the field to carry on. */
async function readToClose(page: Page): Promise<void> {
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  // A few frames more, to see the Confirm that closed the box doesn't open it again.
  await nextFrames(page);
  await nextFrames(page);
  expect(await activeScenes(page)).toEqual(['field']);
  expect(await field(page)).toMatchObject({ running: false });
}

/** Each shown line fits the box, measured in real font pixels, in at most three lines. */
function expectFits(info: Record<string, unknown> | undefined): void {
  const widths = info?.lineWidths as number[];
  expect(widths.length).toBeGreaterThan(0);
  expect(widths.length).toBeLessThanOrEqual(3);
  for (const width of widths) expect(width).toBeLessThanOrEqual(info?.maxWidth as number);
}

test('Confirm in front of someone turns them to face you, and the field waits while they talk', async ({
  page,
}) => {
  // Tamsin stands at (10, 8), facing down; the player stands just above her, facing her.
  const errors = await warp(page, 'test-shore', 10, 7, 'down');
  expect(await npcFacing(page, 'tamsin')).toBe('down');

  await talkUntilSaid(
    page,
    "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
  );
  const said = await dialogue(page);
  expect(said).toMatchObject({ name: 'Tamsin', portrait: 'portrait.tamsin' });
  expectFits(said);
  expect(await field(page)).toMatchObject({ running: true, x: 10, y: 7 });
  expect(await npcFacing(page, 'tamsin')).toBe('up');
  await page.screenshot({ path: 'test-results/screenshots/interaction-tamsin.png' });

  // The player can't walk off mid-conversation.
  await page.keyboard.down('ArrowLeft');
  await nextFrames(page);
  await nextFrames(page);
  await page.keyboard.up('ArrowLeft');
  expect(await field(page)).toMatchObject({ x: 10, y: 7, facing: 'down', moving: false });

  await readToClose(page);
  expect(await npcFacing(page, 'tamsin')).toBe('up');
  // And once it's over, they can.
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__game?.inspect('field')?.x === 9);
  expect(errors).toEqual([]);
});

test('Confirm in front of a sign reads it', async ({ page }) => {
  // The sign is at (8, 3), by the path.
  const errors = await warp(page, 'test-shore', 8, 4, 'up');
  await talkUntilSaid(page, 'TEST SHORE. A house to the east, a meadow down the long path.');
  const said = await dialogue(page);
  expect(said).toMatchObject({ name: '', portrait: null });
  expectFits(said);
  await page.screenshot({ path: 'test-results/screenshots/interaction-sign.png' });

  await readToClose(page);
  expect(errors).toEqual([]);
});

test('Someone with more to say shows one line at a time', async ({ page }) => {
  // The host stands at (2, 2) in the test house, facing right; the player comes up from below.
  const errors = await warp(page, 'test-house', 2, 3, 'up');
  await talkUntilSaid(page, 'Come in, come in. Mind the cellar stairs.');
  expect(await dialogue(page)).toMatchObject({ name: 'Villager', portrait: null });
  expect(await npcFacing(page, 'host')).toBe('down');
  await page.screenshot({ path: 'test-results/screenshots/interaction-host.png' });

  await readOn(page);
  await untilSaid(page, "There's nothing down there but cobwebs and a draught.");
  expectFits(await dialogue(page));
  expect(await field(page)).toMatchObject({ running: true });

  await readToClose(page);
  expect(errors).toEqual([]);
});

test('Confirm facing nothing in particular does nothing', async ({ page }) => {
  const errors = await warp(page, 'test-shore', 12, 12, 'right');
  await page.keyboard.press('KeyZ');
  await nextFrames(page);
  await nextFrames(page);
  expect(await activeScenes(page)).toEqual(['field']);
  expect(await field(page)).toMatchObject({ running: false, x: 12, y: 12 });
  expect(errors).toEqual([]);
});
