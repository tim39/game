import Phaser from 'phaser';
import { MAP_FADE_MS, SCENE_FADE_MS } from '../data/balance';
import { UI_TEXT } from '../data/ui-text';
import { audio } from '../systems/audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { input } from '../systems/input/game-input';
import { touchMode } from '../systems/input/touch-controls';
import { saveSlots } from '../systems/saves';
import { loadGame, session, startNewGame } from '../systems/session';
import { CHOICE_BOX } from '../ui/dialogue-layout';
import { FONT, textMeasurer } from '../ui/fonts';
import { addGlow, drawPicture, type DrawnPicture } from '../ui/picture';
import type { FieldStart } from './field';
import { OPTIONS_SCENE, type OptionsStart } from './options';
import { SAVE_MENU_SCENE, type SaveMenuStart } from './save-menu';

interface MenuItem {
  readonly id: 'new-game' | 'continue' | 'options';
  readonly label: string;
  readonly enabled: boolean;
}

/** Continue is there once there's a save to carry on from. */
const menuItems = (canContinue: boolean): readonly MenuItem[] => [
  { id: 'new-game', label: 'New Game', enabled: true },
  { id: 'continue', label: 'Continue', enabled: canContinue },
  { id: 'options', label: 'Options', enabled: true },
];

/** Drawn at the world's scale, 2×, so its picture is a backdrop's size: 320×180 pixels. */
export const TITLE_SCALE = 2;
const WIDTH = GAME_WIDTH / TITLE_SCALE;
const HEIGHT = GAME_HEIGHT / TITLE_SCALE;

/** Saltmere's lighthouse at night (src/data/pictures.ts), under everything else. */
const PICTURE = 'title';
/** The name, the menu and the hint, over the picture and its lights. */
export const TITLE_DEPTH = 10;

const GOLD = 0xf5c46b;
const SHADOW = 0x0b001e;
const INK = 0x0b001e; // the pack's own glyph color, made for the light panel
const GREYED = 0x9a8fae;
const HINT = 0xd8d0e8;
const FLAME_GLOW = 0xffc870;

/** The game's name, with its flame over it, centred towards the top. */
const NAME_Y = 48;
const FLAME_Y = 22;
/** The flame's frames that flicker, of its sheet's rise and fall, and how fast. */
const FLAME_FRAMES = [2, 3, 4, 5, 4, 3];
const FLAME_FPS = 8;
/** The menu: a choice box, centred, its top this far down. */
const MENU_TOP = 88;
const HINT_Y = 168;

const MAX_FRAME_MS = 100;
const MUSIC = 'bgm.title';

/**
 * The title screen (see Screens in docs/DESIGN.md): Saltmere's lighthouse at night, the Tide
 * Beacon's beam turning over the sea; the game's name, with a flame over it; and New Game,
 * Continue and Options, in a choice box.
 */
export class TitleScene extends Phaser.Scene {
  private menu: readonly MenuItem[] = menuItems(false);
  private selected = 0;
  private cursorMoves = 0;
  private picture?: DrawnPicture;
  private cursor?: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.BitmapText;
  /** Fading out for a new game or a save, it takes no more choices. */
  private leaving = false;

  constructor() {
    super('title');
  }

  create(): void {
    // With a save to continue from, the cursor starts on Continue.
    const canContinue = saveSlots.hasAny();
    this.menu = menuItems(canContinue);
    this.selected = canContinue ? 1 : 0;
    this.cursorMoves = 0;
    this.leaving = false;
    // It starts with the player's first key press or touch, which browsers wait for.
    audio.playMusic(MUSIC);

    // It fades in, as the game does wherever it goes, though it takes choices at once.
    this.cameras.main
      .setZoom(TITLE_SCALE)
      .centerOn(WIDTH / 2, HEIGHT / 2)
      .fadeIn(MAP_FADE_MS, 0, 0, 0);
    this.picture = drawPicture(this, PICTURE);
    this.drawName();
    this.drawMenu();
    this.hint = this.add
      .bitmapText(WIDTH / 2, HINT_Y, FONT.body, '')
      .setOrigin(0.5)
      .setTint(HINT)
      .setDropShadow(1, 1, SHADOW, 1)
      .setDepth(TITLE_DEPTH);
    this.showHint();
  }

  override update(_time: number, delta: number): void {
    this.picture?.update(Math.min(delta, MAX_FRAME_MS));
    // A laptop with a touchscreen can switch to touch mode at any moment.
    this.showHint();
    if (this.leaving) return;
    // Confirm first, so a press that lands in the same frame as a move picks what was on screen.
    if (input.pressed('confirm')) this.choose();
    if (input.pressedOrRepeated('down')) this.moveCursor(1);
    if (input.pressedOrRepeated('up')) this.moveCursor(-1);
  }

