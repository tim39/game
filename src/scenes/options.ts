import Phaser from 'phaser';
import { DIRECTIONS } from '../core/direction';
import { OPTIONS_TEXT } from '../data/ui-text';
import { audio } from '../systems/audio';
import { input } from '../systems/input/game-input';
import { VOLUME_STEPS, browserStorage, saveSettings, settings } from '../systems/settings';
import type { Box } from '../ui/battle-layout';
import { FONT, textMeasurer } from '../ui/fonts';
import { MENU_HEIGHT, MENU_SCALE, MENU_WIDTH } from '../ui/main-menu-layout';
import {
  OPTION_ROWS,
  canChange,
  openOptions,
  rowAt,
  stepOptions,
  valueText,
  volumeStep,
  type OptionRow,
  type OptionsMenu,
} from '../ui/options-flow';
import { OPTIONS_LAYOUT } from '../ui/options-layout';
import { wrapText } from '../ui/text-wrap';

export const OPTIONS_SCENE = 'options';

/** How the Options screen opens, over the title screen or the main menu, which waits for it. */
export interface OptionsStart {
  /** Called as it closes, with the settings kept. */
  readonly onClose: () => void;
}

/** Colours on the pack's cream panels, as in the main menu. */
const INK = 0x0b001e;
const FADED_INK = 0x9a8c9e;
const BROWN = 0x965340;
const BACKDROP = 0x14101c;
/** A volume's bar: the tenths it's at, and those it isn't. */
const FILLED = 0x965340;
const EMPTY = 0xd8c8b8;
/** What changing the sound volume plays, to hear how loud it now is. */
const SAMPLE = 'sfx.heal';

const { panel: PANEL, help: HELP, frame, content, cursor: CURSOR, value: VALUE } = OPTIONS_LAYOUT;

/**
 * The Options screen (see Screens in docs/DESIGN.md): a row for each setting, which takes effect as
 * it changes. src/ui/options-flow.ts decides what happens; this draws it in the main menu's cream
 * panels, puts the settings in place, and keeps them in the browser as it closes.
 */
export class OptionsScene extends Phaser.Scene {
  private start?: OptionsStart;
  private menu?: OptionsMenu;
  /** Everything that changes, made afresh each time. */
  private page?: Phaser.GameObjects.Container;
  private shown: { rows: string[]; help: string[] } = { rows: [], help: [] };
  private widthOf: (text: string) => number = (text) => text.length;

  constructor() {
    super(OPTIONS_SCENE);
  }

