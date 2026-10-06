import Phaser from 'phaser';
import { GAME_OVER_FADE_MS, MAP_FADE_MS } from '../data/balance';
import { GAME_OVER_TEXT, UI_TEXT } from '../data/ui-text';
import { audio } from '../systems/audio';
import { GAME_WIDTH } from '../systems/display';
import { input } from '../systems/input/game-input';
import { touchMode } from '../systems/input/touch-controls';
import { saveSlots } from '../systems/saves';
import { loadGame } from '../systems/session';
import { FONT, textMeasurer } from '../ui/fonts';
import {
  GAME_OVER_CHOICES,
  canChoose,
  openGameOverMenu,
  stepGameOverMenu,
  type GameOverChoice,
  type GameOverMenu,
} from '../ui/game-over-menu';
import type { FieldStart } from './field';
import { SAVE_MENU_SCENE, type SaveMenuStart } from './save-menu';

export const GAME_OVER_SCENE = 'game-over';

/** Plays as a battle is lost, and stops if it's still playing as the Game Over screen goes. */
export const GAME_OVER_JINGLE = 'sfx.game-over';

/** How the Game Over screen starts, once a battle is lost: `scene.start(GAME_OVER_SCENE, start)`. */
export interface GameOverStart {
  /**
   * Fights the battle lost again, from its first turn. It's called as the screen closes, which
   * waits for the next frame, as scene changes do; the battle should start the same way, so that
   * it starts once the screen has gone.
   */
  readonly retry: () => void;
}

const SCALE = 2; // the UI's scale, like the world's
const COLD = 0x8a7fa3; // the Gloam's violet-grey, as on the party when they're down
const TEXT = 0xe8e0f5;
const DIM = 0x5a5270;
const GOLD = 0xf5c46b;
// Laid out like the title screen.
const HEADING_Y = 104;
const MENU_TOP = 192;
const MENU_SPACING = 24;
const HINT_Y = 330;
/** How far left of the choices the cursor's ▶ sits. */
const CURSOR_GAP = 20;

/**
 * The Game Over screen, once a battle is lost (see Winning and losing in docs/DESIGN.md): Retry
 * battle fights it again from its first turn, Load save opens the save menu to carry on from a
 * save, and Title goes back to the title screen. It fades in from the battle's black, and takes
 * no choice until it has. src/ui/game-over-menu.ts decides what happens; this draws it.
 *
 * The music the battle paused (the field's) stays paused through it, and through a retry, for the
 * battle fought again to hand back as it ends. Leaving for the title or a save, the battle is over
 * for good: that music gives way to what comes next, and every other scene still there stops,
 * such as the field asleep under the battle.
 */
export class GameOverScene extends Phaser.Scene {
  private start?: GameOverStart;
  private menu?: GameOverMenu;
  /** Taking choices: once it has faded in, until one is made. */
  private ready = false;
  /** The battle is being fought again, so the music it paused stays paused. */
  private retrying = false;
  private menuX = 0;
  private cursor?: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.BitmapText;

  constructor() {
    super(GAME_OVER_SCENE);
  }

