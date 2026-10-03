import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import { SAVE_VERSION, type SaveFile } from '../../src/core/save';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';

interface SlotInfo {
  slot: 'autosave' | number;
  label: string;
  enabled: boolean;
  kind: 'empty' | 'saved' | 'unreadable';
  party: string[];
  place?: string;
  level?: string;
  playTime?: string;
  savedAt?: string;
  note?: string;
}

interface SaveMenuInfo {
  mode: 'save' | 'load';
  cursor: number;
  selected: string;
  overwrite: 'Yes' | 'No' | null;
  bottomLine: string;
  slots: SlotInfo[];
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
const saveMenu = async (page: Page): Promise<SaveMenuInfo> =>
  (await page.evaluate(() => window.__game?.inspect('save-menu'))) as unknown as SaveMenuInfo;
const state = async (page: Page): Promise<GameState> => {
  const current = await page.evaluate(() => window.__game?.state());
  if (!current) throw new Error('No game state: is window.__game installed?');
  return current;
};

/** What a slot holds in localStorage, as the game wrote it. */
async function stored(page: Page, slot: 'autosave' | number): Promise<SaveFile | null> {
  const text = await page.evaluate((key) => localStorage.getItem(key), `fifth-flame:save:${slot}`);
  return text === null ? null : (JSON.parse(text) as SaveFile);
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

const title = async (page: Page) =>
  (await page.evaluate(() => window.__game?.inspect('title'))) as {
    selected: string;
    items: { label: string; enabled: boolean }[];
  };

/** Waits until the field alone is running on `map`, with any fade over and the player still. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    const scenes = window.__game?.activeScenes() ?? [];
    return scenes.join() === 'field' && info?.map === id && info.fading === false && !info.moving;
  }, map);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
}

/** Steps one cell (or turns, if the way is blocked) and waits for the step to end. */
async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await tapKey(page, key);
    await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  }
}

/** Presses Menu on the field, and waits for the save menu. */
async function openSaveMenu(page: Page): Promise<void> {
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
}

/** Moves the cursor to a slot, by its label, and presses Confirm. */
async function choose(page: Page, label: string): Promise<void> {
  const { slots, cursor } = await saveMenu(page);
  const index = slots.findIndex((slot) => slot.label === label);
  expect(index, `${label} is in the menu`).toBeGreaterThanOrEqual(0);
  const moves = (index - cursor + slots.length) % slots.length;
  for (let move = 0; move < moves; move++) await tapKey(page, 'ArrowDown');
  expect((await saveMenu(page)).selected).toBe(label);
  await tapKey(page, 'KeyZ');
}

/** Says a line and waits for it to type out, then closes it. */
async function readOn(page: Page, text: string): Promise<void> {
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
  await tapKey(page, 'KeyZ');
}

