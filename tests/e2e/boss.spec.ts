import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';
import type { AudioInfo } from '../../src/systems/audio';

// The Tide Caves' boss: the door to the Beacon chamber, the Drowned Warden standing guard there,
// and the fight with it, its telegraph and its second phase.

// Battles take a while to play out, even at 4×, more so with other tests running beside them.
test.describe.configure({ timeout: 90_000 });

interface BattleInfo {
  backdrop: string;
  outcome: string;
  choosing: boolean;
  waiting: boolean;
  banner: string | null;
  commands: { label: string; enabled: boolean }[];
  timeline: { id: string; telegraph: boolean }[];
  fighters: { id: string; side: string; hp: number }[];
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
const battle = async (page: Page): Promise<BattleInfo> =>
  (await page.evaluate(() => window.__game?.inspect('battle'))) as unknown as BattleInfo;
const audio = async (page: Page): Promise<AudioInfo> =>
  (await page.evaluate(() => window.__game?.audio())) as AudioInfo;
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
const dialogue = (page: Page) => page.evaluate(() => window.__game?.inspect('dialogue'));
const blocked = async (page: Page): Promise<Record<string, boolean>> =>
  ((await field(page))?.blocked ?? {}) as Record<string, boolean>;

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

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

/**
 * Opens the game with the Beacon out (so the caves are open), no random battles and battles at
 * 4×; then `setUp` gets the party ready, and the player starts on `map` at (x, y).
 */
async function startOn(
  page: Page,
  [map, x, y, facing]: readonly [string, number, number, Direction],
  setUp: () => void = () => undefined,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => {
    window.__game?.setFlag('story.beacon-out');
    window.__game?.encounters({ rate: 'off', seed: 1 });
    window.__game?.battleSpeed(4);
  });
  await page.evaluate(setUp);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Steps one cell (or turns, if the way is blocked) and waits for the step to end. */
async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await press(page, key);
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
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () => ((window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length ?? 0) > 0,
  );
  for (let move = 0; move < index; move++) await press(page, 'ArrowDown');
  await press(page, 'KeyZ');
}

/** Reads the last line, and waits for the field to carry on. */
async function closeOn(page: Page, text: string): Promise<void> {
  await untilSaid(page, text);
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

/** Waits until the battle waits for the player: to choose, or to see how it ended. */
async function waitForPlayer(page: Page): Promise<BattleInfo> {
  await page.waitForFunction(
    () => {
      const info = window.__game?.inspect('battle');
      return info?.choosing === true || info?.waiting === true;
    },
    undefined,
    { timeout: 60_000 },
  );
  return battle(page);
}

/** Takes the same command every turn (the keys that pick it, then Confirm) until it's over. */
async function fightUntilOver(page: Page, ...command: string[]): Promise<BattleInfo> {
  for (let turn = 0; turn < 100; turn++) {
    const info = await waitForPlayer(page);
    if (info.waiting) return info;
    await press(page, ...command, 'KeyZ');
  }
  throw new Error('The battle went on too long');
}

/** Attack, at the first enemy. */
const ATTACK = 'KeyZ';
/** From Attack, round to Guard, at the bottom of the command window. */
const GUARD = 'ArrowUp';

const WARDEN_SEEN =
  'A knight in barnacled armor stands before the dead Beacon, still as stone. Seawater runs from its visor.';
const WARDEN_SAYS = '...Keep the flame... Feed the flame...';
const WARDEN_FALLS =
  'The Drowned Warden falls to its knees, and crumbles away into rust and seawater.';

/** Examines the Warden in front of the player, which reads what it is and says, then fights. */
async function challengeWarden(page: Page): Promise<void> {
  await press(page, 'KeyZ');
  await untilSaid(page, WARDEN_SEEN);
  await press(page, 'KeyZ');
  await untilSaid(page, WARDEN_SAYS);
  expect(await dialogue(page)).toMatchObject({
    name: 'Drowned Warden',
    portrait: 'portrait.drowned-warden',
  });
  await page.screenshot({ path: 'test-results/screenshots/boss-warden-speaks.png' });
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.encountering === true);
}

/** Turns the victory panel's pages until the battle has gone. */
async function throughVictory(page: Page): Promise<void> {
  for (let shown = 0; shown < 12; shown++) {
    if (!(await page.evaluate(() => window.__game?.activeScenes().includes('battle')))) return;
    await press(page, 'KeyZ');
  }
  throw new Error('The victory panel went on too long');
}

