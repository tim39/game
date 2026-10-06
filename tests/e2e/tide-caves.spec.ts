import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';

// The Tide Caves, under Saltmere's lighthouse: three floors whose tide the levers turn.

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;

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
 * Starts on `map` at (x, y), with the Beacon out (so the caves are open), no random battles unless
 * `battles`, and `flags` set too.
 */
async function startOn(
  page: Page,
  [map, x, y, facing]: readonly [string, number, number, Direction],
  { flags = [], battles = false }: { flags?: string[]; battles?: boolean } = {},
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(
    ([flags, battles]) => {
      for (const flag of ['story.beacon-out', ...flags]) window.__game?.setFlag(flag);
      if (!battles) window.__game?.encounters({ rate: 'off' });
    },
    [flags, battles] as const,
  );
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
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

/** Waits for the dialogue box to show `text` in full. */
async function untilSaid(page: Page, text: string): Promise<void> {
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
}

/** Confirm goes on from the line to its choices; this picks the one at `index` (0 is the first). */
async function pick(page: Page, index: number): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(
    () => ((window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length ?? 0) > 0,
  );
  for (let move = 0; move < index; move++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('KeyZ');
}

/** Reads the last line, and waits for the field to carry on. */
async function closeOn(page: Page, text: string): Promise<void> {
  await untilSaid(page, text);
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

/** Pulls the lever in front of the player, which turns the tide, and reads what happened. */
async function pullLever(page: Page, from: 'in' | 'out'): Promise<void> {
  await page.keyboard.press('KeyZ');
  await untilSaid(
    page,
    from === 'in'
      ? 'A sluice lever on a post, its light burning blue. The tide is in.'
      : 'A sluice lever on a post, its light burning red. The tide is out.',
  );
  await pick(page, 0);
  // The screen goes black while the tide turns, to the lever's crank and the rush of the sea.
  await page.waitForFunction(() => window.__game?.inspect('field')?.dark === true);
  expect((await page.evaluate(() => window.__game?.audio()))?.sounds).toContain('sfx.lever');
  await closeOn(
    page,
    from === 'in'
      ? 'Gates grind open deep in the rock, and the water drains away.'
      : 'Gates groan shut deep in the rock, and the sea rushes back in.',
  );
}

const blocked = async (page: Page): Promise<Record<string, boolean>> =>
  ((await field(page))?.blocked ?? {}) as Record<string, boolean>;

test('the lighthouse’s stairs lead down to the caves once the Beacon is out', async ({ page }) => {
  const errors = watchErrors(page);
  // Below the stairs down, at (2, 1).
  await startOn(page, ['saltmere-lighthouse', 2, 2, 'up']);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'tide-caves-b1');
  expect(await field(page)).toMatchObject({ x: 3, y: 2, facing: 'down', banner: 'Tide Caves B1' });
  await page.waitForFunction(() => window.__game?.audio().music === 'bgm.tide-caves');
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-b1.png' });

  // And back up the stairs, at (3, 1).
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse');
  expect(await field(page)).toMatchObject({ x: 2, y: 2, facing: 'down' });
  expect(errors).toEqual([]);
});

test('a lever lets the tide out, draining the shallows, and in again', async ({ page }) => {
  const errors = watchErrors(page);
  // Below the lever at (11, 5), beside the shallows at (13, 1) to (14, 16).
  await startOn(page, ['tide-caves-b1', 11, 6, 'up']);
  await step(page, 'ArrowDown');
  await step(page, 'ArrowRight');
  // At (12, 7), with the shallows flooded to the east.
  expect(await field(page)).toMatchObject({ x: 12, y: 7 });
  expect(await blocked(page)).toMatchObject({ right: true });

  await step(page, 'ArrowLeft');
  await step(page, 'ArrowUp');
  await pullLever(page, 'in');
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-tide-out.png' });
  expect((await state(page)).flags).toHaveProperty(['tide.b1-out'], true);

  // The shallows are sand now: across them, to the east.
  await step(page, 'ArrowDown');
  await step(page, 'ArrowRight', 4);
  expect(await field(page)).toMatchObject({ x: 15, y: 7 });

  // The lever on the east side lets the tide back in.
  await page.evaluate(() => window.__game?.warp('tide-caves-b1', 16, 13, 'up'));
  await arrivedOn(page, 'tide-caves-b1');
  await pullLever(page, 'out');
  expect((await state(page)).flags).not.toHaveProperty(['tide.b1-out']);
  expect(await blocked(page)).toMatchObject({ left: false });
  await step(page, 'ArrowLeft', 2);
  // Stopped at (15, 13), on the shallows' edge: it's the sea again beyond.
  expect(await field(page)).toMatchObject({ x: 15, y: 13 });
  expect(await blocked(page)).toMatchObject({ left: true });
  expect(errors).toEqual([]);
});

test('rafts float out to the island while the tide is in, and sink while it’s out', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // On the shore below the rafts, at (22, 6) to (22, 8), up to the island's chest at (21, 4).
  await startOn(page, ['tide-caves-b1', 22, 9, 'up']);
  await step(page, 'ArrowUp', 4);
  expect(await field(page)).toMatchObject({ x: 22, y: 5 });
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-rafts.png' });
  // Round to face the chest, which blocks the way up.
  await step(page, 'ArrowLeft');
  await step(page, 'ArrowUp');
  expect(await field(page)).toMatchObject({ x: 21, y: 5, facing: 'up' });
  await page.keyboard.press('KeyZ');
  await closeOn(page, 'Found 60 gold!');
  expect((await state(page)).gold).toBe(60);

  // With the tide out, there's nothing to stand on.
  await startOn(page, ['tide-caves-b1', 22, 9, 'up'], { flags: ['tide.b1-out'] });
  expect(await blocked(page)).toMatchObject({ up: true });
  expect(errors).toEqual([]);
});

test('the Light Shrines heal, and the door to the Beacon chamber is sealed', async ({ page }) => {
  const errors = watchErrors(page);
  // The shrine by the way in, at (6, 1).
  await startOn(page, ['tide-caves-b1', 6, 2, 'up']);
  await page.evaluate(() => window.__game?.vitals('rowan', { hp: 1 }));
  await page.keyboard.press('KeyZ');
  await closeOn(page, "The shrine's warm light washes over the party. Everyone is restored.");
  expect((await state(page)).members.rowan).not.toHaveProperty('hp');

  // On the last floor, past the shallows: the shrine at (24, 1) and the door at (27, 0).
  await startOn(page, ['tide-caves-b3', 27, 1, 'up'], { flags: ['tide.b3-out'] });
  await page.keyboard.press('KeyZ');
  await untilSaid(
    page,
    "A heavy door, green with age and carved with the Wardens' flame. Cold seeps from under it. It won't budge.",
  );
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-b3-door.png' });
  await page.keyboard.press('KeyZ');
  expect(errors).toEqual([]);
});

test('the second floor’s chest holds the Iron Sword', async ({ page }) => {
  const errors = watchErrors(page);
  // In the south, beside the chest at (11, 20).
  await startOn(page, ['tide-caves-b2', 12, 20, 'left']);
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-b2.png' });
  await page.keyboard.press('KeyZ');
  await closeOn(page, 'Found Iron Sword!');
  expect((await state(page)).inventory).toMatchObject({ 'iron-sword': 1 });
  expect(errors).toEqual([]);
});

test('the caves’ battles are fought in the cavern, against what lives there', async ({ page }) => {
  const errors = watchErrors(page);
  await startOn(page, ['tide-caves-b1', 3, 2, 'down'], { battles: true });
  // The next battle comes on the next step.
  await page.evaluate(() => window.__game?.encounters({ seed: 7, countdown: 1, rate: 'normal' }));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () => {
      const info = window.__game?.inspect('battle');
      return info?.choosing === true || info?.waiting === true;
    },
    undefined,
    { timeout: 30_000 },
  );
  const battle = (await page.evaluate(() => window.__game?.inspect('battle'))) as {
    backdrop: string;
    fighters: { side: string; id: string }[];
  };
  expect(battle.backdrop).toBe('tide-caves');
  const cavers = [
    'cave-bat',
    'reef-snail',
    'grotto-octopus',
    'tide-jelly',
    'sea-snake',
    'drowned-wisp',
  ];
  for (const { id } of battle.fighters.filter(({ side }) => side === 'enemies')) {
    expect(cavers).toContain(id.replace(/-[a-z]$/, ''));
  }

  // The new ones, Tide Jellies and a Sea Snake, in front of the cavern.
  await page.evaluate(() =>
    window.__game?.battle(['tide-jelly', 'sea-snake', 'tide-jelly'], {
      backdrop: 'tide-caves',
      seed: 1,
    }),
  );
  await page.waitForFunction(() => window.__game?.inspect('battle')?.choosing === true);
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-battle.png' });
  expect(errors).toEqual([]);
});