test('a game saved in a slot carries on from right there after the page reloads', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Nothing saved yet: Continue can't be chosen.
  expect(await title(page)).toMatchObject({
    selected: 'New Game',
    items: [
      { label: 'New Game', enabled: true },
      { label: 'Continue', enabled: false },
      { label: 'Options', enabled: false },
    ],
  });

  // In Tamsin's house, facing the chest at the foot of Rowan's bed: open it.
  await warp(page, 'saltmere-tamsin', 2, 3, 'left');
  await tapKey(page, 'KeyZ');
  await readOn(page, 'Found Potion!');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);

  await openSaveMenu(page);
  const menu = await saveMenu(page);
  expect(menu).toMatchObject({
    mode: 'save',
    selected: 'Slot 1',
    overwrite: null,
    bottomLine: 'Z: save   X: back',
  });
  expect(menu.slots.map(({ label, enabled, kind }) => [label, enabled, kind])).toEqual([
    ['Autosave', false, 'empty'],
    ['Slot 1', true, 'empty'],
    ['Slot 2', true, 'empty'],
    ['Slot 3', true, 'empty'],
  ]);
  await page.screenshot({ path: 'test-results/screenshots/save-menu-empty.png' });

  await tapKey(page, 'KeyZ');
  const after = await saveMenu(page);
  expect(after.bottomLine).toBe('Saved in Slot 1.');
  expect(after.slots[1]).toMatchObject({
    kind: 'saved',
    party: ['rowan'],
    place: "Tamsin's House",
    level: 'Lv 1',
  });
  expect(after.slots[1]?.playTime).toMatch(/^0:00:\d\d$/);
  expect(after.slots[1]?.savedAt).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d$/);
  await page.screenshot({ path: 'test-results/screenshots/save-menu-saved.png' });
  const saved = await stored(page, 1);
  expect(saved).toMatchObject({
    version: SAVE_VERSION,
    state: {
      location: { map: 'saltmere-tamsin', x: 2, y: 3, facing: 'left' },
      inventory: { potion: 1 },
      flags: { 'chest.saltmere-tamsin-01': true },
    },
  });

  // Back to the field, just as it was.
  await tapKey(page, 'KeyX');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await field(page)).toMatchObject({ x: 2, y: 3, facing: 'left' });
  // Wander off, which the save doesn't know about, and reload.
  await step(page, 'ArrowDown', 2);
  await toTitle(page);

  // Continue is there now, and the cursor starts on it.
  expect(await title(page)).toMatchObject({
    selected: 'Continue',
    items: [
      { label: 'New Game', enabled: true },
      { label: 'Continue', enabled: true },
      { label: 'Options', enabled: false },
    ],
  });
  await page.screenshot({ path: 'test-results/screenshots/title-continue.png' });
  await tapKey(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  const load = await saveMenu(page);
  expect(load).toMatchObject({ mode: 'load', selected: 'Slot 1', bottomLine: 'Z: load   X: back' });
  expect(load.slots.map(({ label, enabled }) => [label, enabled])).toEqual([
    ['Autosave', false],
    ['Slot 1', true],
    ['Slot 2', false],
    ['Slot 3', false],
  ]);
  await page.screenshot({ path: 'test-results/screenshots/load-menu.png' });

  await tapKey(page, 'KeyZ');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await field(page)).toMatchObject({ x: 2, y: 3, facing: 'left', running: false });
  const loaded = await state(page);
  expect(loaded).toMatchObject({
    inventory: { potion: 1 },
    flags: { 'chest.saltmere-tamsin-01': true },
  });
  expect(loaded.playTimeMs).toBeGreaterThanOrEqual(saved?.state.playTimeMs ?? Infinity);
  // The chest is still open, and empty.
  await tapKey(page, 'KeyZ');
  await readOn(page, 'The chest is empty.');
  expect(errors).toEqual([]);
});

test('saving over a save asks first, and No keeps the one that was there', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'test-shore', 10, 12, 'down');
  await openSaveMenu(page);
  await choose(page, 'Slot 2');
  const first = await stored(page, 2);
  expect(first?.state.location).toEqual({ map: 'test-shore', x: 10, y: 12, facing: 'down' });
  await tapKey(page, 'KeyX');
  await arrivedOn(page, 'test-shore');

  await step(page, 'ArrowRight', 2);
  await openSaveMenu(page);
  // The cursor starts on the slot saved in last. Saving there again asks first, on Yes.
  expect((await saveMenu(page)).selected).toBe('Slot 2');
  await tapKey(page, 'KeyZ');
  expect(await saveMenu(page)).toMatchObject({ overwrite: 'Yes', bottomLine: 'Save over Slot 2?' });
  await page.screenshot({ path: 'test-results/screenshots/save-menu-overwrite.png' });

  // No: nothing is saved, and the cursor is back on the slots.
  await tapKey(page, 'ArrowDown');
  expect((await saveMenu(page)).overwrite).toBe('No');
  await tapKey(page, 'KeyZ');
  expect(await saveMenu(page)).toMatchObject({ overwrite: null, selected: 'Slot 2' });
  expect(await stored(page, 2)).toEqual(first);

  // Cancel says no too.
  await tapKey(page, 'KeyZ');
  await tapKey(page, 'KeyX');
  expect(await saveMenu(page)).toMatchObject({ overwrite: null, selected: 'Slot 2' });
  expect(await stored(page, 2)).toEqual(first);

  // Yes saves over it.
  await tapKey(page, 'KeyZ');
  await tapKey(page, 'KeyZ');
  expect((await saveMenu(page)).bottomLine).toBe('Saved in Slot 2.');
  expect((await stored(page, 2))?.state.location).toEqual({
    map: 'test-shore',
    x: 12,
    y: 12,
    facing: 'right',
  });

  // The autosave slot can't be saved in.
  await tapKey(page, 'ArrowUp');
  await tapKey(page, 'ArrowUp');
  expect((await saveMenu(page)).selected).toBe('Autosave');
  await tapKey(page, 'KeyZ');
  expect(await stored(page, 'autosave')).toBeNull();
  // Menu closes it, like Cancel.
  await tapKey(page, 'KeyC');
  await arrivedOn(page, 'test-shore');
  expect(errors).toEqual([]);
});

