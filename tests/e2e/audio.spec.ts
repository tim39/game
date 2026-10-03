import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
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

/** Opens the title screen, and presses a key, which unlocks audio, as browsers require. */
async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__game?.audio().locked === false);
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
  const town = await audio(page);
  // At full level, it plays at the music volume setting.
  expect(town?.tracks[0]?.volume).toBeCloseTo(0.6);
  expect(town?.starts).toBe(2);

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