  /** Read by `window.__game.inspect('title')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return {
      selected: this.menu[this.selected]?.label,
      items: this.menu.map(({ label, enabled }) => ({ label, enabled })),
      cursorMoves: this.cursorMoves,
      hint: this.hint?.text,
      picture: this.picture?.id ?? null,
      fading: this.cameras.main.fadeEffect.isRunning,
    };
  }

  /** The game's name in gold, and over it a little flame, flickering in its glow. */
  private drawName(): void {
    this.add
      .bitmapText(WIDTH / 2, NAME_Y, FONT.display, 'The Fifth Flame')
      .setScale(2)
      .setOrigin(0.5)
      .setTint(GOLD)
      .setDropShadow(1, 1, SHADOW, 1)
      .setDepth(TITLE_DEPTH);
    addGlow(this, WIDTH / 2, FLAME_Y, 16, FLAME_GLOW, TITLE_DEPTH);
    if (!this.anims.exists('vfx.flame')) {
      this.anims.create({
        key: 'vfx.flame',
        frames: this.anims.generateFrameNumbers('vfx.flame', { frames: FLAME_FRAMES }),
        frameRate: FLAME_FPS,
        repeat: -1,
      });
    }
    this.add
      .sprite(WIDTH / 2, FLAME_Y, 'vfx.flame')
      .setScale(2)
      .setDepth(TITLE_DEPTH)
      .play('vfx.flame');
  }

  /** The menu, in the pack's choice box like a script's choices, with the ▶ by the one chosen. */
  private drawMenu(): void {
    const { frame, inset, cursor: cursorRoom, lineHeight } = CHOICE_BOX;
    const widthOf = textMeasurer(this, FONT.body);
    const textWidth = Math.max(...this.menu.map(({ label }) => widthOf(label)));
    const width = (frame + inset.x) * 2 + cursorRoom + textWidth;
    const height = (frame + inset.y) * 2 + this.menu.length * lineHeight;
    const left = Math.round((WIDTH - width) / 2);
    this.add
      .nineslice(
        left,
        MENU_TOP,
        'ui.choice-box',
        undefined,
        width,
        height,
        frame,
        frame,
        frame,
        frame,
      )
      .setOrigin(0)
      .setDepth(TITLE_DEPTH);
    this.menu.forEach((item, index) => {
      this.add
        .bitmapText(
          left + frame + inset.x + cursorRoom,
          MENU_TOP + frame + inset.y + index * lineHeight,
          FONT.body,
          item.label,
        )
        .setTint(item.enabled ? INK : GREYED)
        .setDepth(TITLE_DEPTH);
    });
    this.cursor = this.add.graphics().setDepth(TITLE_DEPTH);
    this.cursor.setPosition(left + frame + inset.x, MENU_TOP + frame + inset.y + 1);
    this.drawCursor();
  }

  private moveCursor(step: number): void {
    this.selected = (this.selected + step + this.menu.length) % this.menu.length;
    this.cursorMoves += 1;
    audio.playMenuSound('cursor');
    this.drawCursor();
  }

  /** Chooses what's under the cursor, or buzzes for Continue with no save to carry on from. */
  private choose(): void {
    const item = this.menu[this.selected];
    audio.playMenuSound(item?.enabled ? 'confirm' : 'buzzer');
    if (!item?.enabled) return;
    if (item.id === 'continue') {
      this.continueGame();
      return;
    }
    if (item.id === 'options') {
      this.scene.pause();
      this.scene.launch(OPTIONS_SCENE, {
        onClose: () => this.scene.resume(),
      } satisfies OptionsStart);
      return;
    }
    // A new game fades out slowly, as story scenes do, and starts black, for its opening to fade
    // in (see src/data/events/saltmere.ts).
    this.leave(SCENE_FADE_MS, () => {
      startNewGame();
      this.scene.start('field', { ...session.state.location, dark: true } satisfies FieldStart);
    });
  }

  /** Opens the save menu to pick a save, and carries on from it where it was saved. */
  private continueGame(): void {
    this.scene.pause();
    this.scene.launch(SAVE_MENU_SCENE, {
      mode: 'load',
      onClose: () => this.scene.resume(),
      onLoad: (state) => {
        loadGame(state);
        // The screen, paused under the save menu, carries on to fade out for the save's place.
        this.scene.resume();
        this.leave(MAP_FADE_MS, () =>
          this.scene.start('field', state.location satisfies FieldStart),
        );
      },
    } satisfies SaveMenuStart);
  }

  /** Fades out, taking no more choices, and then goes where was chosen. */
  private leave(ms: number, then: () => void): void {
    this.leaving = true;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
    camera.fadeOut(ms, 0, 0, 0);
  }

  /** How to choose: with keys, or with the touch controls' A button. */
  private showHint(): void {
    const text = touchMode() ? UI_TEXT.chooseWithTouch : UI_TEXT.chooseWithKeys;
    if (this.hint && this.hint.text !== text) this.hint.setText(text);
  }

  /** The ▶, 3 pixels wide and 5 tall, level with the middle of the chosen line's letters. */
  private drawCursor(): void {
    if (!this.cursor) return;
    const y = this.selected * CHOICE_BOX.lineHeight;
    this.cursor
      .clear()
      .fillStyle(INK)
      .fillTriangle(0, y, 0, y + 5, 3, y + 2.5);
  }
}
