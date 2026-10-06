import { expect, test, type Page } from '@playwright/test';
import { compileMap } from '../../src/core/map/compile';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { MAPS } from '../../src/data/maps';
import { MAP_CONTENT } from '../../src/data/terrain';

interface MenuInfo {
  title: string;
  cursor: number;
  top: number;
  selected: string;
  items: { label: string; detail: string | null; on: boolean | null; enabled: boolean }[];
  notice: string | null;
  hint: string;
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());
const menu = async (page: Page): Promise<MenuInfo> =>
  (await page.evaluate(() => window.__game?.inspect('debug-menu'))) as unknown as MenuInfo;

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await openTitle(page);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await waitForField(page);
}

/** Waits until the field alone is running, with any fade in over and the player standing still. */
async function waitForField(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    const scenes = window.__game?.activeScenes() ?? [];
    return scenes.join() === 'field' && info?.fading === false && info.moving === false;
  });
}

async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
}

/** One step, waited out. */
async function step(page: Page, key: string): Promise<void> {
  await tapKey(page, key);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
}

async function openMenu(page: Page): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('debug-menu') ?? false);
}

/** Moves the cursor down to `label` on the open page, and chooses it. */
async function choose(page: Page, label: string): Promise<void> {
  const { items, cursor } = await menu(page);
  const index = items.findIndex((item) => item.label === label);
  expect(index, `${label} is on the page`).toBeGreaterThanOrEqual(0);
  const moves = (index - cursor + items.length) % items.length;
  for (let move = 0; move < moves; move++) await tapKey(page, 'ArrowDown');
  expect((await menu(page)).selected).toBe(label);
  await tapKey(page, 'KeyZ');
}

/** Opens the menu, flips one of its switches, and closes it again. */
async function flip(page: Page, label: string): Promise<void> {
  await openMenu(page);
  await choose(page, label);
  await tapKey(page, 'KeyX');
  await waitForField(page);
}

test('the backtick opens the menu over the field, which waits until it closes', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Facing Tamsin, at (10, 8), so a Confirm that got through would start her talking.
  await warp(page, 'test-shore', 10, 7, 'down');
  await openMenu(page);
  expect(await activeScenes(page)).toEqual(['debug-menu']);
  const opened = await menu(page);
  expect(opened).toMatchObject({ title: 'Debug', cursor: 0, selected: 'Warp to a map' });
  expect(opened.items.map(({ label, on }) => [label, on])).toEqual([
    ['Warp to a map', null],
    ['Start a battle', null],
    ['Party', null],
    ['Noclip', false],
    ['Show collision', false],
    ['Battle speed', null],
    ['Encounter rate', null],
    ['Export a save', null],
    ['Import a save', null],
  ]);
  expect(opened.hint).toContain('Z: choose');
  await page.screenshot({ path: 'test-results/screenshots/debug-menu.png' });

  // Up wraps round to the bottom, and the player, underneath, doesn't turn or move.
  await tapKey(page, 'ArrowUp');
  expect((await menu(page)).selected).toBe('Import a save');
  expect(await field(page)).toMatchObject({ x: 10, y: 7, facing: 'down', running: false });

  // Cancel on the first page closes the menu, and the field carries on where it was.
  await tapKey(page, 'KeyX');
  await waitForField(page);
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ x: 10, y: 7, facing: 'down', running: false });
  expect(await page.evaluate(() => window.__game?.inspect('debug-menu'))).toEqual({});
  await step(page, 'ArrowUp');
  expect(await field(page)).toMatchObject({ x: 10, y: 6 });

  // The backtick closes it too.
  await openMenu(page);
  await page.keyboard.press('Backquote');
  await waitForField(page);
  expect(errors).toEqual([]);
});

test('warping picks a map, then where on it, even from the title screen', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await openMenu(page);
  expect(await activeScenes(page)).toEqual(['debug-menu']);

  await choose(page, 'Warp to a map');
  const maps = await menu(page);
  expect(maps.title).toBe('Warp to');
  expect(maps.items.map(({ label, detail }) => [label, detail])).toEqual(
    Object.values(MAPS).map((map) => [map.name, map.id]),
  );
  await page.screenshot({ path: 'test-results/screenshots/debug-menu-warp.png' });

  // Cancel goes back a page, to the cursor as it was.
  await tapKey(page, 'KeyX');
  expect(await menu(page)).toMatchObject({ title: 'Debug', selected: 'Warp to a map' });
  await choose(page, 'Warp to a map');

  await choose(page, 'Test House');
  const spawns = await menu(page);
  expect(spawns.title).toBe('Test House');
  expect(spawns.items.map(({ label, detail }) => [label, detail])).toEqual([
    ['door', '4, 5'],
    ['stairs', '7, 3'],
  ]);
  await choose(page, 'stairs');
  // The menu closes and the title is gone: just the field, at the stairs.
  await waitForField(page);
  expect(await field(page)).toMatchObject({ map: 'test-house', x: 7, y: 3, facing: 'down' });
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ running: false, leaving: false });
  expect(errors).toEqual([]);
});

