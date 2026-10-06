import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';

interface MenuInfo {
  page: { kind: string; member?: string; item?: string; slot?: string };
  cursor: number;
  selected: string | null;
  entries: { label: string; detail: string; enabled: boolean }[];
  aimed: string[];
  party: string[];
  list: string[];
  info: string[];
  stats: string[];
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const menu = async (page: Page): Promise<MenuInfo> =>
  (await page.evaluate(() => window.__game?.inspect('main-menu'))) as unknown as MenuInfo;
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
 * Starts by Tamsin's door in Saltmere, with Bram in the party and whatever `setUp` does to the
 * game first, and opens the main menu.
 */
async function openMenu(page: Page, setUp: () => void = () => undefined): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => window.__game?.join('bram'));
  await page.evaluate(setUp);
  await page.evaluate(() => window.__game?.warp('saltmere', 7, 6, 'down'));
  await arrivedOn(page, 'saltmere');
  await press(page, 'KeyC');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'main-menu');
}

/** Moves the cursor down to the line called `label` on the page showing, and chooses it. */
async function choose(page: Page, label: string): Promise<void> {
  const { entries, cursor } = await menu(page);
  const index = entries.findIndex((entry) => entry.label === label);
  expect(index, `${label} is on the page`).toBeGreaterThanOrEqual(0);
  for (let move = 0; move < (index - cursor + entries.length) % entries.length; move++) {
    await press(page, 'ArrowDown');
  }
  expect((await menu(page)).selected).toBe(label);
  await press(page, 'KeyZ');
}

test('Menu opens the main menu: the party, the commands, the gold, the time and the place', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openMenu(page);
  const opened = await menu(page);
  expect(opened).toMatchObject({ page: { kind: 'commands' }, selected: 'Items' });
  expect(opened.entries.map(({ label, enabled }) => [label, enabled])).toEqual([
    ['Items', true],
    ['Skills', true],
    ['Equip', true],
    ['Status', true],
    ['Options', false],
    ['Save', true],
  ]);
  expect(opened.party).toEqual([
    'Rowan Lv 1 HP 60/60 MP 12/12 Next 12',
    'Bram Lv 1 HP 85/85 MP 6/6 Next 12',
  ]);
  expect(opened.info).toEqual(['0 gold', expect.stringMatching(/^0:00:\d\d$/), 'Saltmere']);
  await page.screenshot({ path: 'test-results/screenshots/main-menu.png' });

  // Cancel closes it, and the field carries on where it was.
  await press(page, 'KeyX');
  await arrivedOn(page, 'saltmere');
  expect(await page.evaluate(() => window.__game?.inspect('main-menu'))).toEqual({});
  expect(errors).toEqual([]);
});

test('Items heal whoever they’d help, again until there’s nobody left or none to use', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openMenu(page, () => {
    window.__game?.vitals('rowan', { hp: 5 });
    window.__game?.vitals('bram', { hp: 0 });
    window.__game?.give('potion', 3);
    window.__game?.give('ember-feather');
    window.__game?.give('fire-bomb');
  });
  await choose(page, 'Items');
  const items = await menu(page);
  expect(items.entries.map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Potion', '3', true],
    ['Ember Feather', '1', true],
    // Bombs are for battles.
    ['Fire Bomb', '1', false],
  ]);
  expect(items.info).toEqual(['Restores HP to', 'one ally.']);
  await page.screenshot({ path: 'test-results/screenshots/main-menu-items.png' });

  // A Potion can't help Bram, who's KO'd: the cursor starts on Rowan.
  await choose(page, 'Potion');
  const aiming = await menu(page);
  expect(aiming).toMatchObject({ page: { kind: 'item-on', item: 'potion' }, aimed: ['rowan'] });
  expect(aiming.info).toEqual(['Potion: on', 'whom?']);
  await page.screenshot({ path: 'test-results/screenshots/main-menu-item-on.png' });
  await press(page, 'KeyZ');
  expect((await menu(page)).party[0]).toBe('Rowan Lv 1 HP 55/60 MP 12/12 Next 12');
  // Still hurt: still aiming. Then full, and back to the list.
  await press(page, 'KeyZ');
  expect(await menu(page)).toMatchObject({ page: { kind: 'items' }, selected: 'Potion' });
  expect((await state(page)).inventory.potion).toBe(1);

  // An Ember Feather gets Bram back up, with a quarter of his HP.
  await choose(page, 'Ember Feather');
  expect((await menu(page)).aimed).toEqual(['bram']);
  await press(page, 'KeyZ');
  expect((await state(page)).members.bram).toMatchObject({ hp: 21 });
  expect((await menu(page)).entries.map(({ label }) => label)).toEqual(['Potion', 'Fire Bomb']);
  expect(errors).toEqual([]);
});

