import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const dialogue = (page: Page) => page.evaluate(() => window.__game?.inspect('dialogue'));
const state = (page: Page) => page.evaluate(() => window.__game?.state());

interface ChestInfo {
  x: number;
  y: number;
  flag: string;
  open: boolean;
}
async function chestAt(page: Page, x: number, y: number): Promise<ChestInfo | undefined> {
  const chests = (await field(page))?.chests as ChestInfo[];
  return chests.find((chest) => chest.x === x && chest.y === y);
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
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

/** Puts the player on `map` at (x, y), keeping the game as it is. */
async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Presses Confirm, and waits for the dialogue box to show `text`, typed out in full. */
async function openUntilSaid(page: Page, text: string): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
}

/** Closes the box, and waits for the field to carry on. */
async function close(page: Page): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  // A few frames more, to see the Confirm that closed the box doesn't open the chest again.
  await nextFrames(page);
  await nextFrames(page);
  expect(await page.evaluate(() => window.__game?.activeScenes())).toEqual(['field']);
}

test('a chest opens once: it gives what is inside, then stays open and empty', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // The Potion is in the chest at (4, 1) in the test cellar; the player stands below it.
  await warp(page, 'test-cellar', 4, 2, 'up');
  expect(await chestAt(page, 4, 1)).toEqual({
    x: 4,
    y: 1,
    flag: 'chest.test-cellar-01',
    open: false,
  });
  // It blocks the way, like a wall.
  expect(await field(page)).toMatchObject({ blocked: { up: true } });
  await page.screenshot({ path: 'test-results/screenshots/chest-shut.png' });

  await openUntilSaid(page, 'Found Potion!');
  // Said in the plain box that signs use, with the chest open behind it.
  expect(await dialogue(page)).toMatchObject({ name: '', portrait: null });
  expect(await field(page)).toMatchObject({ running: true, script: 'chest.test-cellar-01' });
  expect((await chestAt(page, 4, 1))?.open).toBe(true);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });
  await page.screenshot({ path: 'test-results/screenshots/chest-found.png' });
  await close(page);

  await openUntilSaid(page, 'The chest is empty.');
  await close(page);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });
  expect((await state(page))?.flags).toEqual({ 'chest.test-cellar-01': true });
  expect(errors).toEqual([]);
});

test('an opened chest stays open after leaving the map and coming back', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'test-cellar', 4, 2, 'up');
  await openUntilSaid(page, 'Found Potion!');
  await close(page);

  // Up the stairs, at (2, 1), and back down.
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__game?.inspect('field')?.x === 3);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__game?.inspect('field')?.x === 2);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-house');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'test-cellar');
  expect(await chestAt(page, 4, 1)).toMatchObject({ open: true });
  // The gold chest beside it is still shut.
  expect(await chestAt(page, 6, 1)).toMatchObject({ open: false });
  await page.screenshot({ path: 'test-results/screenshots/chest-open.png' });

  await warp(page, 'test-cellar', 4, 2, 'up');
  await openUntilSaid(page, 'The chest is empty.');
  await close(page);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });
  expect(errors).toEqual([]);
});

test('a chest can hold gold', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'test-cellar', 6, 2, 'up');
  expect((await state(page))?.gold).toBe(0);
  await openUntilSaid(page, 'Found 25 gold!');
  await close(page);
  expect(await state(page)).toMatchObject({ gold: 25, inventory: {} });
  expect(await chestAt(page, 6, 1)).toMatchObject({ open: true });
  expect(errors).toEqual([]);
});

test('a chest opens from any side, and the debug hooks can shut it again', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // From the left of the gold chest, at (6, 1).
  await warp(page, 'test-cellar', 5, 1, 'right');
  await openUntilSaid(page, 'Found 25 gold!');
  await close(page);

  await page.evaluate(() => window.__game?.setFlag('chest.test-cellar-02', false));
  await nextFrames(page);
  expect(await chestAt(page, 6, 1)).toMatchObject({ open: false });
  await openUntilSaid(page, 'Found 25 gold!');
  await close(page);
  expect((await state(page))?.gold).toBe(50);
  expect(errors).toEqual([]);
});

test('Tamsin’s house has a Potion in a chest at the foot of Rowan’s bed', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Past the opening, which Tamsin's house plays until Rowan is on lamp duty.
  await page.evaluate(() => window.__game?.setFlag('story.lamp-duty'));
  // In through the front door.
  await warp(page, 'saltmere', 7, 6, 'up');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  // The chest is at (1, 3); walk round to face it from the right.
  for (const [key, x, y] of [
    ['ArrowLeft', 4, 6],
    ['ArrowLeft', 3, 6],
    ['ArrowLeft', 2, 6],
    ['ArrowUp', 2, 5],
    ['ArrowUp', 2, 4],
    ['ArrowUp', 2, 3],
  ] as const) {
    await page.keyboard.press(key);
    await page.waitForFunction(
      ({ toX, toY }) => {
        const info = window.__game?.inspect('field');
        return info?.x === toX && info.y === toY && info.moving === false;
      },
      { toX: x, toY: y },
    );
  }
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__game?.inspect('field')?.facing === 'left');
  expect(await chestAt(page, 1, 3)).toMatchObject({
    flag: 'chest.saltmere-tamsin-01',
    open: false,
  });
  await page.screenshot({ path: 'test-results/screenshots/chest-saltmere-tamsin.png' });

  await openUntilSaid(page, 'Found Potion!');
  await close(page);
  await openUntilSaid(page, 'The chest is empty.');
  await close(page);
  expect((await state(page))?.inventory).toEqual({ potion: 1 });
  expect(errors).toEqual([]);
});
