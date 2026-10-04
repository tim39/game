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
const state = (page: Page) => page.evaluate(() => window.__game?.state());

interface NpcInfo {
  id: string;
  x: number;
  y: number;
  facing: Direction;
}
const npc = async (page: Page, id: string): Promise<NpcInfo | undefined> =>
  ((await field(page))?.npcs as NpcInfo[]).find((someone) => someone.id === id);

/** Collects console errors and page errors. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
}

/** Waits for the dialogue box to show `text`. */
async function untilSaid(page: Page, text: string): Promise<void> {
  await page.waitForFunction((line) => window.__game?.inspect('dialogue')?.text === line, text);
}

/**
 * Waits for the line to finish typing, and Confirm goes on. Confirm skipping the typing is
 * dialogue.spec's to test: here it would race the typing, and after a slow screenshot a short line
 * has finished, so the Confirm meant to skip it closes the box instead.
 */
async function readOn(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await page.keyboard.press('KeyZ');
}

async function untilIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

const HELLO = 'TEST SQUARE. A place for trying out event scripts. Say hello to the guide.';

test('arriving on a map runs its enter script, which a flag can keep to the first visit', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'test-square', 3, 6, 'up');
  await untilSaid(page, HELLO);
  expect(await field(page)).toMatchObject({ running: true, script: 'test/square' });
  await page.screenshot({ path: 'test-results/screenshots/events-enter.png' });
  await readOn(page);
  await untilIdle(page);
  expect((await state(page))?.flags).toMatchObject({ 'test.square-seen': true });

  // Coming back, it has nothing more to say.
  await warp(page, 'test-square', 3, 6, 'up');
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ running: false });
  expect(errors).toEqual([]);
});

test('stepping onto a touch stops the walk there and runs its script', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.setFlag('test.square-seen'));
  await warp(page, 'test-square', 3, 6, 'right');

  // Holding right, the player walks to the stone at (6, 6) and stops on it.
  await page.keyboard.down('ArrowRight');
  await untilSaid(page, 'A loose stone wobbles underfoot. You find a Potion under it.');
  await page.keyboard.up('ArrowRight');
  expect(await field(page)).toMatchObject({ x: 6, y: 6, running: true, script: 'test/stone' });
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await page.screenshot({ path: 'test-results/screenshots/events-touch.png' });
  await readOn(page);
  await untilIdle(page);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });

  // Off it and back on again: the flag it set changes what it says.
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__game?.inspect('field')?.x === 5);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  await page.keyboard.press('ArrowRight');
  await untilSaid(page, 'The loose stone wobbles again.');
  await readOn(page);
  await untilIdle(page);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });
  expect(errors).toEqual([]);
});

test('a script walks and turns people, waits, teleports through black, and sets off an auto', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.setFlag('test.square-seen'));
  // The guide stands at (5, 3), facing down; the player comes up from below.
  await warp(page, 'test-square', 5, 4, 'up');

  await page.keyboard.press('KeyZ');
  await untilSaid(page, 'Watch this: I walk wherever a script tells me to.');
  await readOn(page);
  // Right, right and down, to (7, 4), then turned to look at the player.
  await untilSaid(page, 'And I can send you somewhere else. Close your eyes...');
  expect(await npc(page, 'guide')).toMatchObject({ x: 7, y: 4, facing: 'left' });
  await page.screenshot({ path: 'test-results/screenshots/events-guide.png' });
  // The player stayed put while the guide walked.
  expect(await field(page)).toMatchObject({ x: 5, y: 4, running: true });
  await readOn(page);

  // Through black to the corner spawn, then back in; the map started over, so the guide is home.
  await page.waitForFunction(() => window.__game?.inspect('field')?.dark === true);
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.x === 8 && info.y === 2 && info.dark === false && info.fading === false;
  });
  expect(await npc(page, 'guide')).toMatchObject({ x: 5, y: 3 });

  // The guide's flag sets off the square's auto script, which turns the guide to cheer.
  await untilSaid(page, 'Ta-da! I said that all by myself, as soon as a flag was set.');
  expect(await field(page)).toMatchObject({ script: 'test/cheer' });
  expect(await npc(page, 'guide')).toMatchObject({ facing: 'right' });
  await page.screenshot({ path: 'test-results/screenshots/events-auto.png' });
  await readOn(page);
  await untilIdle(page);
  expect((await state(page))?.flags).toMatchObject({
    'test.guide-done': true,
    'test.cheered': true,
  });
  // It doesn't cheer again.
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ running: false });
  expect(errors).toEqual([]);
});

test('a teleport without a fade first goes through black like a door', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => {
    window.__game?.setFlag('test.square-seen');
    window.__game?.setFlag('test.guide-done');
    window.__game?.setFlag('test.cheered');
  });
  await warp(page, 'test-square', 5, 4, 'up');
  await page.keyboard.press('KeyZ');
  await untilSaid(page, 'Back to where you started?');
  await readOn(page);
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 2,
  );
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === true);
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.x === 3 && info.y === 6 && info.fading === false && info.running === false;
  });
  expect(await field(page)).toMatchObject({ facing: 'up', dark: false });
  expect(errors).toEqual([]);
});

test('a step into something fails the script, and the game carries on', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.setFlag('test.square-seen'));
  await warp(page, 'test-square', 3, 6, 'up');
  await page.evaluate(() => window.__game?.run('test/bump'));
  await untilIdle(page);
  // Two steps up, then the trees.
  expect(await npc(page, 'guide')).toMatchObject({ x: 5, y: 1, facing: 'up' });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('Event script test/bump failed');
  expect(errors[0]).toContain("guide can't step up from (5, 1)");

  // The player can walk again.
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__game?.inspect('field')?.y === 5);
});

test('Saltmere: once Tamsin has put you on lamp duty, the kid knows', async ({ page }) => {
  await toTitle(page);
  await page.evaluate(() => window.__game?.setFlag('story.lamp-duty'));
  // The kid wanders the square, so the test runs the kid's script rather than chasing them.
  await warp(page, 'saltmere', 20, 17, 'up');
  await page.evaluate(() => window.__game?.run('saltmere/kid'));
  await untilSaid(
    page,
    "Tamsin's got you on lamp duty? Do the ones round the pyre first. They're the prettiest!",
  );
  await readOn(page);
  await page.waitForFunction(() =>
    String(window.__game?.inspect('dialogue')?.text).includes('honey cake'),
  );
});
