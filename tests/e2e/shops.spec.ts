import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';

interface ShopInfo {
  shop: string;
  page: { kind: string; deal?: string; item?: string; count?: number };
  cursor: number;
  selected: string | null;
  entries: { label: string; detail: string; enabled: boolean }[];
  item: string | null;
  list: string[];
  info: string[];
  party: string[];
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const shop = async (page: Page): Promise<ShopInfo> =>
  (await page.evaluate(() => window.__game?.inspect('shop'))) as unknown as ShopInfo;
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
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

/** Waits until the field alone is running on `map`, with the fade in over and the player still. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    const scenes = window.__game?.activeScenes() ?? [];
    return scenes.join() === 'field' && info?.map === id && info.fading === false && !info.moving;
  }, map);
}

/**
 * Starts on `map` at (x, y), facing `facing`, with Bram in the party, `gold` and whatever `setUp`
 * does to the game first.
 */
async function startOn(
  page: Page,
  [map, x, y, facing]: readonly [string, number, number, Direction],
  gold = 0,
  setUp: () => void = () => undefined,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => window.__game?.join('bram'));
  await page.evaluate((amount) => window.__game?.giveGold(amount), gold);
  await page.evaluate(setUp);
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

/** Talks to the shopkeeper in front of the player, and goes on into the shop. */
async function enterShop(page: Page, greeting: string): Promise<void> {
  await until(page, greeting);
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('shop') ?? false);
  await nextFrames(page);
}

/** Moves the cursor down to the line called `label` on the page showing, and chooses it. */
async function choose(page: Page, label: string): Promise<void> {
  const { entries, cursor } = await shop(page);
  const index = entries.findIndex((entry) => entry.label === label);
  expect(index, `${label} is on the page`).toBeGreaterThanOrEqual(0);
  for (let move = 0; move < (index - cursor + entries.length) % entries.length; move++) {
    await press(page, 'ArrowDown');
  }
  expect((await shop(page)).selected).toBe(label);
  await press(page, 'KeyZ');
}

/** In front of the Test Market's shopkeeper. */
const SHOPKEEPER = ['test-market', 3, 3, 'up'] as const;

test('a shop sells as many as there’s gold for, and shows who could wear what', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startOn(page, SHOPKEEPER, 300);
  await enterShop(page, 'Welcome! A bit of everything, for a price.');
  const opened = await shop(page);
  expect(opened).toMatchObject({ shop: 'test-shop', page: { kind: 'commands' }, selected: 'Buy' });
  expect(opened.info).toEqual(['300 gold']);
  await choose(page, 'Buy');
  const buying = await shop(page);
  expect(buying.entries.slice(0, 3)).toEqual([
    { label: 'Potion', detail: '25', enabled: true },
    { label: 'Ether', detail: '90', enabled: true },
    { label: 'Ember Feather', detail: '150', enabled: true },
  ]);
  expect(buying.info).toEqual(['300 gold', 'Have 0', 'Restores HP to', 'one ally.']);
  await page.screenshot({ path: 'test-results/screenshots/shop-buy.png' });

  // Five Potions: Right adds one at a time, Up ten, as many as the gold pays for.
  await press(page, 'KeyZ', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight');
  const counting = await shop(page);
  expect(counting.page).toEqual({ kind: 'how-many', deal: 'buy', item: 'potion', count: 5 });
  expect(counting.info).toEqual(['300 gold', 'Have 0', 'Buy how many?', '5', '125 gold']);
  await page.screenshot({ path: 'test-results/screenshots/shop-how-many.png' });
  await press(page, 'ArrowUp');
  expect((await shop(page)).page).toMatchObject({ count: 12 });
  await press(page, 'ArrowDown', 'KeyZ');
  expect(await state(page)).toMatchObject({ gold: 250, inventory: { potion: 2 } });
  expect(await shop(page)).toMatchObject({ page: { kind: 'buy' }, selected: 'Potion' });

  // An Iron Sword is for Rowan alone, and better than his Bronze one.
  await choose(page, 'Iron Sword');
  await press(page, 'KeyX');
  const sword = await shop(page);
  expect(sword.party).toEqual(['rowan ATK +5', 'bram']);
  await page.screenshot({ path: 'test-results/screenshots/shop-gear.png' });
  expect(errors).toEqual([]);
});

test('a shop buys things back for half, but not gear being worn, and Leave says goodbye', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startOn(page, SHOPKEEPER, 0, () => {
    window.__game?.give('potion', 3);
    window.__game?.give('iron-sword');
  });
  await enterShop(page, 'Welcome! A bit of everything, for a price.');
  await choose(page, 'Sell');
  // Rowan's Bronze Sword and Travel Clothes, and Bram's gear, are being worn.
  const selling = await shop(page);
  expect(selling.entries).toEqual([
    { label: 'Potion', detail: '12', enabled: true },
    { label: 'Iron Sword', detail: '120', enabled: true },
  ]);
  await page.screenshot({ path: 'test-results/screenshots/shop-sell.png' });
  await press(page, 'KeyZ', 'ArrowUp');
  // No more than the party has.
  expect((await shop(page)).page).toMatchObject({ deal: 'sell', item: 'potion', count: 3 });
  await press(page, 'KeyZ');
  expect(await state(page)).toMatchObject({ gold: 36, inventory: { 'iron-sword': 1 } });
  await choose(page, 'Iron Sword');
  await press(page, 'KeyZ');
  // With nothing left to sell, it's back to the commands, and Sell is greyed out.
  expect(await state(page)).toMatchObject({ gold: 156, inventory: {} });
  const sold = await shop(page);
  expect(sold).toMatchObject({ page: { kind: 'commands' }, selected: 'Sell' });
  expect(sold.entries[1]).toEqual({ label: 'Sell', detail: '', enabled: false });

  await choose(page, 'Leave');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.text === 'Come again!');
  expect(await activeScenes(page)).not.toContain('shop');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await press(page, 'KeyZ');
  await arrivedOn(page, 'test-market');
  expect(errors).toEqual([]);
});

test.describe('on a phone held sideways (16x9)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 667, height: 375 } });

  test('a shop shows under the touch controls', async ({ page }) => {
    const errors = watchErrors(page);
    await startOn(page, SHOPKEEPER, 500);
    await enterShop(page, 'Welcome! A bit of everything, for a price.');
    await choose(page, 'Buy');
    await choose(page, 'Leather Vest');
    // How many sits at the bottom of the panel, clear of A and B.
    expect((await shop(page)).info).toEqual([
      '500 gold',
      'Have 0',
      'Buy how many?',
      '1',
      '150 gold',
    ]);
    await page.screenshot({ path: 'test-results/screenshots/shop-phone-16x9.png' });
    expect(errors).toEqual([]);
  });
});
