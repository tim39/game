import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { STEP, type Direction } from '../../src/core/direction';
import type {} from '../../src/debug/api';
import { FIELD_SPEEDS } from '../../src/data/balance';
import { UI_TEXT } from '../../src/data/ui-text';
import { ASSETS } from '../../src/systems/asset-manifest';
import { TOUCH_ART, layoutTouchControls } from '../../src/systems/input/touch-layout';
import { DIALOGUE_BOX_ON_SCREEN, choiceBoxOnScreen } from '../../src/ui/dialogue-layout';

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
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
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
  // A finishes typing the line, and A again closes it.
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  expect(await activeScenes(page)).toEqual(['field']);
  expect(errors).toEqual([]);
});

test('A and the d-pad answer a choice, and no control covers the choices', async ({ page }) => {
  const errors = watchErrors(page);
  // The fisher stands at (16, 9), just to the right.
  await warp(page, 'test-shore', 15, 9, 'right');
  const fingers = await Fingers.on(page);
  const dialogue = () => page.evaluate(() => window.__game?.inspect('dialogue'));

  // A talks, finishes the line, and goes on to the choices.
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.typing === true);
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.prompt === true);
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(
    () => (window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length === 3,
  );
  await page.screenshot({ path: 'test-results/screenshots/touch-choices.png' });

  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('the game canvas is not on screen');
  const zoom = canvas.width / 640;
  const widths = (await dialogue())?.choiceWidths as number[];
  const choices = choiceBoxOnScreen(Math.max(...widths), widths.length);
  const box = {
    x: canvas.x + choices.x * zoom,
    y: canvas.y + choices.y * zoom,
    width: choices.width * zoom,
    height: choices.height * zoom,
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

  // A tap down on the d-pad moves the cursor, and A picks.
  await fingers.tap(await spot(page, 'dpad', 'down'));
  await page.waitForFunction(() => window.__game?.inspect('dialogue')?.cursor === 1);
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(
    () =>
      window.__game?.inspect('dialogue')?.text ===
      "I've tried them all. This one's the least rude.",
  );
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

test('three fingers on the game open the debug menu, and the controls work it', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Open grass, with room in every direction.
  await warp(page, 'test-shore', 12, 12, 'down');
  const fingers = await Fingers.on(page);
  const debugMenu = () => page.evaluate(() => window.__game?.inspect('debug-menu'));
  const menuOpen = (open: boolean) =>
    page.waitForFunction(
      (open) => window.__game?.activeScenes().includes('debug-menu') === open,
      open,
    );
  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('the game canvas is not on screen');
  const onGame = (dx: number): Point => ({
    x: canvas.x + canvas.width / 2 + dx,
    y: canvas.y + canvas.height / 2,
  });
  const threeFingers = async (): Promise<void> => {
    await fingers.press(1, onGame(-80));
    await fingers.press(2, onGame(0));
    await fingers.press(3, onGame(80));
  };
  const liftAll = async (): Promise<void> => {
    for (const id of [1, 2, 3]) await fingers.lift(id);
  };

  // Thumbs on the d-pad and B and a finger on A are playing, not asking for the menu.
  await fingers.press(1, await spot(page, 'dpad', 'right'));
  await fingers.press(2, await spot(page, 'b'));
  await fingers.press(3, await spot(page, 'a'));
  await nextFrames(page);
  await nextFrames(page);
  expect(await activeScenes(page)).toEqual(['field']);
  await liftAll();
  await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);

  await threeFingers();
  await menuOpen(true);
  await liftAll();
  expect(await activeScenes(page)).toEqual(['debug-menu']);
  expect((await debugMenu())?.hint).toBe('A: choose   B: back');

  // The d-pad moves the cursor, and A flips the switch under it.
  for (const below of ['Start a battle', 'Join the party', 'Noclip']) {
    await fingers.tap(await spot(page, 'dpad', 'down'));
    await page.waitForFunction(
      (label) => window.__game?.inspect('debug-menu')?.selected === label,
      below,
    );
  }
  await fingers.tap(await spot(page, 'a'));
  await page.waitForFunction(() => {
    const items = window.__game?.inspect('debug-menu')?.items as { on: boolean | null }[];
    return items[3]?.on === true;
  });
  await page.screenshot({ path: 'test-results/screenshots/touch-debug-menu.png' });

  // B closes it, and the field carries on, with noclip on.
  await fingers.tap(await spot(page, 'b'));
  await menuOpen(false);
  expect(await activeScenes(page)).toEqual(['field']);
  expect((await field(page))?.noclip).toBe(true);

  // Three fingers open it and close it again, once they've all been lifted in between.
  await threeFingers();
  await menuOpen(true);
  await liftAll();
  await threeFingers();
  await menuOpen(false);
  await liftAll();
  expect(errors).toEqual([]);
});

