import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { STEP, type Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { FIELD_SPEEDS } from '../../src/data/balance';
import { UI_TEXT } from '../../src/data/ui-text';
import { ASSETS } from '../../src/systems/asset-manifest';
import { TOUCH_ART } from '../../src/systems/input/touch-layout';
import { DIALOGUE_BOX_ON_SCREEN } from '../../src/ui/dialogue-layout';

// A phone held sideways (an iPhone 14's screen) with a touchscreen.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

interface Point {
  x: number;
  y: number;
}

/** Fingers on the touchscreen, through Chromium's touch emulation. Each stays down until lifted. */
class Fingers {
  private readonly down = new Map<number, Point>();

  private constructor(private readonly cdp: CDPSession) {}

  static async on(page: Page): Promise<Fingers> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return new Fingers(cdp);
  }

  async press(id: number, at: Point): Promise<void> {
    this.down.set(id, at);
    await this.send('touchStart', this.points());
  }

  async move(id: number, to: Point): Promise<void> {
    this.down.set(id, to);
    await this.send('touchMove', this.points());
  }

  async lift(id: number): Promise<void> {
    const at = this.down.get(id);
    if (!at) return;
    this.down.delete(id);
    await this.send('touchEnd', [{ ...at, id }]);
  }

  async tap(at: Point): Promise<void> {
    await this.press(9, at);
    await this.lift(9);
  }

  private points(): { x: number; y: number; id: number }[] {
    return [...this.down].map(([id, { x, y }]) => ({ x, y, id }));
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { x: number; y: number; id: number }[],
  ): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
}

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const activeScenes = (page: Page) => page.evaluate(() => window.__game?.activeScenes());
const held = (page: Page) => page.evaluate(() => window.__game?.held() ?? []);

/** The middle of a touch control, or a point `along` its radius out in a direction from it. */
async function spot(
  page: Page,
  control: 'dpad' | 'a' | 'b' | 'menu',
  towards?: Direction,
): Promise<Point> {
  const box = await page.locator(`[data-control="${control}"] .touch-art`).boundingBox();
  if (!box) throw new Error(`The ${control} control isn't on screen`);
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (!towards) return middle;
  const [dx, dy] = STEP[towards];
  const reach = box.width * 0.35;
  return { x: middle.x + dx * reach, y: middle.y + dy * reach };
}

async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

async function warp(page: Page, map: string, x: number, y: number, facing: string): Promise<void> {
  await openTitle(page);
  await page.evaluate(([id, x, y, facing]) => window.__game?.warp(id, x, y, facing as 'up'), [
    map,
    x,
    y,
    facing,
  ] as const);
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);
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

test('the controls show beside the game, clear of the dialogue box, and the title says to press A', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await expect(page.locator('#touch-controls')).toBeVisible();
  await expect(page.locator('#rotate-hint')).toBeHidden();
  expect((await page.evaluate(() => window.__game?.inspect('title')))?.hint).toBe(
    UI_TEXT.chooseWithTouch,
  );
  await page.screenshot({ path: 'test-results/screenshots/touch-title.png' });

  // Talking to Tamsin opens the dialogue box: none of the controls may cover it.
  await warp(page, 'test-shore', 10, 7, 'down');
  const fingers = await Fingers.on(page);
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.activeScenes().includes('dialogue') ?? false);
  await nextFrames(page);
  await page.screenshot({ path: 'test-results/screenshots/touch-dialogue.png' });

  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('the game canvas is not on screen');
  const zoom = canvas.width / 640;
  const box = {
    x: canvas.x + DIALOGUE_BOX_ON_SCREEN.x * zoom,
    y: canvas.y + DIALOGUE_BOX_ON_SCREEN.y * zoom,
    width: DIALOGUE_BOX_ON_SCREEN.width * zoom,
    height: DIALOGUE_BOX_ON_SCREEN.height * zoom,
  };
  for (const control of ['dpad', 'a', 'b', 'menu']) {
    const art = await page.locator(`[data-control="${control}"] .touch-art`).boundingBox();
    if (!art) throw new Error(`The ${control} control isn't on screen`);
    const overlaps =
      art.x < box.x + box.width &&
      art.x + art.width > box.x &&
      art.y < box.y + box.height &&
      art.y + art.height > box.y;
    expect(overlaps, control).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('the control art is the size the layout expects', async ({ page }) => {
  await openTitle(page);
  const sizes = await page.evaluate(
    async (urls) => {
      const measure = async (url: string): Promise<number[]> => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      };
      return Promise.all(urls.map(measure));
    },
    [ASSETS['touch.dpad'].url, ASSETS['touch.buttons'].url, ASSETS['touch.menu'].url],
  );
  expect(sizes).toEqual([
    [TOUCH_ART.dpad.width * 5, TOUCH_ART.dpad.height],
    [TOUCH_ART.button.width * 4, TOUCH_ART.button.height],
    [TOUCH_ART.menu.width, TOUCH_ART.menu.height],
  ]);
});