  create(start: OptionsStart): void {
    this.start = start;
    this.menu = openOptions();
    this.widthOf = textMeasurer(this, FONT.body);
    this.cameras.main.setZoom(MENU_SCALE).centerOn(MENU_WIDTH / 2, MENU_HEIGHT / 2);
    this.add.rectangle(0, 0, MENU_WIDTH, MENU_HEIGHT, BACKDROP).setOrigin(0);
    this.panel(PANEL);
    this.panel(HELP);
    this.add
      .bitmapText(PANEL.x + content.x, PANEL.y + content.y, FONT.body, OPTIONS_TEXT.title)
      .setTint(BROWN);
    this.page = this.add.container(0, 0);
    this.render();
    // Closed, it has nothing to show or report.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
    });
  }

  override update(): void {
    const { menu } = this;
    if (!menu) return;
    const step = stepOptions(
      menu,
      {
        move: DIRECTIONS.find((direction) => input.pressedOrRepeated(direction)) ?? null,
        confirm: input.pressed('confirm'),
        // Menu closes it too, as it does the save menu.
        cancel: input.pressed('cancel') || input.pressed('menu'),
      },
      settings,
    );
    if (step.close) {
      this.close();
      return;
    }
    const changed = step.settings !== settings;
    if (changed) {
      const louder = step.settings.soundVolume !== settings.soundVolume;
      Object.assign(settings, step.settings);
      // The music follows its volume by itself; a sound shows how loud sounds now are.
      if (louder) audio.playSound(SAMPLE);
    }
    if (changed || step.menu !== menu) {
      this.menu = step.menu;
      this.render();
    }
  }

  /** Read by `window.__game.inspect('options')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { menu } = this;
    if (!menu) return {};
    return { cursor: menu.cursor, row: rowAt(menu), ...this.shown };
  }

  /**
   * Keeps the settings for next time and closes. Scene changes wait for the next frame, so the
   * scene underneath never sees the press that closed it.
   */
  private close(): void {
    saveSettings(browserStorage());
    this.menu = undefined;
    this.scene.stop();
    this.start?.onClose();
  }

  /** Draws each row with its value, the ▶ on the one under the cursor, and what that one does. */
  private render(): void {
    const { menu, page } = this;
    if (!menu || !page) return;
    page.removeAll(true);
    this.shown = { rows: [], help: [] };
    OPTION_ROWS.forEach((row, index) => {
      const y = OPTIONS_LAYOUT.firstRow + index * OPTIONS_LAYOUT.row;
      const chosen = index === menu.cursor;
      this.text(PANEL, content.x + CURSOR, y, OPTIONS_TEXT.rows[row], chosen ? BROWN : INK);
      if (chosen) this.pointAt(PANEL, content.x, y);
      this.drawValue(row, y);
      this.shown.rows.push(`${OPTIONS_TEXT.rows[row]} ${valueText(row, settings)}`);
    });
    const help = wrapText(
      OPTIONS_TEXT.help[rowAt(menu)],
      OPTIONS_LAYOUT.room.help,
      this.widthOf,
    ).slice(0, OPTIONS_LAYOUT.room.helpLines);
    help.forEach((line, index) => {
      this.text(HELP, content.x, content.y + index * OPTIONS_LAYOUT.lineHeight, line, INK);
    });
    this.shown.help = help;
  }

  /**
   * A row's value between its arrows, each faded where the value can go no further that way: a
   * word, or for a volume, a bar of tenths.
   */
  private drawValue(row: OptionRow, y: number): void {
    const left = VALUE.left;
    const right = VALUE.right;
    const middle = (left + right) / 2;
    const arrows = this.add.graphics();
    const ay = PANEL.y + y + 1;
    const lx = PANEL.x + left;
    const rx = PANEL.x + right;
    const tint = (by: 1 | -1) => (canChange(row, settings, by) ? INK : FADED_INK);
    arrows.fillStyle(tint(-1)).fillTriangle(lx, ay + 2.5, lx + 3, ay, lx + 3, ay + 5);
    arrows.fillStyle(tint(1)).fillTriangle(rx, ay + 2.5, rx - 3, ay, rx - 3, ay + 5);
    this.page?.add(arrows);
    if (row === 'musicVolume' || row === 'soundVolume') {
      const { width, gap, height } = OPTIONS_LAYOUT.bar;
      const tenths = volumeStep(settings[row]);
      const span = VOLUME_STEPS * width + (VOLUME_STEPS - 1) * gap;
      const x0 = PANEL.x + middle - span / 2;
      const bar = this.add.graphics();
      for (let step = 0; step < VOLUME_STEPS; step++) {
        bar
          .fillStyle(step < tenths ? FILLED : EMPTY)
          .fillRect(x0 + step * (width + gap), ay, width, height);
      }
      this.page?.add(bar);
      return;
    }
    this.text(PANEL, middle, y, valueText(row, settings), INK, 0.5);
  }

  // Small helpers.

  /** A window: the choice box, nine-sliced to fill `box`. */
  private panel(box: Box): void {
    this.add
      .nineslice(
        box.x,
        box.y,
        'ui.choice-box',
        undefined,
        box.width,
        box.height,
        frame,
        frame,
        frame,
        frame,
      )
      .setOrigin(0);
  }

  /** Text in a panel, at (x, y) from its top-left; `originX` 0.5 centres it there. */
  private text(box: Box, x: number, y: number, text: string, tint: number, originX = 0) {
    const shown = this.add.bitmapText(box.x + x, box.y + y, FONT.body, text).setTint(tint);
    shown.setOrigin(originX, 0);
    this.page?.add(shown);
    return shown;
  }

  /** The ▶, like the choice box's, before a spot in a panel. */
  private pointAt(box: Box, x: number, y: number): void {
    const mark = this.add
      .graphics()
      .fillStyle(INK)
      .fillTriangle(0, 0, 0, 5, 3, 2.5)
      .setPosition(box.x + x, box.y + y + 1.5);
    this.page?.add(mark);
  }
}