test('the browser can’t zoom, magnify or select on any touch, and the controls still work', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Open grass to the right.
  await warp(page, 'test-shore', 12, 12, 'right');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain(
    'maximum-scale=1, user-scalable=no',
  );
  // iOS Safari pinches with gesture events of its own, whatever the viewport tag says.
  const pinchCancelled = await page.evaluate(
    () => !document.dispatchEvent(new Event('gesturestart', { cancelable: true })),
  );
  expect(pinchCancelled).toBe(true);

  // Heard last, after the game's own handlers: did any touch leave the browser free to act on it?
  await page.evaluate(() => {
    const touches: { touch: string; cancelled: boolean }[] = [];
    Object.assign(window, { touches });
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      window.addEventListener(type, (event) => {
        const target = event.target as HTMLElement;
        const where = target.closest<HTMLElement>('[data-control]')?.dataset.control;
        const touch = `${event.type} on ${where ?? (target.id || target.tagName.toLowerCase())}`;
        touches.push({ touch, cancelled: event.defaultPrevented });
      });
    }
  });
  const fingers = await Fingers.on(page);

  // Two quick taps on the d-pad still take two steps.
  await fingers.tap(await spot(page, 'dpad', 'right'));
  await nextFrames(page);
  await fingers.tap(await spot(page, 'dpad', 'right'));
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.x === 14 && info.moving === false;
  });
  // A thumb sliding on B, a tap on the game, and one on the black bar beside it.
  const b = await spot(page, 'b');
  await fingers.press(1, b);
  await fingers.move(1, { x: b.x + 6, y: b.y + 4 });
  await fingers.lift(1);
  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('the game canvas is not on screen');
  await fingers.tap({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 });
  await fingers.tap({ x: canvas.x / 2, y: 40 });
  await nextFrames(page);

  const touches = (await page.evaluate(
    () => (window as Window & { touches?: unknown }).touches,
  )) as { touch: string; cancelled: boolean }[];
  expect(touches.filter(({ cancelled }) => !cancelled)).toEqual([]);
  expect(new Set(touches.map(({ touch }) => touch))).toEqual(
    new Set([
      'touchstart on dpad',
      'touchend on dpad',
      'touchstart on b',
      'touchmove on b',
      'touchend on b',
      'touchstart on canvas',
      'touchend on canvas',
      'touchstart on game',
      'touchend on game',
    ]),
  );
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  expect(errors).toEqual([]);
});

test('the controls follow when the game’s space changes size, without a window resize', async ({
  page,
}) => {
  await openTitle(page);
  const dpad = () => page.locator('[data-control="dpad"] .touch-art').boundingBox();
  // Where the layout puts the d-pad in a view this tall; an emulated phone has no notch.
  const expected = (height: number) =>
    layoutTouchControls({ width: 844, height }, { top: 0, right: 0, bottom: 0, left: 0 }).dpad;
  const expectAt = (
    box: { x: number; y: number; width: number; height: number } | null,
    at: ReturnType<typeof expected>,
  ) => {
    expect(box?.x).toBeCloseTo(at.x, 0);
    expect(box?.y).toBeCloseTo(at.y, 0);
    expect(box?.width).toBeCloseTo(at.width, 0);
  };
  expectAt(await dpad(), expected(390));
  expect(expected(300).y).not.toBeCloseTo(expected(390).y, 0);

  // As when a browser toolbar comes in, which doesn't always resize the window.
  await page.evaluate(() => document.getElementById('game')?.style.setProperty('height', '300px'));
  await expect.poll(async () => (await dpad())?.y).toBeCloseTo(expected(300).y, 0);
  expectAt(await dpad(), expected(300));
  await page.screenshot({ path: 'test-results/screenshots/touch-shorter-view.png' });
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