test('noclip walks through water, trees and people, but not off the map', async ({ page }) => {
  const errors = watchErrors(page);
  // The pond starts just right of (12, 6), and Tamsin stands at (10, 8).
  await warp(page, 'test-shore', 12, 6, 'right');
  expect((await field(page))?.blocked).toMatchObject({ right: true });

  await flip(page, 'Noclip');
  expect(await field(page)).toMatchObject({ noclip: true, blocked: { right: false } });
  await step(page, 'ArrowRight');
  expect(await field(page)).toMatchObject({ x: 13, y: 6 });
  await page.screenshot({ path: 'test-results/screenshots/debug-noclip-pond.png' });
  await step(page, 'ArrowRight');
  expect(await field(page)).toMatchObject({ x: 14, y: 6 });

  // Through Tamsin, and into the tree trunks at (6, 7) and (7, 7).
  await page.evaluate(() => window.__game?.warp('test-shore', 10, 7, 'down'));
  await waitForField(page);
  await step(page, 'ArrowDown');
  expect(await field(page)).toMatchObject({ x: 10, y: 8 });
  await page.evaluate(() => window.__game?.warp('test-shore', 8, 7, 'left'));
  await waitForField(page);
  await step(page, 'ArrowLeft');
  expect(await field(page)).toMatchObject({ x: 7, y: 7 });

  // The trees along the west edge give way, but the edge itself, which leads nowhere, doesn't.
  await page.evaluate(() => window.__game?.warp('test-shore', 1, 10, 'left'));
  await waitForField(page);
  await step(page, 'ArrowLeft');
  expect(await field(page)).toMatchObject({ x: 0, y: 10, blocked: { left: true } });
  await step(page, 'ArrowLeft');
  expect(await field(page)).toMatchObject({ x: 0, y: 10, map: 'test-shore' });

  // Off again, the pond is in the way again.
  await flip(page, 'Noclip');
  await page.evaluate(() => window.__game?.warp('test-shore', 12, 6, 'right'));
  await waitForField(page);
  expect(await field(page)).toMatchObject({ noclip: false, blocked: { right: true } });
  expect(errors).toEqual([]);
});

/** What the collision view should mark on a map: everything but the people, who move about. */
function expectedMarks(id: string) {
  const def = MAPS[id];
  if (!def) throw new Error(`There's no map called ${id}`);
  const map = compileMap(def, MAP_CONTENT);
  return {
    solid: map.solid.filter(Boolean).length,
    waysOut: map.warps.filter(Boolean).length,
    openEdges: Object.keys(map.edges),
    spawns: Object.keys(map.spawns).length,
  };
}

test('show collision marks solid cells, ways out, spawns and people, on every map', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Just below the house's door.
  await warp(page, 'test-shore', 18, 4, 'up');
  expect((await field(page))?.collision).toBeNull();

  await flip(page, 'Show collision');
  const shore = (await field(page))?.collision as Record<string, number>;
  expect(shore).toMatchObject(expectedMarks('test-shore'));
  expect(expectedMarks('test-shore')).toMatchObject({ waysOut: 1, openEdges: ['east'] });
  // Five people, and the cells the wanderers are stepping out of.
  expect(shore.people).toBeGreaterThanOrEqual(5);
  expect(shore.people).toBeLessThanOrEqual(10);
  await page.screenshot({ path: 'test-results/screenshots/debug-collision-shore.png' });

  // It stays on through a door, marking the new map.
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__game?.inspect('field')?.map === 'test-house');
  await waitForField(page);
  expect((await field(page))?.collision).toEqual({ ...expectedMarks('test-house'), people: 1 });
  await page.screenshot({ path: 'test-results/screenshots/debug-collision-house.png' });

  await flip(page, 'Show collision');
  expect((await field(page))?.collision).toBeNull();

  // The hook tests use does the same as the menu. By the shore's east edge, which leads on.
  await page.evaluate(() => window.__game?.showCollision(true));
  await page.evaluate(() => window.__game?.warp('test-shore', 37, 14, 'right'));
  await waitForField(page);
  expect((await field(page))?.collision).toMatchObject({ openEdges: ['east'] });
  await page.screenshot({ path: 'test-results/screenshots/debug-collision-edge.png' });
  await page.evaluate(() => window.__game?.showCollision(false));
  await nextFrames(page);
  expect((await field(page))?.collision).toBeNull();
  expect(errors).toEqual([]);
});