test('every map change saves to the autosave, which Continue can load', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'saltmere', 7, 6, 'up');
  // A warp isn't a map change made by playing.
  expect(await stored(page, 'autosave')).toBeNull();

  // In through Tamsin's door: saved as the player arrives.
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  expect((await stored(page, 'autosave'))?.state.location).toEqual({
    map: 'saltmere-tamsin',
    x: 5,
    y: 6,
    facing: 'up',
  });
  await step(page, 'ArrowRight');
  // Walking about inside doesn't save.
  expect((await stored(page, 'autosave'))?.state.location).toMatchObject({ x: 5 });
  await step(page, 'ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await arrivedOn(page, 'saltmere');
  const autosave = await stored(page, 'autosave');
  expect(autosave?.state.location).toEqual({ map: 'saltmere', x: 7, y: 6, facing: 'down' });

  await toTitle(page);
  expect((await title(page)).selected).toBe('Continue');
  await tapKey(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  const load = await saveMenu(page);
  expect(load.selected).toBe('Autosave');
  expect(load.slots[0]).toMatchObject({ enabled: true, place: 'Saltmere', level: 'Lv 1' });
  await tapKey(page, 'KeyZ');
  await arrivedOn(page, 'saltmere');
  expect(await field(page)).toMatchObject({ x: 7, y: 6, facing: 'down' });
  expect(await state(page)).toMatchObject({ ...autosave?.state, playTimeMs: expect.any(Number) });
  expect(errors).toEqual([]);
});

test('a script that takes the player somewhere autosaves once it has finished', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Seen the square's hello already, and standing below the guide.
  await page.evaluate(() => window.__game?.setFlag('test.square-seen'));
  await warp(page, 'test-square', 5, 4, 'up');

  // The guide walks off, comes back and sends the player to the corner, then sets a flag.
  await tapKey(page, 'KeyZ');
  await readOn(page, 'Watch this: I walk wherever a script tells me to.');
  await readOn(page, 'And I can send you somewhere else. Close your eyes...');
  // In the corner, fading back in with the script still running: nothing's saved yet. (Checked
  // in the page, every frame, so the fade can't end between looking and reading the save.)
  const midway = await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    const save = localStorage.getItem('fifth-flame:save:autosave');
    return info?.y === 2 && info.running === true && { save };
  });
  expect(await midway.jsonValue()).toEqual({ save: null });
  // Once it's over, the autosave has all it did.
  await page.waitForFunction(() => window.__game?.state().flags['test.guide-done'] === true);
  const autosave = await stored(page, 'autosave');
  expect(autosave?.state).toMatchObject({
    location: { map: 'test-square', x: 8, y: 2, facing: 'down' },
    flags: { 'test.square-seen': true, 'test.guide-done': true },
  });
  // The cheer that runs straight after isn't in it.
  expect(autosave?.state.flags).not.toHaveProperty('test.cheered');
  await readOn(page, 'Ta-da! I said that all by myself, as soon as a flag was set.');
  expect(errors).toEqual([]);
});

