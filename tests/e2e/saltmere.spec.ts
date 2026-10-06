import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';
import { NEW_GAME } from '../../src/data/new-game';
import { STORY } from '../../src/data/story';

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
/** Who's about on the map, by ID. */
const people = async (page: Page): Promise<string[]> =>
  ((await field(page))?.npcs as { id: string }[]).map(({ id }) => id);

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
 * Starts on `map` at (x, y), facing `facing`, with the story as far as `story` (a story point's
 * flag, and every one before it) and `gold` to spend.
 */
async function warp(
  page: Page,
  map: string,
  x: number,
  y: number,
  facing: Direction,
  { story, gold = 0 }: { story?: string; gold?: number } = {},
) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  const reached = STORY.findIndex(({ flag }) => flag === story);
  const flags = STORY.slice(0, reached + 1).map(({ flag }) => flag);
  await page.evaluate(
    ([flags, gold]) => {
      for (const flag of flags) window.__game?.setFlag(flag);
      window.__game?.giveGold(gold);
    },
    [flags, gold] as const,
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

/** Presses Confirm, and waits for the dialogue box to show something. */
async function talk(page: Page): Promise<Record<string, unknown> | undefined> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('dialogue') ?? false);
  return page.evaluate(() => window.__game?.inspect('dialogue'));
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

/** Reads the last line, and waits for the field to carry on. */
async function closeDialogue(page: Page): Promise<void> {
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
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

test('a new game starts in Saltmere, at Tamsin’s door', async ({ page }) => {
  const { map, x, y, facing } = NEW_GAME.location;
  expect(map).toBe('saltmere');
  await warp(page, map, x, y, facing);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-start.png' });
});

test('into Tamsin’s house to talk to her, and back out', async ({ page }) => {
  const errors = watchErrors(page);
  await warp(page, 'saltmere', 7, 6, 'up');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await field(page)).toMatchObject({ x: 5, y: 6, facing: 'up' });

  // Tamsin stands by the oven, at (8, 3).
  await step(page, 'ArrowRight', 3);
  await step(page, 'ArrowUp', 2);
  expect(await field(page)).toMatchObject({ x: 8, y: 4, facing: 'up' });
  expect(await talk(page)).toMatchObject({ name: 'Tamsin' });
  // She asks for an answer, which she answers in turn.
  await readOn(page);
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 2,
  );
  await page.screenshot({ path: 'test-results/screenshots/saltmere-tamsin.png' });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() =>
    String(window.__game?.inspect('dialogue')?.text).startsWith("That's my lamplighter."),
  );
  await closeDialogue(page);

  await step(page, 'ArrowDown', 2);
  await step(page, 'ArrowLeft', 3);
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 7, y: 6, facing: 'down' });
  expect(errors).toEqual([]);
});

test('every other house in Saltmere can be gone into, and out of again', async ({ page }) => {
  const errors = watchErrors(page);
  // Outside each door, the house, and where its door brings the player in.
  const houses = [
    [28, 6, 'saltmere-cottage', 4, 5],
    [14, 6, 'saltmere-forge', 4, 5],
    [33, 12, 'saltmere-inn', 6, 7],
    [6, 16, 'saltmere-rhona', 4, 5],
    [27, 17, 'saltmere-ewan', 4, 4],
  ] as const;
  await warp(page, 'saltmere', 28, 6, 'up');
  for (const [x, y, house, insideX, insideY] of houses) {
    await page.evaluate(([x, y]) => window.__game?.warp('saltmere', x, y, 'up'), [x, y] as const);
    await arrivedOn(page, 'saltmere');
    await page.keyboard.press('ArrowUp');
    await arrivedOn(page, house);
    expect(await field(page)).toMatchObject({ x: insideX, y: insideY, facing: 'up' });
    await page.screenshot({ path: `test-results/screenshots/${house}.png` });
    await page.keyboard.press('ArrowDown');
    await arrivedOn(page, 'saltmere');
    expect(await field(page)).toMatchObject({ x, y, facing: 'down' });
  }
  expect(errors).toEqual([]);
});