/** Waits until the field is back: no script running, and the screen faded back in. */
async function fieldBack(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.running === false && info.dark === false && info.fading === false;
  });
}

/**
 * Turns the victory panel's pages until the battle hands the field back: still black, with the
 * Warden crumbling. Then the screen comes back.
 */
async function wardenFalls(page: Page): Promise<void> {
  await throughVictory(page);
  await untilSaid(page, WARDEN_FALLS);
  expect(await field(page)).toMatchObject({ dark: true, running: true, encountering: false });
  expect((await state(page)).flags).toHaveProperty(['story.warden-beaten'], true);
  await press(page, 'KeyZ');
  await fieldBack(page);
}

test('the door to the Beacon chamber opens once pushed, and stays open', async ({ page }) => {
  const errors = watchErrors(page);
  // Past the last floor's shallows, below the door at (27, 0).
  await startOn(page, ['tide-caves-b3', 27, 1, 'up'], () => window.__game?.setFlag('tide.b3-out'));
  const door =
    "A heavy door, green with age and carved with the Wardens' flame. Cold seeps from under it.";
  await press(page, 'KeyZ');
  await untilSaid(page, door);
  await page.screenshot({ path: 'test-results/screenshots/tide-caves-b3-door.png' });
  // Left alone, it stays shut.
  await pick(page, 1);
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  expect((await state(page)).flags).not.toHaveProperty(['tide-caves.door-open']);
  expect(await blocked(page)).toMatchObject({ up: true });

  // Pushed, it swings open, and leads to the chamber.
  await press(page, 'KeyZ');
  await untilSaid(page, door);
  await pick(page, 0);
  await closeOn(
    page,
    'Rowan sets a shoulder to the door. Stone grinds on stone, and it swings open.',
  );
  expect((await state(page)).flags).toHaveProperty(['tide-caves.door-open'], true);
  await step(page, 'ArrowUp');
  await arrivedOn(page, 'tide-caves-beacon');
  // An area of its own, where no music plays: the caves' fades away.
  expect(await field(page)).toMatchObject({ x: 6, y: 12, facing: 'up', banner: 'Beacon Chamber' });
  await page.waitForFunction(() => window.__game?.audio().tracks.length === 0);
  expect((await audio(page)).music).toBeNull();
  await page.screenshot({ path: 'test-results/screenshots/boss-chamber.png' });

  // The Warden stands across the causeway.
  await step(page, 'ArrowUp', 4);
  expect(await field(page)).toMatchObject({ x: 6, y: 8 });
  expect(await blocked(page)).toMatchObject({ up: true });

  // Back out through the door, and the way back in is open.
  await step(page, 'ArrowDown', 5);
  await arrivedOn(page, 'tide-caves-b3');
  expect(await field(page)).toMatchObject({ x: 27, y: 1, facing: 'down' });
  await step(page, 'ArrowUp');
  await arrivedOn(page, 'tide-caves-beacon');
  expect(errors).toEqual([]);
});

test('the Drowned Warden fights to the boss music, and once beaten is gone for good', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Rowan and Bram, far stronger than they need to be, in front of the Warden.
  await startOn(page, ['tide-caves-beacon', 6, 8, 'up'], () => {
    window.__game?.join('bram');
    window.__game?.setLevel(30);
  });
  await challengeWarden(page);

  // In front of the chamber's dead Beacon, to the boss's music, and with no getting away.
  const first = await waitForPlayer(page);
  expect(first).toMatchObject({ backdrop: 'beacon-chamber', outcome: 'ongoing' });
  expect(first.fighters.filter(({ side }) => side === 'enemies').map(({ id }) => id)).toEqual([
    'drowned-warden-a',
  ]);
  expect(first.commands.find(({ label }) => label === 'Flee')).toEqual({
    label: 'Flee',
    enabled: false,
  });
  expect(await audio(page)).toMatchObject({ music: 'bgm.boss' });
  await page.screenshot({ path: 'test-results/screenshots/boss-battle.png' });

  expect(await fightUntilOver(page, ATTACK)).toMatchObject({ outcome: 'victory' });
  await wardenFalls(page);
  // The causeway is clear, up to the dead Beacon on its dais.
  expect(await blocked(page)).toMatchObject({ up: false });
  await page.screenshot({ path: 'test-results/screenshots/boss-beaten.png' });
  await step(page, 'ArrowUp', 5);
  expect(await field(page)).toMatchObject({ x: 6, y: 3, facing: 'up' });
  await press(page, 'KeyZ');
  await closeOn(page, "The Beacon's bowl is cold and dark, and full of black ash.");

  // Gone for good, as the game remembers.
  await page.evaluate(() => window.__game?.warp('tide-caves-beacon', 6, 8, 'up'));
  await arrivedOn(page, 'tide-caves-beacon');
  expect(await blocked(page)).toMatchObject({ up: false });
  expect(errors).toEqual([]);
});