test('Menu opens the save menu only when the player can act: not in a conversation, and not mid-step', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // Facing Tamsin, at (10, 8).
  await warp(page, 'test-shore', 10, 7, 'down');
  await tapKey(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await tapKey(page, 'KeyC');
  await nextFrames(page);
  expect(await activeScenes(page)).not.toContain('save-menu');
  // Nor once the conversation is over.
  await tapKey(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  await nextFrames(page);
  await nextFrames(page);
  expect(await activeScenes(page)).toEqual(['field']);

  // Walking, Menu lets the step finish, then stops there and opens the menu.
  await warp(page, 'test-shore', 10, 12, 'right');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === true);
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  const stopped = await field(page);
  expect(stopped).toMatchObject({ y: 12, moving: false });
  expect(stopped?.x).toBeGreaterThan(10);
  await page.keyboard.up('ArrowRight');
  await tapKey(page, 'KeyX');
  await arrivedOn(page, 'test-shore');
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ x: stopped?.x, y: 12, moving: false });
  expect(errors).toEqual([]);
});

test('saves that can’t be loaded say so, and can be saved over', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => {
    localStorage.setItem('fifth-flame:save:1', '{"version": 1, "savedAt": "2026-10-');
    const newer = { version: 99, savedAt: '2027-05-01T10:00:00.000Z', state: { hovercraft: 1 } };
    localStorage.setItem('fifth-flame:save:3', JSON.stringify(newer));
  });
  await toTitle(page);
  // There's something to show, so Continue is there, though nothing in it can be loaded.
  expect(await title(page)).toMatchObject({ selected: 'Continue' });
  await tapKey(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'save-menu');
  const load = await saveMenu(page);
  expect(load.slots.map(({ label, enabled, kind, note }) => [label, enabled, kind, note])).toEqual([
    ['Autosave', false, 'empty', 'Empty'],
    ['Slot 1', false, 'unreadable', "Can't be loaded"],
    ['Slot 2', false, 'empty', 'Empty'],
    ['Slot 3', false, 'unreadable', 'Saved by a newer version'],
  ]);
  await page.screenshot({ path: 'test-results/screenshots/load-menu-unreadable.png' });
  await tapKey(page, 'ArrowDown');
  await tapKey(page, 'KeyZ');
  expect(await activeScenes(page)).toEqual(['save-menu']);
  // Cancel goes back to the title.
  await tapKey(page, 'KeyX');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'title');
  expect((await title(page)).selected).toBe('Continue');

  // Saving over the damaged one asks first, like any other.
  await warp(page, 'test-shore', 10, 12, 'down');
  await openSaveMenu(page);
  await choose(page, 'Slot 1');
  expect((await saveMenu(page)).overwrite).toBe('Yes');
  await tapKey(page, 'KeyZ');
  expect((await saveMenu(page)).slots[1]).toMatchObject({ kind: 'saved', place: 'Test Shore' });
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  // The names go in screenshot file names, which CI's artifact upload won't take with a colon.
  for (const [name, viewport] of [
    ['wide', { width: 844, height: 390 }],
    ['16x9', { width: 667, height: 375 }],
  ] as const) {
    test.describe(`held sideways (${name})`, () => {
      test.use({ hasTouch: true, isMobile: true, viewport });

      test('the save menu shows the touch controls’ buttons', async ({ page }) => {
        const errors = watchErrors(page);
        await toTitle(page);
        await warp(page, 'saltmere', 7, 6, 'down');
        await page.evaluate(() => window.__game?.give('potion'));
        await openSaveMenu(page);
        expect((await saveMenu(page)).bottomLine).toBe('A: save   B: back');
        await tapKey(page, 'KeyZ');
        await page.screenshot({ path: `test-results/screenshots/save-menu-phone-${name}.png` });
        expect(errors).toEqual([]);
      });
    });
  }
});

