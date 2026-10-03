import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { choiceBoxOnScreen } from '../../src/ui/dialogue-layout';

interface DialogueInfo {
  name: string | null;
  text: string | null;
  lines: string[];
  /** How much of each line has typed out so far. */
  shown: string[];
  typing: boolean;
  prompt: boolean;
  choices: string[];
  cursor: number;
  choiceWidths: number[];
}

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const dialogue = async (page: Page): Promise<DialogueInfo> =>
  (await page.evaluate(() => window.__game?.inspect('dialogue'))) as unknown as DialogueInfo;
const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));

/** Puts the player on `map` at (x, y), facing `facing`, and collects any console errors. */
async function warp(page: Page, map: string, x: number, y: number, facing: Direction) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
  return errors;
}

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await nextFrames(page);
}

/** Presses Confirm to talk, and waits for the box to start typing `text`. */
async function talk(page: Page, text: string): Promise<void> {
  await page.keyboard.press('KeyZ');
  await page.waitForFunction((said) => window.__game?.inspect('dialogue')?.text === said, text);
}

const FISHER = 'Not a bite all morning. I think the fish are having the day off.';

test('a line types out, Confirm shows the rest at once, and Confirm again goes on', async ({
  page,
}) => {
  // The fisher stands at (16, 9) on the test shore, facing left.
  const errors = await warp(page, 'test-shore', 15, 9, 'right');
  await talk(page, FISHER);
  const typing = await dialogue(page);
  expect(typing).toMatchObject({ name: 'Villager', typing: true, prompt: false, choices: [] });
  expect(typing.shown.every((part, index) => typing.lines[index]?.startsWith(part))).toBe(true);
  expect(typing.shown.join('').length).toBeLessThan(typing.lines.join('').length);
  await page.screenshot({ path: 'test-results/screenshots/dialogue-typing.png' });

  // It keeps typing on its own.
  await page.waitForFunction(
    (before) => (window.__game?.inspect('dialogue')?.shown as string[]).join('').length > before,
    typing.shown.join('').length,
  );

  // Confirm shows it all, with the ▼; it doesn't also go on.
  await press(page, 'KeyZ');
  const shown = await dialogue(page);
  expect(shown).toMatchObject({ text: FISHER, typing: false, prompt: true });
  expect(shown.shown).toEqual(shown.lines);
  await page.screenshot({ path: 'test-results/screenshots/dialogue-prompt.png' });

  // Confirm again goes on, to the choices.
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 3,
  );
  expect(errors).toEqual([]);
});

test('the next line replaces the last without the box blinking off between', async ({ page }) => {
  // The host stands at (2, 2) in the test house, with two lines to say.
  await warp(page, 'test-house', 2, 3, 'up');
  await talk(page, 'Come in, come in. Mind the cellar stairs.');
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);

  // Watch every frame while Confirm goes on to the next line.
  const watching = page.evaluate(
    () =>
      new Promise<boolean[]>((resolve) => {
        const open: boolean[] = [];
        const look = (): void => {
          open.push(window.__game?.activeScenes().includes('dialogue') ?? false);
          if (open.length < 20) requestAnimationFrame(look);
          else resolve(open);
        };
        requestAnimationFrame(look);
      }),
  );
  await page.keyboard.press('KeyZ');
  expect((await watching).every(Boolean)).toBe(true);
  expect((await dialogue(page)).text).toBe("There's nothing down there but cobwebs and a draught.");
});

test('left alone, a line finishes typing by itself, and shows the ▼', async ({ page }) => {
  // Tamsin stands at (10, 8), facing down.
  await warp(page, 'test-shore', 10, 7, 'down');
  await talk(page, "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!");
  expect(await dialogue(page)).toMatchObject({ typing: true, prompt: false });
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
});

test('choices come up under the line; the cursor wraps round, and Confirm picks', async ({
  page,
}) => {
  const errors = await warp(page, 'test-shore', 15, 9, 'right');
  await talk(page, FISHER);
  await press(page, 'KeyZ');
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 3,
  );

  // The fisher's line stays on screen, all of it, with no ▼: the choices take Confirm.
  const asking = await dialogue(page);
  expect(asking).toMatchObject({
    name: 'Villager',
    text: FISHER,
    typing: false,
    prompt: false,
    choices: ['Try more bait?', 'Try another spot?', 'Give up for today?'],
    cursor: 0,
  });
  expect(asking.shown).toEqual(asking.lines);
  // The box is sized to the widest choice, and centred above the dialogue box (to the nearest
  // game pixel, as it keeps to whole box pixels).
  const box = choiceBoxOnScreen(Math.max(...asking.choiceWidths), 3);
  expect(Math.abs(box.x + box.width / 2 - 320)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/screenshots/dialogue-choices.png' });

  await press(page, 'ArrowUp');
  expect((await dialogue(page)).cursor).toBe(2);
  await press(page, 'ArrowDown');
  expect((await dialogue(page)).cursor).toBe(0);
  await press(page, 'ArrowDown');
  expect((await dialogue(page)).cursor).toBe(1);
  await page.screenshot({ path: 'test-results/screenshots/dialogue-choice-cursor.png' });
  // The player stays put while choosing.
  expect(await field(page)).toMatchObject({ x: 15, y: 9, running: true });

  // The script carries on down the branch picked.
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () =>
      window.__game?.inspect('dialogue')?.text ===
      "I've tried them all. This one's the least rude.",
  );
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  await nextFrames(page);
  expect(await page.evaluate(() => window.__game?.activeScenes())).toEqual(['field']);
  expect(errors).toEqual([]);
});
