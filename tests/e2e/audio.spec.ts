import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { SOUND_REPEAT_MS } from '../../src/data/balance';
import type { AudioInfo } from '../../src/systems/audio';

const audio = (page: Page): Promise<AudioInfo | undefined> =>
  page.evaluate(() => window.__game?.audio());

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/**
 * Opens the title screen, and presses a key, which unlocks audio, as browsers require: one the game
 * doesn't use, so the title screen's cursor stays where it is, quietly.
 */
async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => window.__game?.audio().locked === false);
}

/**
 * Presses a key, and checks the sound effect it plays: the latest, once there's a new one. A sound
 * plays once however often it's asked for within SOUND_REPEAT_MS, so it waits that long first.
 */
async function pressFor(page: Page, key: string, sound: string): Promise<void> {
  await page.waitForTimeout(SOUND_REPEAT_MS * 2);
  const before = JSON.stringify((await audio(page))?.sounds);
  await page.keyboard.press(key);
  await page.waitForFunction(
    (was) => JSON.stringify(window.__game?.audio().sounds) !== was,
    before,
  );
  expect((await audio(page))?.sounds.at(-1), `${key} plays ${sound}`).toBe(sound);
}

/** Presses a key, and checks that it plays no sound effect. */
async function pressQuietly(page: Page, key: string): Promise<void> {
  const before = (await audio(page))?.sounds;
  await page.keyboard.press(key);
  await nextFrames(page);
  await nextFrames(page);
  expect((await audio(page))?.sounds, `${key} plays nothing`).toEqual(before);
}

/** Waits until `scene` is running. */
async function sceneUp(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((key) => window.__game?.activeScenes().includes(key) ?? false, scene);
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Waits until only `key` is heard, at full volume, or nothing is, for null. */
async function onlyMusic(page: Page, key: string | null): Promise<void> {
  await page.waitForFunction((track) => {
    const info = window.__game?.audio();
    const tracks = info?.tracks ?? [];
    if (track === null) return info?.music === null && tracks.length === 0;
    return info?.music === track && tracks.length === 1 && tracks[0]?.level === 1;
  }, key);
}

/** Presses Confirm, and waits for the dialogue box to show `text`, typed out in full. */
async function confirmUntilSaid(page: Page, text: string): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
}

/** Closes the box, and waits for the field to carry on. */
async function close(page: Page): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

test('the title music waits for the first key press, then fades in', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  // Phaser keeps audio locked until the first input, even where the browser wouldn't.
  const before = { locked: true, music: 'bgm.title', tracks: [{ key: 'bgm.title', level: 0 }] };
  expect(await audio(page)).toMatchObject(before);
  await page.waitForTimeout(500);
  await nextFrames(page);
  expect(await audio(page)).toMatchObject(before);

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => {
    const track = window.__game?.audio().tracks[0];
    return track !== undefined && track.level > 0 && track.level < 1;
  });
  await onlyMusic(page, 'bgm.title');
  expect(await audio(page)).toMatchObject({ locked: false, starts: 1 });
  expect(errors).toEqual([]);
});

test('a map crossfades to its own music, which plays on indoors', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await onlyMusic(page, 'bgm.title');
  expect(await audio(page)).toMatchObject({ starts: 1 });

  // Saltmere's music fades in as the title's fades out: both can be heard for a moment.
  await page.evaluate(() => window.__game?.warp('saltmere', 7, 6, 'up'));
  await page.waitForFunction(() => {
    const tracks = window.__game?.audio().tracks ?? [];
    const fading = (key: string, target: number) =>
      tracks.some((track) => track.key === key && track.target === target && track.level < 1);
    return fading('bgm.title', 0) && fading('bgm.saltmere', 1);
  });
  await onlyMusic(page, 'bgm.saltmere');
  // At full level, it plays at the music volume setting. Web Audio reports a volume set this frame
  // once it has played a little more, so it waits for that.
  await page.waitForFunction(
    () => Math.abs((window.__game?.audio().tracks[0]?.volume ?? 0) - 0.6) < 0.005,
  );
  expect((await audio(page))?.starts).toBe(2);

  // Into Tamsin's house, which has the same music: it plays on, rather than starting over.
  await page.keyboard.press('ArrowUp');
  await arrivedOn(page, 'saltmere-tamsin');
  expect(await audio(page)).toMatchObject({ music: 'bgm.saltmere', starts: 2 });

  // A map without music fades to silence.
  await warp(page, 'test-house', 4, 5, 'up');
  await onlyMusic(page, null);
  expect(errors).toEqual([]);
});

