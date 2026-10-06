import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';

const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
const audio = (page: Page) => page.evaluate(() => window.__game?.audio());

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Waits until the field alone is running on `map`, with the fade in over and the player still. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    const scenes = window.__game?.activeScenes() ?? [];
    return scenes.join() === 'field' && info?.map === id && info.fading === false && !info.moving;
  }, map);
}

/**
 * Starts on `map` at (x, y), facing `facing`, with Bram in the party, hurt: Rowan down to 5 HP and
 * no MP, and Bram KO'd. With `gold` to spend.
 */
async function startHurt(
  page: Page,
  [map, x, y, facing]: readonly [string, number, number, Direction],
  gold = 0,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate((amount) => {
    window.__game?.join('bram');
    window.__game?.vitals('rowan', { hp: 5, mp: 0 });
    window.__game?.vitals('bram', { hp: 0 });
    window.__game?.giveGold(amount);
  }, gold);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Presses Confirm (to talk, or go on), and waits for the dialogue box to show `text` in full. */
async function until(page: Page, text: string): Promise<void> {
  await page.keyboard.press('KeyZ');
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

/** Waits for a line to show in full, and Confirm closes it, back to the field. */
async function closeOn(page: Page, text: string, map: string): Promise<void> {
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
  await page.keyboard.press('KeyZ');
  await arrivedOn(page, map);
}

/** Whether a member is at their most HP and MP: they keep neither while full. */
const restored = (game: GameState, id: string) =>
  !('hp' in (game.members[id] ?? {})) && !('mp' in (game.members[id] ?? {}));

/** In front of the Test Market's innkeeper, and beside its Light Shrine. */
const INNKEEPER = ['test-market', 6, 3, 'up'] as const;
const SHRINE = ['test-market', 8, 3, 'up'] as const;

test('an inn rests the party for its price, fading out for the morning jingle', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startHurt(page, INNKEEPER, 25);
  await until(page, 'A room for the night is 20 gold. Will you stay?');
  await page.screenshot({ path: 'test-results/screenshots/inn-offer.png' });
  await pick(page, 0);
  // The screen goes black for the night, and the jingle plays.
  await page.waitForFunction(() => window.__game?.audio().playing.includes('sfx.rest') ?? false);
  expect((await page.evaluate(() => window.__game?.inspect('field')))?.dark).toBe(true);
  await closeOn(page, 'Good morning! Safe travels.', 'test-market');
  const morning = await state(page);
  expect(morning.gold).toBe(5);
  expect(restored(morning, 'rowan') && restored(morning, 'bram')).toBe(true);
  expect(errors).toEqual([]);
});

test('an inn turns the party away when it can’t pay, and Not now keeps the gold', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startHurt(page, INNKEEPER, 19);
  await until(page, 'A room for the night is 20 gold. Will you stay?');
  await pick(page, 0);
  await closeOn(page, "Oh dear, you're a little short.", 'test-market');
  expect(await state(page)).toMatchObject({ gold: 19, members: { bram: { hp: 0 } } });

  await until(page, 'A room for the night is 20 gold. Will you stay?');
  await pick(page, 1);
  await closeOn(page, 'Come back any time.', 'test-market');
  expect(await state(page)).toMatchObject({ gold: 19, members: { bram: { hp: 0 } } });
  expect(errors).toEqual([]);
});

test('a Light Shrine heals the party at once, for nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await startHurt(page, SHRINE);
  await until(page, "The shrine's warm light washes over the party. Everyone is restored.");
  expect((await audio(page))?.sounds).toContain('sfx.heal');
  await page.screenshot({ path: 'test-results/screenshots/light-shrine.png' });
  await page.keyboard.press('KeyZ');
  await arrivedOn(page, 'test-market');
  const healed = await state(page);
  expect(restored(healed, 'rowan') && restored(healed, 'bram')).toBe(true);
  expect(errors).toEqual([]);
});

test('Rowan’s bed pauses Saltmere’s music for the morning jingle, then carries it on', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Beside Rowan's bed, in Tamsin's house, facing it.
  await startHurt(page, ['saltmere-tamsin', 2, 1, 'left']);
  await until(page, "Rowan's bed, still unmade. A rest would do the party good.");
  await page.waitForFunction(() => window.__game?.audio().music === 'bgm.saltmere');
  await pick(page, 0);
  await page.waitForFunction(() => window.__game?.audio().playing.includes('sfx.rest') ?? false);
  expect(await audio(page)).toMatchObject({ music: null, paused: ['bgm.saltmere'] });
  await closeOn(page, 'Rested, and ready to go again.', 'saltmere-tamsin');
  expect(await audio(page)).toMatchObject({ music: 'bgm.saltmere', paused: [] });
  const rested = await state(page);
  expect(restored(rested, 'rowan') && restored(rested, 'bram')).toBe(true);
  expect(errors).toEqual([]);
});