  create(start: GameOverStart): void {
    this.start = start;
    this.ready = false;
    this.retrying = false;
    const menu = openGameOverMenu(saveSlots.hasAny());
    this.menu = menu;
    const centerX = GAME_WIDTH / 2;
    this.add
      .bitmapText(centerX, HEADING_Y, FONT.display, GAME_OVER_TEXT.heading)
      .setScale(4)
      .setOrigin(0.5)
      .setTint(COLD);

    // The choices, lined up on their left, the longest across the middle.
    const widthOf = textMeasurer(this, FONT.body);
    const widest = Math.max(...GAME_OVER_CHOICES.map((choice) => widthOf(labelOf(choice))));
    this.menuX = Math.round((GAME_WIDTH - widest * SCALE) / 2);
    GAME_OVER_CHOICES.forEach((choice, index) => {
      this.add
        .bitmapText(this.menuX, MENU_TOP + index * MENU_SPACING, FONT.body, labelOf(choice))
        .setScale(SCALE)
        .setOrigin(0, 0.5)
        .setTint(canChoose(menu, choice) ? TEXT : DIM);
    });
    this.hint = this.add
      .bitmapText(centerX, HINT_Y, FONT.body, '')
      .setScale(SCALE)
      .setOrigin(0.5)
      .setTint(DIM);
    this.showHint();
    this.cursor = this.add.graphics();
    this.drawCursor();

    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.ready = true;
    });
    camera.fadeIn(GAME_OVER_FADE_MS, 0, 0, 0);

    // Closed, it has nothing to show or report, and its jingle doesn't play on into what's next.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
      this.ready = false;
      audio.stopSound(GAME_OVER_JINGLE);
      if (!this.retrying) audio.resumeMusic();
    });
  }

  override update(): void {
    // A laptop with a touchscreen can switch to touch mode at any moment.
    this.showHint();
    const { menu } = this;
    if (!menu || !this.ready) return;
    const step = stepGameOverMenu(menu, {
      move: input.pressedOrRepeated('down') ? 1 : input.pressedOrRepeated('up') ? -1 : 0,
      confirm: input.pressed('confirm'),
    });
    this.menu = step.menu;
    if (step.menu.cursor !== menu.cursor) this.drawCursor();
    if (step.chosen) this.choose(step.chosen);
  }

  /** Read by `window.__game.inspect('game-over')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { menu } = this;
    if (!menu) return {};
    const selected = GAME_OVER_CHOICES[menu.cursor];
    return {
      ready: this.ready,
      selected: selected === undefined ? null : labelOf(selected),
      items: GAME_OVER_CHOICES.map((choice) => ({
        label: labelOf(choice),
        enabled: canChoose(menu, choice),
      })),
      hint: this.hint?.text,
    };
  }

  private choose(choice: GameOverChoice): void {
    switch (choice) {
      case 'retry':
        // The battle takes over the music it paused, and hands it back as it ends.
        this.fadeOut(() => {
          this.retrying = true;
          this.scene.stop();
          this.start?.retry();
        });
        return;
      case 'load':
        this.loadSave();
        return;
      case 'title':
        this.fadeOut(() => this.leave('title'));
        return;
    }
  }

  /** Opens the save menu over the screen, which waits until it closes, to carry on from a save. */
  private loadSave(): void {
    this.scene.pause();
    this.scene.launch(SAVE_MENU_SCENE, {
      mode: 'load',
      onClose: () => this.scene.resume(),
      onLoad: (state) => {
        loadGame(state);
        this.leave('field', state.location satisfies FieldStart);
      },
    } satisfies SaveMenuStart);
  }

  /**
   * Leaves the battle lost behind for good, for the title screen or a saved game: every other
   * scene still there stops too, such as the field asleep under the battle. Scene changes wait for
   * the next frame, so nothing that carries on sees the press that chose this.
   */
  private leave(key: 'title' | 'field', data?: FieldStart): void {
    this.menu = undefined;
    for (const scene of this.game.scene.getScenes(false)) {
      const { sys } = scene;
      if (scene === this || !(sys.isActive() || sys.isPaused() || sys.isSleeping())) continue;
      this.scene.stop(scene.scene.key);
    }
    this.scene.start(key, data);
  }

  /** Fades the screen out, taking no more choices, and then does what was chosen. */
  private fadeOut(then: () => void): void {
    this.ready = false;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
    camera.fadeOut(MAP_FADE_MS, 0, 0, 0);
  }

  /** How to choose: with keys, or with the touch controls' A button. */
  private showHint(): void {
    const text = touchMode() ? UI_TEXT.chooseWithTouch : UI_TEXT.chooseWithKeys;
    if (this.hint && this.hint.text !== text) this.hint.setText(text);
  }

  /** The ▶ before the choice under the cursor, like the title screen's. */
  private drawCursor(): void {
    const { cursor, menu } = this;
    if (!cursor || !menu) return;
    const x = this.menuX - CURSOR_GAP;
    const y = MENU_TOP + menu.cursor * MENU_SPACING;
    cursor
      .clear()
      .fillStyle(GOLD)
      .fillTriangle(x, y - 6, x, y + 6, x + 8, y);
  }
}

const labelOf = (choice: GameOverChoice): string => GAME_OVER_TEXT.choices[choice];