test('Equip shows the gear that fits, with the stats it would make, and puts it on', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openMenu(page, () => {
    window.__game?.give('iron-sword');
    window.__game?.give('guard-ring');
  });
  await choose(page, 'Equip');
  expect((await menu(page)).info).toEqual(['Who will change', 'gear?']);
  await press(page, 'KeyZ');
  const slots = await menu(page);
  expect(slots.page).toEqual({ kind: 'equip', member: 'rowan' });
  expect(slots.entries.map(({ label, detail }) => [label, detail])).toEqual([
    ['Weapon', 'Bronze Sword'],
    ['Armor', 'Travel Clothes'],
    ['Accessory', '-'],
  ]);
  await choose(page, 'Weapon');
  const swords = await menu(page);
  expect(swords.entries.map(({ label }) => label)).toEqual(['Iron Sword', 'Remove']);
  // ATK from 16 (12, and 4 for the Bronze Sword) to 21 (9 for the Iron Sword).
  expect(swords.stats).toContain('ATK 16 21');
  expect(swords.stats).toContain('DEF 11 11');
  await page.screenshot({ path: 'test-results/screenshots/main-menu-equip.png' });
  await press(page, 'KeyZ');
  expect(await menu(page)).toMatchObject({ page: { kind: 'equip' }, selected: 'Weapon' });
  expect((await menu(page)).entries[0]).toMatchObject({ detail: 'Iron Sword' });
  const geared = await state(page);
  expect(geared.members.rowan?.equipment).toMatchObject({ weapon: 'iron-sword' });
  expect(geared.inventory).toMatchObject({ 'bronze-sword': 1 });

  // Bram fights with an axe: the swords aren't for him, though the ring is.
  await press(page, 'ArrowRight');
  expect((await menu(page)).page).toEqual({ kind: 'equip', member: 'bram' });
  await choose(page, 'Accessory');
  expect((await menu(page)).entries.map(({ label }) => label)).toEqual(['Guard Ring', 'Remove']);
  expect(errors).toEqual([]);
});

test('Status shows all about a member, and Skills what they know', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await choose(page, 'Status');
  await press(page, 'ArrowDown', 'KeyZ');
  const status = await menu(page);
  expect(status.page).toEqual({ kind: 'status', member: 'bram' });
  expect(status.party).toEqual(['Bram Lv 1 HP 85/85 MP 6/6 Next 12']);
  expect(status.list).toEqual(['Weapon Hand Axe', 'Armor Chain Mail', 'Accessory -']);
  expect(status.info).toEqual(['Skills', 'Shield Bash']);
  await page.screenshot({ path: 'test-results/screenshots/main-menu-status.png' });
  // Left and Right go round the party.
  await press(page, 'ArrowRight');
  expect((await menu(page)).page).toEqual({ kind: 'status', member: 'rowan' });

  // Skills that do nothing outside battle are greyed out, with what they do beside them.
  await press(page, 'KeyX', 'KeyX', 'ArrowUp', 'ArrowUp', 'KeyZ', 'ArrowDown', 'KeyZ');
  const skills = await menu(page);
  expect(skills.page).toEqual({ kind: 'skills', member: 'bram' });
  expect(skills.entries).toEqual([{ label: 'Shield Bash', detail: '3', enabled: false }]);
  expect(skills.info.join(' ')).toBe('A shield blow that knocks the target back in line.');
  // Menu closes it from any page.
  await press(page, 'KeyC');
  await arrivedOn(page, 'saltmere');
  expect(await activeScenes(page)).toEqual(['field']);
  expect(errors).toEqual([]);
});

test.describe('on a phone held sideways (16x9)', () => {
  // A 16:9 phone has no room beside the game, so the touch controls sit over the menu.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 667, height: 375 } });

  /** Taps a touch control: its middle, or towards the edge of the d-pad. */
  async function tap(page: Page, control: 'dpad' | 'a' | 'b' | 'menu', towards?: 'down') {
    const box = await page.locator(`[data-control="${control}"] .touch-art`).boundingBox();
    if (!box) throw new Error(`The ${control} control isn't on screen`);
    const reach = towards === 'down' ? box.height * 0.35 : 0;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 + reach);
    await nextFrames(page);
  }

  test('START opens the main menu, and the touch controls work it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
    await page.evaluate(() => window.__game?.join('bram'));
    await page.evaluate(() => window.__game?.warp('saltmere', 7, 6, 'down'));
    await arrivedOn(page, 'saltmere');
    await tap(page, 'menu');
    await page.waitForFunction(() => window.__game?.activeScenes().join() === 'main-menu');
    await page.screenshot({ path: 'test-results/screenshots/main-menu-phone-16x9.png' });

    // Down to Status, and A for Rowan's.
    for (let move = 0; move < 3; move++) await tap(page, 'dpad', 'down');
    expect((await menu(page)).selected).toBe('Status');
    await tap(page, 'a');
    await tap(page, 'a');
    expect((await menu(page)).page).toEqual({ kind: 'status', member: 'rowan' });
    await page.screenshot({ path: 'test-results/screenshots/main-menu-status-phone-16x9.png' });

    // B goes back a page, and START closes it.
    await tap(page, 'b');
    expect((await menu(page)).page).toEqual({ kind: 'whose', command: 'status' });
    await tap(page, 'menu');
    await arrivedOn(page, 'saltmere');
    expect(errors).toEqual([]);
  });
});
