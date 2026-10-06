import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';
import { BATTLE_POSES } from '../../src/systems/character-frames';
import type { AudioInfo } from '../../src/systems/audio';
import { MENU_SOUNDS } from '../../src/ui/menu-sound';

// Battles take a while to play out, even at 4×, more so with other tests running beside them.
test.describe.configure({ timeout: 60_000 });

interface BattleInfo {
  outcome: string;
  choosing: boolean;
  waiting: boolean;
  banner: string | null;
  victory: string[];
  rewards: { exp: number; gold: number; items: Record<string, number> } | null;
  levelUps: { id: string; level: number }[];
  timeline: { id: string }[];
  status: string[];
  fighters: { id: string; hp: number; frame: number | null }[];
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const info = async (page: Page): Promise<BattleInfo> =>
  (await page.evaluate(() => window.__game?.inspect('battle'))) as unknown as BattleInfo;
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
const audio = async (page: Page): Promise<AudioInfo> =>
  (await page.evaluate(() => window.__game?.audio())) as AudioInfo;

/** The jingles playing: every sound effect playing but a menu's, which come with every press. */
const jingles = (info: AudioInfo): string[] =>
  info.playing.filter((key) => !Object.values<string>(MENU_SOUNDS).includes(key));

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

/**
 * Opens the game at the title, with Bram in the party beside Rowan, and battles at the debug
 * menu's 4× speed, so the tests aren't kept waiting.
 */
async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => {
    window.__game?.battleSpeed(4);
    window.__game?.join('bram');
  });
}

/** Waits until the menu is waiting for the player, or the battle for Confirm, once it's over. */
async function waitForPlayer(page: Page): Promise<BattleInfo> {
  await page.waitForFunction(
    () => {
      const battle = window.__game?.inspect('battle');
      return battle?.choosing === true || battle?.waiting === true;
    },
    undefined,
    { timeout: 30_000 },
  );
  return info(page);
}

/** Attacks the first enemy standing every turn, until the battle waits for Confirm at its end. */
async function attackUntilOver(page: Page): Promise<BattleInfo> {
  for (let turn = 0; turn < 60; turn++) {
    const battle = await waitForPlayer(page);
    if (battle.waiting) return battle;
    await press(page, 'KeyZ', 'KeyZ');
  }
  throw new Error('The battle went on too long');
}

/** Presses Confirm through the victory panel's pages, and waits for the field. */
async function backToField(page: Page): Promise<void> {
  for (let shown = 0; shown < 10; shown++) {
    if ((await page.evaluate(() => window.__game?.activeScenes().join())) === 'field') return;
    await press(page, 'KeyZ');
  }
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'field');
}

test('a battle won shows what the party gained, a page at a time, and they keep it', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.battle(['wolf', 'wolf'], { seed: 1 }));
  const won = await attackUntilOver(page);
  // Two Wolves give 6 EXP and 5 gold each, which takes everyone to level 2.
  expect(won).toMatchObject({ banner: 'Victory!', rewards: { exp: 12, gold: 10 } });
  expect(won.levelUps).toEqual([
    { id: 'rowan', level: 2 },
    { id: 'bram', level: 2 },
  ]);
  const drops = Object.keys(won.rewards?.items ?? {}).length > 0 ? 1 : 0;
  expect(won.victory.slice(0, 2)).toEqual(['Gained 12 EXP.', 'Found 10 gold.']);
  expect(won.victory).toHaveLength(2 + drops);
  // The battle's music gives way to the victory jingle.
  const fanfare = await audio(page);
  expect(fanfare.sounds).toContain('sfx.victory');
  expect(jingles(fanfare)).toEqual(['sfx.victory']);
  expect(fanfare.music).toBeNull();
  await page.screenshot({ path: 'test-results/screenshots/rewards-spoils.png' });

  // Then a page for each level-up, with a jingle: what it raised, and any skill learned.
  await press(page, 'KeyZ');
  const rowan = await info(page);
  expect(rowan.victory).toEqual([
    'Rowan reached level 2!',
    'HP +28 MP +3 ATK +3 DEF +2',
    'MAG +2 RES +2',
  ]);
  // The level-up jingle cuts the victory jingle short.
  expect(jingles(await audio(page))).toEqual(['sfx.level-up']);
  await page.screenshot({ path: 'test-results/screenshots/rewards-level-up.png' });
  await press(page, 'KeyZ');
  const bram = await info(page);
  expect(bram.victory[0]).toBe('Bram reached level 2!');
  expect(bram.victory.at(-1)).toBe('Learned Provoke!');

  await backToField(page);
  const after = await state(page);
  expect(after.members.rowan).toMatchObject({ level: 2, exp: 12 });
  expect(after.members.bram).toMatchObject({ level: 2, exp: 12 });
  expect(after.gold).toBe(10);
  // The field's music comes back.
  await page.waitForFunction(() => window.__game?.audio().music === 'bgm.saltmere');
  expect(errors).toEqual([]);
});

