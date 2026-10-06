import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { ENCOUNTER_TUNING } from '../../src/data/balance';

// Random battles on the North Road, out of Saltmere. Battles play out at 4×, but a lost one still
// takes a while, more so with other tests running beside it.
test.describe.configure({ timeout: 90_000 });

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const battle = (page: Page) => page.evaluate(() => window.__game?.inspect('battle'));
const audio = (page: Page) => page.evaluate(() => window.__game?.audio());
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());

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

/**
 * Starts the game on `map` at (x, y), with battles at 4× speed, and Bram in the party unless
 * `alone`. Cancel is pressed on the title screen first, which lets the music play as it would for
 * a player, and does nothing there or on the field.
 */
async function startOn(
  page: Page,
  [map, x, y, facing]: [string, number, number, Direction],
  alone = false,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.keyboard.press('KeyX');
  await nextFrames(page);
  await page.evaluate(
    ([start, withBram]) => {
      window.__game?.battleSpeed(4);
      if (withBram) window.__game?.join('bram');
      window.__game?.warp(...start);
    },
    [[map, x, y, facing], !alone] as const,
  );
  await arrivedOn(page, map);
}

/** Steps one cell (or turns, if the way is blocked) and waits for the step to end. */
async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await nextFrames(page);
    await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  }
}

/** Waits until the battle waits for the player: to choose, or to see how it ended. */
async function waitForPlayer(page: Page): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    () => {
      const info = window.__game?.inspect('battle');
      return info?.choosing === true || info?.waiting === true;
    },
    undefined,
    { timeout: 60_000 },
  );
  return (await battle(page)) ?? {};
}

/** Takes the same command every turn (the cursor's moves, then Confirm) until the battle is over. */
async function fightUntilOver(page: Page, ...command: string[]): Promise<Record<string, unknown>> {
  for (let turn = 0; turn < 200; turn++) {
    const info = await waitForPlayer(page);
    if (info.waiting) return info;
    for (const key of [...command, 'KeyZ']) {
      await page.keyboard.press(key);
      await nextFrames(page);
    }
  }
  throw new Error('The battle went on too long');
}

test('walking the North Road meets wolves, to battle music, and the field carries on after', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startOn(page, ['north-road', 11, 15, 'up']);
  // The next battle comes on the third step.
  await page.evaluate(() => window.__game?.encounters({ seed: 1, countdown: 3, rate: 'normal' }));
  const before = await audio(page);
  expect(before).toMatchObject({ music: 'bgm.saltmere', paused: [] });

  await step(page, 'ArrowUp', 2);
  expect(await field(page)).toMatchObject({ y: 13, countdown: 1, encountering: false });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__game?.inspect('field')?.encountering === true);
  await page.keyboard.up('ArrowUp');
  // The walk stops where the battle comes, and the battle music pauses the field's.
  expect(await field(page)).toMatchObject({ x: 11, y: 12, moving: false });
  expect(await audio(page)).toMatchObject({ music: 'bgm.battle', paused: ['bgm.saltmere'] });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/encounter-transition.png' });

  const fight = await waitForPlayer(page);
  expect(await activeScenes(page)).toEqual(['battle']);
  expect(fight.backdrop).toBe('meadow');
  const enemies = (fight.fighters as { side: string; id: string }[]).filter(
    ({ side }) => side === 'enemies',
  );
  expect(enemies.length).toBeGreaterThan(0);
  for (const { id } of enemies) expect(id).toMatch(/^wolf-/);
  await page.screenshot({ path: 'test-results/screenshots/encounter-battle.png' });

  const won = await fightUntilOver(page);
  expect(won.outcome).toBe('victory');
  // Confirm goes through the victory panel's pages, however many level-ups there were.
  for (let shown = 0; shown < 10 && (await activeScenes(page))?.join() !== 'field'; shown++) {
    await page.keyboard.press('KeyZ');
    await nextFrames(page);
  }
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'field');
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
  // Back where the battle came, with a fresh countdown, and the field's music carrying on where
  // it was rather than starting over.
  const after = await field(page);
  expect(after).toMatchObject({ map: 'north-road', x: 11, y: 12, encountering: false });
  const [fewest, most] = ENCOUNTER_TUNING.steps;
  expect(after?.countdown).toBeGreaterThanOrEqual(fewest);
  expect(after?.countdown).toBeLessThanOrEqual(most);
  expect(await audio(page)).toMatchObject({
    music: 'bgm.saltmere',
    paused: [],
    starts: (before?.starts ?? 0) + 1,
  });
  await page.screenshot({ path: 'test-results/screenshots/encounter-after.png' });
  await step(page, 'ArrowUp');
  expect(await field(page)).toMatchObject({ y: 11 });
  expect(errors).toEqual([]);
});