test('the d-pad walks, running unless B is held, and follows a sliding thumb', async ({ page }) => {
  const errors = watchErrors(page);
  // Open grass, with room in every direction.
  await warp(page, 'test-shore', 12, 12, 'down');
  const fingers = await Fingers.on(page);

  await fingers.press(1, await spot(page, 'dpad', 'right'));
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === true);
  expect(await field(page)).toMatchObject({ facing: 'right', stepMs: FIELD_SPEEDS.runMs });
  await expect(page.locator('[data-control="dpad"]')).toHaveClass(/pressed/);
  await page.screenshot({ path: 'test-results/screenshots/touch-dpad-right.png' });

  // Sliding the thumb round to the bottom of the pad turns the walk downwards, without lifting.
  await fingers.move(1, await spot(page, 'dpad', 'down'));
  await page.waitForFunction(() => window.__game?.inspect('field')?.facing === 'down');
  await fingers.lift(1);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  const stopped = await field(page);
  expect(stopped?.x).toBeGreaterThan(12);
  expect(stopped?.y).toBeGreaterThan(12);
  await expect(page.locator('[data-control="dpad"]')).not.toHaveClass(/pressed/);

  // With B held too, the player walks instead.
  await fingers.press(2, await spot(page, 'b'));
  await fingers.press(1, await spot(page, 'dpad', 'left'));
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === true);
  expect(await field(page)).toMatchObject({ facing: 'left', stepMs: FIELD_SPEEDS.walkMs });
  await fingers.lift(1);
  await fingers.lift(2);
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  expect(errors).toEqual([]);
});

test('A talks and closes the box; touching the game itself does nothing', async ({ page }) => {
  const errors = watchErrors(page);
  // Tamsin stands at (10, 8), just below.
  await warp(page, 'test-shore', 10, 7, 'down');
  const fingers = await Fingers.on(page);

  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('the game canvas is not on screen');
  await fingers.tap({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 });
  await nextFrames(page);
  await nextFrames(page);
  expect(await activeScenes(page)).toEqual(['field']);

  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.name === 'Tamsin');
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  expect(await activeScenes(page)).toEqual(['field']);
  expect(errors).toEqual([]);
});

test('B and Menu hold their actions while pressed', async ({ page }) => {
  await warp(page, 'test-shore', 12, 12, 'down');
  const fingers = await Fingers.on(page);

  await fingers.press(1, await spot(page, 'b'));
  await page.waitForFunction(() => window.__game?.held().includes('cancel') ?? false);
  expect(await held(page)).toEqual(['cancel', 'run']);
  await fingers.lift(1);
  await page.waitForFunction(() => window.__game?.held().length === 0);

  await fingers.press(1, await spot(page, 'menu'));
  await page.waitForFunction(() => window.__game?.held().includes('menu') ?? false);
  await expect(page.locator('[data-control="menu"]')).toHaveClass(/pressed/);
  await fingers.lift(1);
  await page.waitForFunction(() => window.__game?.held().length === 0);
});

test('held upright, the game asks to be turned sideways', async ({ page }) => {
  await openTitle(page);
  // A thumb on the d-pad as the phone turns: the controls hide, and let go.
  const fingers = await Fingers.on(page);
  await fingers.press(1, await spot(page, 'dpad', 'right'));
  await page.waitForFunction(() => window.__game?.held().includes('right') ?? false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__game?.held().length === 0);
  await expect(page.locator('#rotate-hint')).toBeVisible();
  await expect(page.locator('#rotate-hint')).toContainText(UI_TEXT.turnSideways);
  await expect(page.locator('#touch-controls')).toBeHidden();
  await page.screenshot({ path: 'test-results/screenshots/touch-portrait.png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate-hint')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeVisible();
});

test.describe('without a touchscreen', () => {
  test.use({ hasTouch: false, isMobile: false });

  test('there are no touch controls or hint, even in a tall window', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTitle(page);
    await expect(page.locator('#touch-controls')).toBeHidden();
    await expect(page.locator('#rotate-hint')).toBeHidden();
    expect((await page.evaluate(() => window.__game?.inspect('title')))?.hint).toBe(
      UI_TEXT.chooseWithKeys,
    );
  });
});