test('up the lighthouse to the Beacon, past the shut way down to the caves', async ({ page }) => {
  const errors = watchErrors(page);
  await warp(page, 'saltmere', 40, 21, 'up');
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lighthouse-outside.png' });
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse');
  expect(await field(page)).toMatchObject({ x: 4, y: 4, facing: 'up' });

  // The stairs down are roped off: they block the way, and say so.
  await step(page, 'ArrowLeft', 2);
  await step(page, 'ArrowUp', 2);
  expect(await field(page)).toMatchObject({ x: 2, y: 2, facing: 'up', blocked: { up: true } });
  expect(await talk(page)).toMatchObject({ name: '' });
  await closeDialogue(page);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lighthouse.png' });

  // The stairs up, at (6, 1), lead to the lamp room.
  await step(page, 'ArrowRight', 4);
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse-top');
  expect(await field(page)).toMatchObject({ x: 1, y: 2, facing: 'right' });

  // The Beacon burns at (3, 2).
  await step(page, 'ArrowRight');
  expect(await talk(page)).toMatchObject({ name: '' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-lamp-room.png' });
  await closeDialogue(page);

  await step(page, 'ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-lighthouse');
  expect(await field(page)).toMatchObject({ x: 6, y: 2, facing: 'down' });
  expect(errors).toEqual([]);
});

test('a signpost by the road north says where it goes', async ({ page }) => {
  const errors = watchErrors(page);
  // The sign stands at (22, 2), beside the road's way out between the trees.
  await warp(page, 'saltmere', 22, 3, 'up');
  expect(await field(page)).toMatchObject({ blocked: { up: true } });
  expect(await talk(page)).toMatchObject({
    name: '',
    text: 'THE NORTH ROAD. To Wardenhold, and the rest of Aurel.',
  });
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-road-sign.png' });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  expect(errors).toEqual([]);
});

test('Saltmere’s villagers can be talked to, and Corin sells across the stall', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Hob fishes off the end of the dock, at (16, 24).
  await warp(page, 'saltmere', 16, 23, 'down');
  expect(await talk(page)).toMatchObject({ name: 'Hob', portrait: 'portrait.hob' });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-dock.png' });
  await closeDialogue(page);

  // Corin keeps the market stall, behind the baskets at (11, 9) to (13, 9), and sells supplies for
  // the road from in front of them.
  await page.evaluate(() => window.__game?.warp('saltmere', 12, 10, 'up'));
  await arrivedOn(page, 'saltmere');
  expect(await talk(page)).toMatchObject({
    name: 'Corin',
    text: 'Fish, greens, plums! Potions and bombs for the road, too.',
  });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-square.png' });
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('shop')?.shop === 'saltmere-market');
  // Cancel leaves, and Corin says goodbye.
  await page.keyboard.press('KeyX');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.text === 'Happy Kindling!');
  await closeDialogue(page);
  expect(errors).toEqual([]);
});

test('Gwen lets a room at the Gull’s Rest, across her counter', async ({ page }) => {
  const errors = watchErrors(page);
  // In front of the counter, at (1, 3) to (3, 3), with Gwen behind it.
  await warp(page, 'saltmere-inn', 2, 4, 'up', { gold: 15 });
  await page.evaluate(() => window.__game?.vitals('rowan', { hp: 5 }));
  expect(await talk(page)).toMatchObject({ name: 'Gwen' });
  await readOn(page);
  await untilSaid(page, 'A room for the night is 10 gold. Will you stay?');
  await page.screenshot({ path: 'test-results/screenshots/saltmere-inn-offer.png' });
  await pick(page, 0);
  await untilSaid(page, 'Good morning! Safe travels.');
  await closeDialogue(page);
  const morning = await state(page);
  expect(morning.gold).toBe(5);
  // Rested: full, so the game keeps no HP for Rowan.
  expect(morning.members.rowan).not.toHaveProperty('hp');
  expect(errors).toEqual([]);
});