test('the party page sets levels and gear, gives items, and rests the party', async ({ page }) => {
  const errors = watchErrors(page);
  await warp(page, 'test-shore', 10, 7, 'down');
  await page.evaluate(() => window.__game?.vitals('rowan', { hp: 5 }));
  const state = async () => (await page.evaluate(() => window.__game?.state())) ?? null;
  await openMenu(page);
  await choose(page, 'Party');
  expect((await menu(page)).items.map(({ label, detail }) => [label, detail])).toEqual([
    ['Rowan', 'Lv 1'],
    ['Join the party', null],
    ['Give an item', null],
    ['Give gold', '0 gold'],
    ['Rest', 'full HP and MP'],
  ]);

  // Rowan to level 5, with the EXP it takes, still hurt.
  await choose(page, 'Rowan');
  await choose(page, 'Level');
  await choose(page, 'Level 5');
  expect((await state())?.members.rowan).toMatchObject({ level: 5, exp: 384, hp: 5 });
  await tapKey(page, 'KeyX');

  // An Iron Sword, out of thin air: the Bronze Sword goes into the inventory.
  await choose(page, 'Weapon');
  expect(
    (await menu(page)).items.map(({ label, detail, enabled }) => [label, detail, enabled]),
  ).toEqual([
    ['Bronze Sword', 'worn', false],
    ['Iron Sword', 'ATK +9', true],
    ['Nothing', null, true],
  ]);
  await choose(page, 'Iron Sword');
  await tapKey(page, 'KeyX');
  expect((await state())?.members.rowan?.equipment).toEqual({
    weapon: 'iron-sword',
    armor: 'travel-clothes',
  });
  expect((await state())?.inventory).toEqual({ 'bronze-sword': 1 });
  expect((await menu(page)).items.map(({ label, detail }) => [label, detail])).toEqual([
    ['Level', '5'],
    ['Weapon', 'Iron Sword'],
    ['Armor', 'Travel Clothes'],
    ['Accessory', 'nothing'],
  ]);
  await page.screenshot({ path: 'test-results/screenshots/debug-menu-member.png' });

  // A Fire Bomb, and a rest.
  await tapKey(page, 'KeyX');
  await choose(page, 'Give an item');
  await choose(page, 'Fire Bomb');
  expect((await state())?.inventory).toMatchObject({ 'fire-bomb': 1 });
  await tapKey(page, 'KeyX');
  await choose(page, 'Rest');
  expect((await menu(page)).notice).toBe('Everyone is back to full HP and MP.');
  expect((await state())?.members.rowan).not.toHaveProperty('hp');
  expect((await menu(page)).items[0]).toMatchObject({ label: 'Rowan', detail: 'Lv 5' });

  // The hooks the tests use do the same as the menu.
  await page.evaluate(() => {
    window.__game?.join('bram');
    window.__game?.setLevel(10);
    window.__game?.setLevel(3, 'bram');
    window.__game?.equip('rowan', 'guard-ring');
  });
  expect((await state())?.members).toMatchObject({
    rowan: { level: 10, exp: 2916, equipment: { accessory: 'guard-ring' } },
    bram: { level: 3, exp: 68 },
  });
  expect(errors).toEqual([]);
});

test('a battle can be built against anyone, in front of any backdrop, with a first turn', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await warp(page, 'test-shore', 10, 7, 'down');
  await openMenu(page);
  // Battles at 4x: the speed goes round from 1x.
  for (const speed of ['2x', '3x', '4x']) {
    await choose(page, 'Battle speed');
    expect((await menu(page)).items[5]).toMatchObject({ label: 'Battle speed', detail: speed });
  }

  await choose(page, 'Start a battle');
  await choose(page, 'Build a battle');
  await choose(page, 'Add an enemy');
  for (const enemy of ['Cave Bat', 'Cave Bat', 'Wolf']) await choose(page, enemy);
  expect((await menu(page)).notice).toBe('Added Wolf: 3 of 6.');
  await tapKey(page, 'KeyX');
  await choose(page, 'Backdrop');
  await choose(page, 'First turn');
  await choose(page, 'First turn');
  const built = await menu(page);
  expect(built.items.map(({ label, detail }) => [label, detail])).toEqual([
    ['Fight', 'Cave Bat x2, Wolf'],
    ['Backdrop', 'shore'],
    ['First turn', 'The enemies'],
    ['Add an enemy', '3 of 6'],
    ['Cave Bat', 'take out'],
    ['Cave Bat', 'take out'],
    ['Wolf', 'take out'],
  ]);
  await page.screenshot({ path: 'test-results/screenshots/debug-menu-build-battle.png' });

  // Over the field, as any battle from the debug menu: the enemies get the jump.
  await choose(page, 'Fight');
  await page.waitForFunction(() => window.__game?.inspect('battle')?.banner === 'Ambush!');
  expect(await activeScenes(page)).toEqual(['battle']);
  const battle = (await page.evaluate(() => window.__game?.inspect('battle'))) as {
    backdrop: string;
    fighters: { name: string }[];
  };
  expect(battle.backdrop).toBe('shore');
  expect(battle.fighters.map(({ name }) => name)).toEqual([
    'Rowan',
    'Cave Bat A',
    'Cave Bat B',
    'Wolf',
  ]);

  // The menu keeps the battle it built, to fight again.
  await openMenu(page);
  await choose(page, 'Start a battle');
  await choose(page, 'Build a battle');
  expect((await menu(page)).items[0]).toMatchObject({
    label: 'Fight',
    detail: 'Cave Bat x2, Wolf',
  });
  expect(errors).toEqual([]);
});
