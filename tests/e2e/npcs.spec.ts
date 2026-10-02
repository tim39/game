import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';
import { NPC_TUNING } from '../../src/data/balance';

interface NpcInfo {
  id: string;
  x: number;
  y: number;
  facing: string;
  moving: boolean;
  home: { x: number; y: number };
  wander: number;
}

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));

async function npc(page: Page, id: string): Promise<NpcInfo> {
  const npcs = (await field(page))?.npcs as NpcInfo[];
  const found = npcs.find((n) => n.id === id);
  if (!found) throw new Error(`No npc ${id} on this map`);
  return found;
}

async function warp(page: Page, x: number, y: number): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(([x, y]) => window.__game?.warp('test-shore', x, y), [x, y] as const);
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
}

test('someone standing still blocks the way, and turns to look at whoever bumps into them', async ({
  page,
}) => {
  // Tamsin stands at (10, 8), facing down; the player starts just above her.
  await warp(page, 10, 7);
  expect(await npc(page, 'tamsin')).toMatchObject({ x: 10, y: 8, facing: 'down', wander: 0 });
  expect((await field(page))?.blocked).toMatchObject({ down: true });

  await page.keyboard.press('ArrowDown');
  await nextFrames(page);
  expect(await field(page)).toMatchObject({ x: 10, y: 7, facing: 'down' });
  expect(await npc(page, 'tamsin')).toMatchObject({ x: 10, y: 8, facing: 'up' });
  await page.screenshot({ path: 'test-results/screenshots/npc-tamsin.png' });

  // A while later she turns back the way she was, without having moved. (Waits on the game rather
  // than the clock: a busy machine runs the game slower. The unit tests pin down the timing.)
  await page.waitForFunction(
    () => {
      const npcs = window.__game?.inspect('field')?.npcs as { id: string; facing: string }[];
      return npcs.find((n) => n.id === 'tamsin')?.facing === 'down';
    },
    undefined,
    { timeout: NPC_TUNING.lookMs * 5 },
  );
  expect(await npc(page, 'tamsin')).toMatchObject({ x: 10, y: 8, facing: 'down' });
});

test('a wanderer walks about, but stays near home', async ({ page }) => {
  await warp(page, 9, 6);
  const { home } = await npc(page, 'stroller');
  const seen: NpcInfo[] = [];
  // Its pauses last 1.5–4 s, and not every turn takes it anywhere, so give it plenty of time.
  await expect
    .poll(
      async () => {
        const stroller = await npc(page, 'stroller');
        seen.push(stroller);
        return `${stroller.x},${stroller.y}`;
      },
      { timeout: 30_000, intervals: [250] },
    )
    .not.toBe(`${home.x},${home.y}`);
  for (const { x, y, wander } of seen) {
    expect(Math.abs(x - home.x)).toBeLessThanOrEqual(wander);
    expect(Math.abs(y - home.y)).toBeLessThanOrEqual(wander);
  }
  await page.screenshot({ path: 'test-results/screenshots/npc-wanderers.png' });
});