test('a chest plays its sound as it opens, and not when it is empty', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // The Potion chest at (4, 1) in the test cellar.
  await warp(page, 'test-cellar', 4, 2, 'up');
  expect((await audio(page))?.sounds).toEqual([]);

  await confirmUntilSaid(page, 'Found Potion!');
  expect((await audio(page))?.sounds).toEqual(['sfx.chest']);
  await close(page);
  await confirmUntilSaid(page, 'The chest is empty.');
  await close(page);

  // Coming back, the open chest is drawn open, quietly.
  await warp(page, 'test-cellar', 4, 2, 'up');
  expect((await audio(page))?.sounds).toEqual(['sfx.chest']);
  expect(errors).toEqual([]);
});

test('a script plays a sound and changes the music, until the player leaves', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  // The music box stands at (19, 10) in the test meadow, which has no music of its own.
  await warp(page, 'test-meadow', 19, 11, 'up');
  await onlyMusic(page, null);

  await confirmUntilSaid(page, 'A music box. It plays the title tune until you leave the meadow.');
  expect(await audio(page)).toMatchObject({ music: 'bgm.title', sounds: ['sfx.chest'] });
  await close(page);
  await onlyMusic(page, 'bgm.title');

  // Arriving on a map plays its music: the test shore has none.
  await warp(page, 'test-shore', 12, 12, 'down');
  await onlyMusic(page, null);
  expect(errors).toEqual([]);
});

test('the title screen and Options click, confirm, go back, and buzz', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  expect((await audio(page))?.sounds).toEqual([]);
  // With no save to carry on from, Continue can't be chosen.
  await pressFor(page, 'ArrowDown', 'sfx.cursor');
  await pressFor(page, 'KeyZ', 'sfx.buzzer');
  await pressFor(page, 'ArrowDown', 'sfx.cursor');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await sceneUp(page, 'options');
  // Text speed, from Normal to Fast, and no further.
  await pressFor(page, 'ArrowRight', 'sfx.cursor');
  await pressQuietly(page, 'ArrowRight');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await pressFor(page, 'ArrowDown', 'sfx.cursor');
  await pressFor(page, 'KeyX', 'sfx.cancel');
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'title');
  expect(errors).toEqual([]);
});

test('the main menu clicks, confirms, goes back, buzzes, and heals', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.give('potion', 2));
  await warp(page, 'test-house', 4, 5, 'up');
  await pressFor(page, 'KeyC', 'sfx.confirm');
  await sceneUp(page, 'main-menu');
  await pressFor(page, 'ArrowDown', 'sfx.cursor');
  await pressFor(page, 'ArrowUp', 'sfx.cursor');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  // Everyone is full, so a Potion would help nobody.
  await pressFor(page, 'KeyZ', 'sfx.buzzer');
  await pressFor(page, 'KeyX', 'sfx.cancel');
  await pressFor(page, 'KeyX', 'sfx.cancel');
  await arrivedOn(page, 'test-house');

  // Hurt, Rowan can drink one, which sounds like healing.
  await page.evaluate(() => window.__game?.vitals('rowan', { hp: 1 }));
  await pressFor(page, 'KeyC', 'sfx.confirm');
  await sceneUp(page, 'main-menu');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await pressFor(page, 'KeyZ', 'sfx.heal');
  // Menu closes it from any page.
  await pressFor(page, 'KeyC', 'sfx.cancel');
  await arrivedOn(page, 'test-house');
  expect(errors).toEqual([]);
});

test('buying in a shop rings up the gold', async ({ page }) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.evaluate(() => window.__game?.giveGold(100));
  // In front of the Test Market's shopkeeper.
  await warp(page, 'test-market', 3, 3, 'up');
  await confirmUntilSaid(page, 'Welcome! A bit of everything, for a price.');
  // Going on through what's said is quiet.
  await pressQuietly(page, 'KeyZ');
  await sceneUp(page, 'shop');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await pressFor(page, 'KeyZ', 'sfx.confirm');
  await pressFor(page, 'ArrowRight', 'sfx.cursor');
  await pressFor(page, 'KeyZ', 'sfx.trade');
  expect((await page.evaluate(() => window.__game?.state()))?.inventory).toMatchObject({
    potion: 2,
  });
  await pressFor(page, 'KeyX', 'sfx.cancel');
  await pressFor(page, 'KeyX', 'sfx.cancel');
  expect(errors).toEqual([]);
});

test('the game plays on without its sounds, if they fail to load', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route(/\.(ogg|m4a)$/, (route) => route.abort());
  await toTitle(page);
  await warp(page, 'test-cellar', 4, 2, 'up');
  await confirmUntilSaid(page, 'Found Potion!');
  await close(page);
  // The music is asked for as ever, but there's nothing to play.
  expect(await audio(page)).toMatchObject({ music: null, starts: 0, sounds: [] });
  // The browser reports the files it couldn't fetch; the game itself has nothing to complain of.
  expect(errors.filter((error) => !error.startsWith('Failed to load resource'))).toEqual([]);
});