test('Hal sells gear at the forge', async ({ page }) => {
  const errors = watchErrors(page);
  // Hal stands by the anvil, at (5, 2).
  await warp(page, 'saltmere-forge', 5, 3, 'up', { gold: 200 });
  expect(await talk(page)).toMatchObject({ name: 'Hal', portrait: 'portrait.hal' });
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('shop')?.shop === 'saltmere-forge');
  // Buy lists what Hal sells.
  const onPage = (kind: string) =>
    page.waitForFunction(
      (kind) =>
        (window.__game?.inspect('shop')?.page as { kind: string } | undefined)?.kind === kind,
      kind,
    );
  await page.keyboard.press('KeyZ');
  await onPage('buy');
  expect(
    (
      (await page.evaluate(() => window.__game?.inspect('shop')?.entries)) as { label: string }[]
    ).map(({ label }) => label),
  ).toEqual(['Bronze Sword', 'Hand Axe', 'Travel Clothes', 'Leather Vest', 'Chain Mail']);
  await page.screenshot({ path: 'test-results/screenshots/saltmere-forge-shop.png' });
  await page.keyboard.press('KeyX');
  await onPage('commands');
  await page.keyboard.press('KeyX');
  await untilSaid(page, 'Mind the edge.');
  await closeDialogue(page);
  expect(errors).toEqual([]);
});

test('a chest by the rock on Saltmere’s beach holds gold', async ({ page }) => {
  const errors = watchErrors(page);
  // The chest is at (31, 20), past the rock.
  await warp(page, 'saltmere', 31, 19, 'down');
  expect(await talk(page)).toMatchObject({ text: 'Found 30 gold!' });
  await closeDialogue(page);
  expect(await state(page)).toMatchObject({
    gold: 30,
    flags: { 'chest.saltmere-01': true },
  });
  expect(errors).toEqual([]);
});

test('once the Beacon is out, Hob and Pip are indoors, and everyone says something new', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // By day, Hob is on the dock and Pip in the square.
  await warp(page, 'saltmere', 12, 10, 'up');
  expect(await people(page)).toEqual(['hob', 'corin', 'pip', 'jory', 'dai']);

  await warp(page, 'saltmere', 12, 10, 'up', { story: 'story.beacon-out' });
  expect(await people(page)).toEqual(['corin', 'jory', 'dai']);
  expect(await talk(page)).toMatchObject({
    name: 'Corin',
    text: 'Going down under the lighthouse? Take bombs: wind for anything with wings, earth for anything with a shell.',
  });
  await page.screenshot({ path: 'test-results/screenshots/saltmere-night-corin.png' });
  await readOn(page);
  await page.waitForFunction(() => window.__game?.inspect('shop')?.shop === 'saltmere-market');
  await page.keyboard.press('KeyX');
  await untilSaid(page, 'Come back up, mind. Good customers are hard to find.');
  await closeDialogue(page);

  // Hob is home with Nell, at the table, at (2, 4).
  await page.evaluate(() => window.__game?.warp('saltmere-cottage', 2, 5, 'up'));
  await arrivedOn(page, 'saltmere-cottage');
  expect(await people(page)).toEqual(['nell', 'hob']);
  expect(await talk(page)).toMatchObject({
    name: 'Hob',
    text: "Nell won't let me near the dock with that mist in. Says I'll walk off the end. She's not wrong.",
  });
  await closeDialogue(page);

  // And Pip is home with Rhona.
  await page.evaluate(() => window.__game?.warp('saltmere-rhona', 7, 5, 'up'));
  await arrivedOn(page, 'saltmere-rhona');
  expect(await people(page)).toEqual(['rhona', 'pip']);
  expect(errors).toEqual([]);
});
