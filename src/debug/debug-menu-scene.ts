import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { input } from '../systems/input/game-input';
import { touchMode } from '../systems/input/touch-controls';
import { FONT } from '../ui/fonts';
import { DebugMenu, type DebugPage } from './debug-menu';
import { debugRootPage, type DebugMenuContext } from './debug-pages';

export const DEBUG_MENU = 'debug-menu';

/** What the menu is started with: `scene.start(DEBUG_MENU, start)`. */
export interface DebugMenuStart {
  readonly root: DebugPage;
  /** Closes the menu, and carries on whatever it paused. */
  readonly close: () => void;
}

const SCALE = 2; // the UI's scale, like the world's
/** The most items a page shows at once; longer pages scroll. */
const ROWS = 10;
const ROW_HEIGHT = 24;
const WIDTH = 560;
const LEFT = (GAME_WIDTH - WIDTH) / 2;
const PAD = 16;
/** From the panel's top edge to its first row, and from its last row to its bottom edge. */
const HEADER = 44;
const FOOTER = 40;
const CURSOR_X = LEFT + PAD;
const LABEL_X = CURSOR_X + 16;
const DETAIL_X = LEFT + WIDTH - PAD;
/** The least room between a label and its detail. */
const DETAIL_GAP = 16;

const BACKDROP = 0x14101c;
const GOLD = 0xf5c46b;
const TEXT = 0xe8e0f5;
const DIM = 0x8a7fa3;
const ON = 0x7ee08a;

interface Row {
  readonly label: Phaser.GameObjects.BitmapText;
  readonly detail: Phaser.GameObjects.BitmapText;
}

/**
 * Debug only: a menu over the game, which pauses whatever it opens over (see `installDebugMenu`).
 * Up and Down move, Confirm chooses, and Cancel goes back a page, or closes it from the first.
 */
export class DebugMenuScene extends Phaser.Scene {
  private menu?: DebugMenu;
  private close?: () => void;
  private panel?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.BitmapText;
  private rows: Row[] = [];
  private marks?: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.BitmapText;
  /** The notice drawn last, to tell when one comes in later, like an import's. */
  private drawnNotice: string | null = null;

  constructor() {
    super(DEBUG_MENU);
  }

  create(start: DebugMenuStart): void {
    this.menu = new DebugMenu(start.root, ROWS);
    this.close = start.close;
    this.panel = this.add.graphics();
    this.title = this.text(GOLD);
    this.rows = Array.from({ length: ROWS }, () => ({
      label: this.text(TEXT),
      detail: this.text(DIM).setOrigin(1, 0),
    }));
    this.marks = this.add.graphics();
    this.hint = this.text(DIM);
    this.draw();
    // Closed, it has nothing to show or report.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
    });
  }

  override update(): void {
    const { menu } = this;
    if (!menu) return;
    // Confirm first, so a press in the same frame as a move picks what was on screen.
    if (input.pressed('confirm')) menu.choose();
    else if (input.pressed('cancel')) {
      if (!menu.back()) this.close?.();
    } else if (input.pressedOrRepeated('down')) menu.move(1);
    else if (input.pressedOrRepeated('up')) menu.move(-1);
    else if (menu.notice === this.drawnNotice) return;
    this.draw();
  }

  /** Says something at the bottom of the menu, if it's still open: how an import went, say. */
  notify(notice: string): void {
    this.menu?.notify(notice);
  }

  /** Read by `window.__game.inspect('debug-menu')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    if (!this.menu) return {};
    const { title, items, cursor, top } = this.menu.view();
    return {
      title,
      cursor,
      top,
      notice: this.menu.notice,
      selected: items[cursor]?.label,
      items: items.map(({ label, detail, on, choose }) => ({
        label,
        detail: detail ?? null,
        on: on ?? null,
        enabled: choose !== undefined,
      })),
      hint: this.hint?.text,
    };
  }

  private text(tint: number): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(0, 0, FONT.body, '').setScale(SCALE).setTint(tint);
  }

  private draw(): void {
    const { menu, panel, title, marks, hint } = this;
    if (!menu || !panel || !title || !marks || !hint) return;
    const view = menu.view();
    const { items, cursor, top } = view;

    // The panel fits the page, up to ROWS items, in the middle of the screen.
    const shown = Math.min(Math.max(items.length, 1), ROWS);
    const height = HEADER + shown * ROW_HEIGHT + FOOTER;
    const panelTop = Math.round((GAME_HEIGHT - height) / 2);
    const rowsTop = panelTop + HEADER;
    panel
      .clear()
      .fillStyle(BACKDROP)
      .fillRect(LEFT, panelTop, WIDTH, height)
      .fillStyle(GOLD)
      .fillRect(LEFT, panelTop, WIDTH, 2)
      .fillRect(LEFT, panelTop + height - 2, WIDTH, 2)
      .fillRect(LEFT, panelTop, 2, height)
      .fillRect(LEFT + WIDTH - 2, panelTop, 2, height);
    title.setPosition(LEFT + PAD, panelTop + 14).setText(view.title);

    this.rows.forEach(({ label, detail }, row) => {
      const item = items[top + row];
      const y = rowsTop + row * ROW_HEIGHT;
      label.setPosition(LABEL_X, y);
      label.setText(item?.label ?? '').setTint(item?.choose ? TEXT : DIM);
      detail.setPosition(DETAIL_X, y);
      if (item?.on !== undefined) {
        detail.setText(item.on ? 'ON' : 'OFF').setTint(item.on ? ON : DIM);
      } else {
        detail.setText(item?.detail ?? '').setTint(DIM);
      }
      // A detail that would run into its label is left out, rather than drawn over it.
      if (label.width + DETAIL_GAP > DETAIL_X - LABEL_X - detail.width) detail.setText('');
    });

    // The cursor, like the title screen's, and arrows when there's more above or below.
    marks.clear().fillStyle(GOLD);
    if (items.length > 0) {
      const y = rowsTop + (cursor - top) * ROW_HEIGHT + 8;
      marks.fillTriangle(CURSOR_X, y - 6, CURSOR_X, y + 6, CURSOR_X + 8, y);
    }
    const x = DETAIL_X - 5;
    if (top > 0) marks.fillTriangle(x - 5, rowsTop - 5, x + 5, rowsTop - 5, x, rowsTop - 11);
    const rowsBottom = rowsTop + shown * ROW_HEIGHT;
    if (top + ROWS < items.length) {
      marks.fillTriangle(x - 5, rowsBottom - 4, x + 5, rowsBottom - 4, x, rowsBottom + 2);
    }

    // What just happened, or else what the buttons do.
    hint.setPosition(LEFT + PAD, panelTop + height - 26);
    this.drawnNotice = view.notice;
    if (view.notice !== null) hint.setText(view.notice).setTint(GOLD);
    else {
      hint.setText(touchMode() ? 'A: choose   B: back' : 'Z: choose   X: back   `: close');
      hint.setTint(DIM);
    }
  }
}

/**
 * Adds the debug menu to the game. The backtick key, or three fingers on the game on a touchscreen
 * (not on its touch controls), opens it over whatever is running, which pauses until it closes;
 * either again closes it. Closing and warping wait for the next frame, so the scenes that carry on
 * don't see the press that did it.
 */