test('with the Encounter rate Off, the North Road is quiet until it’s turned back on', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startOn(page, ['north-road', 11, 15, 'up']);
  await page.evaluate(() => window.__game?.encounters({ countdown: 1, rate: 'off' }));
  await step(page, 'ArrowUp', 8);
  expect(await field(page)).toMatchObject({ y: 7, encountering: false, countdown: 1 });
  expect(await activeScenes(page)).toEqual(['field']);

  await page.evaluate(() => window.__game?.encounters({ rate: 'normal' }));
  await step(page, 'ArrowDown');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('battle') ?? false);
  expect(errors).toEqual([]);
});

test('Saltmere’s road north leads out to the North Road, and back', async ({ page }) => {
  const errors = watchErrors(page);
  await startOn(page, ['saltmere', 20, 2, 'up']);
  await page.evaluate(() => window.__game?.encounters({ rate: 'off' }));
  // Up the road and off the top of the map.
  await step(page, 'ArrowUp', 3);
  await arrivedOn(page, 'north-road');
  expect(await field(page)).toMatchObject({ x: 11, y: 17, facing: 'up' });
  await page.screenshot({ path: 'test-results/screenshots/north-road.png' });
  await step(page, 'ArrowDown', 3);
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 20, y: 2, facing: 'down' });
  expect(errors).toEqual([]);
});

test('a preemptive strike and an ambush each say so as the battle starts', async ({ page }) => {
  const errors = watchErrors(page);
  await startOn(page, ['north-road', 11, 15, 'up']);
  for (const [start, banner, first] of [
    ['preemptive', 'Preemptive strike!', 'rowan'],
    ['ambush', 'Ambush!', 'wolf-a'],
  ] as const) {
    await page.evaluate((jump) => window.__game?.battle(['wolf'], { seed: 1, start: jump }), start);
    await page.waitForFunction(
      (words) => window.__game?.inspect('battle')?.banner === words,
      banner,
    );
    // Whoever got the jump goes first.
    expect((await battle(page))?.active).toBe(first);
    await waitForPlayer(page);
  }
  expect(errors).toEqual([]);
});

test('a random battle lost ends in the Game Over screen, and Title goes back to the title', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Rowan alone, worn down and guarding every turn, against the pair of wolves this seed brings.
  await startOn(page, ['north-road', 11, 15, 'up'], true);
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 10 });
    window.__game?.encounters({ seed: 1, countdown: 1, rate: 'normal' });
  });
  await step(page, 'ArrowUp');
  const lost = await fightUntilOver(page, 'ArrowUp');
  expect(lost).toMatchObject({ outcome: 'defeat', banner: 'The party has fallen...' });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('game-over')?.ready === true);
  // The field sleeps on under the Game Over screen, its music paused, until it's left for good.
  expect(await audio(page)).toMatchObject({ music: null, paused: ['bgm.saltmere'] });
  // Title is the last choice, round from the first.
  await page.keyboard.press('ArrowUp');
  await nextFrames(page);
  expect(await page.evaluate(() => window.__game?.inspect('game-over')?.selected)).toBe('Title');
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'title');
  expect(await audio(page)).toMatchObject({ music: 'bgm.title', paused: [] });
  expect(errors).toEqual([]);
});