test('HP and MP carry over between battles; the KO’d start down, and get up after a win', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 20, mp: 5 });
    window.__game?.vitals('bram', { hp: 0 });
    window.__game?.give('fire-bomb');
    window.__game?.battle(['wolf'], { seed: 1, start: 'preemptive' });
  });
  const start = await waitForPlayer(page);
  expect(start.status).toEqual(['Rowan HP 20/60 MP 5', 'Bram HP 0/85 MP 6']);
  // Bram lies where they fell, off the timeline.
  expect(start.fighters.find(({ id }) => id === 'bram')?.frame).toBe(BATTLE_POSES.down);
  expect(start.timeline.map(({ id }) => id)).not.toContain('bram');
  await page.screenshot({ path: 'test-results/screenshots/rewards-down-at-start.png' });

  // Rowan throws the Fire Bomb at the Wolf, which is weak to fire: it's over at once.
  await press(page, 'ArrowDown', 'ArrowDown', 'KeyZ', 'KeyZ', 'KeyZ');
  const won = await waitForPlayer(page);
  expect(won).toMatchObject({ outcome: 'victory', waiting: true });
  expect(won.victory[0]).toBe('Gained 6 EXP.');
  await backToField(page);

  // Rowan is as the battle left them; Bram got back up with 1 HP; the Bomb is gone.
  const vitals = await page.evaluate(() => ({
    rowan: window.__game?.vitals('rowan'),
    bram: window.__game?.vitals('bram'),
  }));
  expect(vitals.rowan?.now).toEqual({ hp: 20, mp: 5 });
  expect(vitals.bram?.now).toEqual({ hp: 1, mp: 6 });
  expect((await state(page)).inventory).not.toHaveProperty('fire-bomb');

  // The next battle starts with them as they are.
  await page.evaluate(() => window.__game?.battle(['wolf'], { seed: 2 }));
  expect((await waitForPlayer(page)).status).toEqual(['Rowan HP 20/60 MP 5', 'Bram HP 1/85 MP 6']);
  expect(errors).toEqual([]);
});

test('resting in Rowan’s bed puts the party back on its feet', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => {
    window.__game?.vitals('rowan', { hp: 5, mp: 0 });
    window.__game?.vitals('bram', { hp: 0 });
    // Beside Rowan's bed, in Tamsin's house, facing it.
    window.__game?.warp('saltmere-tamsin', 2, 1, 'left');
  });
  await page.waitForFunction(() => {
    const field = window.__game?.inspect('field');
    return field?.map === 'saltmere-tamsin' && field.fading === false;
  });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  expect((await page.evaluate(() => window.__game?.inspect('dialogue')))?.text).toBe(
    "Rowan's bed, still unmade. A rest would do the party good.",
  );
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 2,
  );
  await page.screenshot({ path: 'test-results/screenshots/rewards-bed.png' });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(
    () => window.__game?.inspect('dialogue')?.text === 'Rested, and ready to go again.',
  );
  const rested = await state(page);
  expect(rested.members.rowan).toEqual({
    level: 1,
    exp: 0,
    equipment: { weapon: 'bronze-sword', armor: 'travel-clothes' },
  });
  expect(rested.members.bram).not.toHaveProperty('hp');
  expect(errors).toEqual([]);
});