test('the Warden readies Undertow a turn ahead, and its armor cracks below half its HP', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Rowan and Bram as the simulator has them at the Warden.
  await startOn(page, ['tide-caves-b3', 27, 1, 'up'], () => {
    window.__game?.join('bram');
    window.__game?.setLevel(5);
    window.__game?.equip('rowan', 'iron-sword');
  });
  // Every banner the battle shows, in order, as the banners come and go faster than turns do.
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { bannersSeen: seen });
    setInterval(() => {
      const banner = window.__game?.inspect('battle')?.banner;
      if (typeof banner === 'string' && seen.at(-1) !== banner) seen.push(banner);
    }, 10);
    window.__game?.battle(['drowned-warden'], { backdrop: 'beacon-chamber', seed: 2 });
  });
  const banners = () =>
    page.evaluate(() => (window as unknown as { bannersSeen: string[] }).bannersSeen);

  // Attacking every turn, until the Warden has readied Undertow: the timeline marks its turn.
  let readied: BattleInfo | undefined;
  for (let turn = 0; turn < 20 && !readied; turn++) {
    const info = await waitForPlayer(page);
    if (info.timeline.some(({ telegraph }) => telegraph)) readied = info;
    else await press(page, ATTACK, 'KeyZ');
  }
  if (!readied) throw new Error('The Warden never readied Undertow');
  expect(readied.timeline.filter(({ telegraph }) => telegraph).map(({ id }) => id)).toEqual([
    'drowned-warden-a',
  ]);
  expect(await banners()).toContain('Drowned Warden readies Undertow!');
  await page.screenshot({ path: 'test-results/screenshots/boss-telegraph.png' });

  // Below half its HP, the banner says so as the Warden changes.
  const cracks = "The Warden's armor cracks, and the sea pours out!";
  for (let turn = 0; turn < 40; turn++) {
    const info = await waitForPlayer(page);
    if (info.waiting || (await banners()).includes(cracks)) break;
    await press(page, ATTACK, 'KeyZ');
  }
  expect(await banners()).toContain(cracks);
  expect(errors).toEqual([]);
});

test('a battle lost to the Warden can be fought again, and the scene carries on once it’s won', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Rowan alone, at level 1, doesn't stand a chance.
  await startOn(page, ['tide-caves-beacon', 6, 8, 'up']);
  await challengeWarden(page);
  expect(await fightUntilOver(page, GUARD)).toMatchObject({ outcome: 'defeat' });
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('game-over')?.ready === true);
  expect((await state(page)).flags).not.toHaveProperty(['story.warden-beaten']);

  // Fought again, by a far stronger Rowan, and won: the scene carries on where it left off.
  await page.evaluate(() => window.__game?.setLevel(30));
  await press(page, 'KeyZ');
  expect(await waitForPlayer(page)).toMatchObject({ outcome: 'ongoing' });
  expect(await audio(page)).toMatchObject({ music: 'bgm.boss' });
  expect(await fightUntilOver(page, ATTACK)).toMatchObject({ outcome: 'victory' });
  await wardenFalls(page);
  expect(await field(page)).toMatchObject({ map: 'tide-caves-beacon', x: 6, y: 8 });
  expect(await blocked(page)).toMatchObject({ up: false });
  expect(errors).toEqual([]);
});

test('a script’s battle hands the screen back, whether the script ends or fades in at once', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // The square's own script has been seen, so nothing else runs there.
  await startOn(page, ['test-square', 3, 6, 'up'], () => {
    window.__game?.setFlag('test.square-seen');
    window.__game?.setLevel(30);
  });
  for (const fadeIn of [false, true]) {
    await page.evaluate((on) => {
      window.__game?.setFlag('test.ambush-fade-in', on);
      window.__game?.run('test/ambush');
    }, fadeIn);
    expect(await fightUntilOver(page, ATTACK)).toMatchObject({ outcome: 'victory' });
    await throughVictory(page);
    await fieldBack(page);
    expect(await field(page)).toMatchObject({
      map: 'test-square',
      x: 3,
      y: 6,
      encountering: false,
    });
  }
  expect(errors).toEqual([]);
});