export function installDebugMenu(
  game: Phaser.Game,
  context: Omit<DebugMenuContext, 'notify'>,
): void {
  game.scene.add(DEBUG_MENU, DebugMenuScene);
  let paused: string[] = [];

  const isOpen = (): boolean => game.scene.isActive(DEBUG_MENU);
  /** Runs `fn` at the start of the next frame, after input is read and before any scene updates. */
  const nextFrame = (fn: () => void): void => {
    game.events.once(Phaser.Core.Events.STEP, fn);
  };

  // Warping stops every scene, the menu and whatever it paused among them.
  const warp = (map: string, spawn: string): void =>
    nextFrame(() => {
      paused = [];
      context.warp(map, spawn);
    });
  const open = (): void => {
    // There's nothing to draw with until the fonts have loaded.
    if (isOpen() || !game.cache.bitmapFont.exists(FONT.body)) return;
    paused = game.scene.getScenes(true).map((scene) => scene.scene.key);
    for (const key of paused) game.scene.pause(key);
    const notify = (notice: string): void =>
      (game.scene.getScene(DEBUG_MENU) as DebugMenuScene).notify(notice);
    game.scene.start(DEBUG_MENU, {
      root: debugRootPage({ ...context, warp, notify }),
      close: () => nextFrame(close),
    } satisfies DebugMenuStart);
  };
  const close = (): void => {
    if (!isOpen()) return;
    game.scene.stop(DEBUG_MENU);
    for (const key of paused) if (game.scene.isPaused(key)) game.scene.resume(key);
    paused = [];
  };
  const toggle = (): void => {
    const wasOpen = isOpen();
    nextFrame(() => (wasOpen ? close() : open()));
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backquote' || event.repeat) return;
    event.preventDefault();
    toggle();
  });

  // Three fingers on the game toggle the menu once; it takes lifting them all to do it again.
  let armed = true;
  const onControl = (target: EventTarget): boolean =>
    target instanceof Element && target.closest('.touch-control') !== null;
  window.addEventListener(
    'touchstart',
    (event) => {
      const onGame = [...event.touches].filter((touch) => !onControl(touch.target)).length;
      if (!armed || onGame < 3) return;
      armed = false;
      toggle();
    },
    { capture: true },
  );
  const rearm = (event: TouchEvent): void => {
    if (event.touches.length === 0) armed = true;
  };
  window.addEventListener('touchend', rearm, { capture: true });
  window.addEventListener('touchcancel', rearm, { capture: true });
}