interface DebugMenuInfo {
  title: string;
  cursor: number;
  selected: string;
  notice: string | null;
  items: { label: string; detail: string | null; enabled: boolean }[];
}

const debugMenu = async (page: Page): Promise<DebugMenuInfo> =>
  (await page.evaluate(() => window.__game?.inspect('debug-menu'))) as unknown as DebugMenuInfo;

/** Opens the debug menu, and goes to one of its pages. */
async function debugPage(page: Page, label: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('debug-menu') ?? false);
  await chooseInDebugMenu(page, label);
}

/** Moves the debug menu's cursor down to `label`, and chooses it. */
async function chooseInDebugMenu(page: Page, label: string): Promise<void> {
  const { items, cursor } = await debugMenu(page);
  const index = items.findIndex((item) => item.label === label);
  expect(index, `${label} is on the page`).toBeGreaterThanOrEqual(0);
  const moves = (index - cursor + items.length) % items.length;
  for (let move = 0; move < moves; move++) await tapKey(page, 'ArrowDown');
  expect((await debugMenu(page)).selected).toBe(label);
  await tapKey(page, 'KeyZ');
}

test('the debug menu exports a save to a file, and imports one into any slot', async ({
  page,
}, testInfo) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await warp(page, 'saltmere-tamsin', 2, 3, 'left');
  await openSaveMenu(page);
  await tapKey(page, 'KeyZ');
  await tapKey(page, 'KeyX');
  await arrivedOn(page, 'saltmere-tamsin');

  await debugPage(page, 'Export a save');
  const exporting = await debugMenu(page);
  expect(exporting.title).toBe('Export');
  expect(exporting.items.map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Autosave', 'empty', false],
    ['Slot 1', expect.stringMatching(/^Tamsin's House, 0:00:\d\d$/), true],
    ['Slot 2', 'empty', false],
    ['Slot 3', 'empty', false],
  ]);
  const download = page.waitForEvent('download');
  await chooseInDebugMenu(page, 'Slot 1');
  const file = await download;
  expect(file.suggestedFilename()).toBe('fifth-flame-slot-1.json');
  const exported = testInfo.outputPath('fifth-flame-slot-1.json');
  await file.saveAs(exported);
  const text = readFileSync(exported, 'utf8');
  expect(JSON.parse(text)).toEqual(await stored(page, 1));
  // Indented, for people to read.
  expect(text).toContain('\n  "state": {');
  expect((await debugMenu(page)).notice).toBe('Exported Slot 1.');
  await page.screenshot({ path: 'test-results/screenshots/debug-menu-export.png' });

  // Back, and import it into slot 3.
  await tapKey(page, 'KeyX');
  await chooseInDebugMenu(page, 'Import a save');
  expect((await debugMenu(page)).title).toBe('Import into');
  const picking = page.waitForEvent('filechooser');
  await chooseInDebugMenu(page, 'Slot 3');
  await (await picking).setFiles(exported);
  await page.waitForFunction(
    () => window.__game?.inspect('debug-menu')?.notice === 'Imported into Slot 3.',
  );
  expect(await stored(page, 3)).toEqual(await stored(page, 1));
  expect((await debugMenu(page)).items[3]?.detail).toMatch(/^Tamsin's House, /);

  // Something that isn't a save leaves the slot as it was.
  const notSave = testInfo.outputPath('shopping-list.json');
  writeFileSync(notSave, '{ "eggs": 6, "flour": "1 kg" }');
  const pickingAgain = page.waitForEvent('filechooser');
  await tapKey(page, 'KeyZ');
  await (await pickingAgain).setFiles(notSave);
  await page.waitForFunction(() =>
    String(window.__game?.inspect('debug-menu')?.notice).startsWith("Can't import that"),
  );
  expect((await debugMenu(page)).notice).toBe("Can't import that: it's damaged, or not a save.");
  await page.screenshot({ path: 'test-results/screenshots/debug-menu-import-failed.png' });
  expect(await stored(page, 3)).toEqual(await stored(page, 1));
  expect(errors).toEqual([]);
});
