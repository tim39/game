import Phaser from 'phaser';
import {
  CHOICE_BOX,
  DIALOGUE_BOX,
  DIALOGUE_BOX_ON_SCREEN,
  DIALOGUE_SCALE as SCALE,
  MAX_LINES,
  choiceBoxOnScreen,
  lineWidth,
} from './dialogue-layout';
import { FONT, textMeasurer } from './fonts';
import { wrapText } from './text-wrap';

const INK = 0x0b001e; // the pack's own glyph color, made for the light panel
const PAPER = 0xf2eaf1;

/** One box of dialogue. */
export interface DialogueLine {
  /** Shown in the tab above the box; empty for no name and no tab (a sign, say). */
  readonly name: string;
  /** The image key of the speaker's portrait, if they have one. */
  readonly portrait?: string;
  readonly text: string;
}

export interface DrawnDialogue {
  readonly container: Phaser.GameObjects.Container;
  /** The lines to show: the text wrapped to fit, at most three. */
  readonly lines: readonly string[];
  /** Each line's width, and the most a line may be, in font pixels. */
  readonly lineWidths: readonly number[];
  readonly maxWidth: number;
  /** The text needed more than three lines, so some of it isn't shown. */
  readonly overflow: boolean;
  /** Shows the text as far as the typewriter has got: the start of each line. */
  showText(lines: readonly string[]): void;
  /** Shows or hides the bobbing ▼ that says Confirm goes on. */
  showPrompt(visible: boolean): void;
}

/**
 * Draws the dialogue box along the bottom of the screen, its text still to be shown (`showText`)
 * and its ▼ hidden (`showPrompt`).
 */
export function drawDialogueBox(scene: Phaser.Scene, line: DialogueLine): DrawnDialogue {
  const widthOf = textMeasurer(scene, FONT.body);
  const container = scene.add.container(DIALOGUE_BOX_ON_SCREEN.x, DIALOGUE_BOX_ON_SCREEN.y);

  const withPortrait = line.portrait !== undefined;
  const withName = line.name !== '' || withPortrait;
  if (withName) {
    container.add(
      scene.add
        .image(0, 0, withPortrait ? 'ui.dialogue-box-portrait' : 'ui.dialogue-box')
        .setOrigin(0)
        .setScale(SCALE),
    );
  } else {
    const { x, y, width, height, corner } = DIALOGUE_BOX.panel;
    container.add(nineSlice(scene, 'ui.dialogue-box-plain', x, y, width, height, corner));
  }
  if (line.portrait) {
    const { x, y } = DIALOGUE_BOX.portrait;
    container.add(
      scene.add
        .image(x * SCALE, y * SCALE, line.portrait)
        .setOrigin(0)
        .setScale(SCALE),
    );
  }

  if (withName) {
    const tab = DIALOGUE_BOX.nameTab;
    container.add(
      scene.add
        .bitmapText((tab.x + 4) * SCALE, (tab.y + 1) * SCALE, FONT.body, line.name)
        .setScale(SCALE)
        .setTint(PAPER),
    );
  }

  const area = withPortrait ? DIALOGUE_BOX.textArea.withPortrait : DIALOGUE_BOX.textArea.plain;
  const maxWidth = lineWidth(withPortrait);
  const wrapped = wrapText(line.text, maxWidth, widthOf);
  const lines = wrapped.slice(0, MAX_LINES);
  const text = scene.add
    .bitmapText(
      (area.x + DIALOGUE_BOX.inset.x) * SCALE,
      (area.y + DIALOGUE_BOX.inset.y) * SCALE,
      FONT.body,
      '',
    )
    .setScale(SCALE)
    .setTint(INK);
  container.add(text);

  const marker = scene.add.graphics().fillStyle(INK).fillTriangle(0, 0, 10, 0, 5, 6);
  marker.setPosition((area.x + area.width - 10) * SCALE, (area.y + area.height - 7) * SCALE);
  marker.setVisible(false);
  container.add(marker);
  scene.tweens.add({ targets: marker, y: marker.y + 3, duration: 400, yoyo: true, repeat: -1 });

  return {
    container,
    lines,
    lineWidths: lines.map(widthOf),
    maxWidth,
    overflow: wrapped.length > MAX_LINES,
    showText: (shown) => {
      const joined = shown.join('\n');
      if (text.text !== joined) text.setText(joined);
    },
    showPrompt: (visible) => marker.setVisible(visible),
  };
}

export interface DrawnChoices {
  readonly container: Phaser.GameObjects.Container;
  /** Each choice's width, and the most one may be, in font pixels. */
  readonly widths: readonly number[];
  readonly maxWidth: number;
  /** Puts the ▶ beside a choice. */
  pointAt(index: number): void;
}

/** Draws the choice box over the dialogue box, one choice to a line, with the ▶ on the first. */
export function drawChoiceBox(scene: Phaser.Scene, choices: readonly string[]): DrawnChoices {
  const widthOf = textMeasurer(scene, FONT.body);
  const widths = choices.map(widthOf);
  const { x, y, width, height } = choiceBoxOnScreen(Math.max(0, ...widths), choices.length);
  const { frame, inset, cursor: cursorRoom, lineHeight } = CHOICE_BOX;
  const container = scene.add.container(x, y);
  // ▶, 3 box pixels wide and 5 tall, level with the middle of the letters.
  const cursor = scene.add.graphics().fillStyle(INK).fillTriangle(0, 0, 0, 10, 6, 5);
  container.add([
    nineSlice(scene, 'ui.choice-box', 0, 0, width / SCALE, height / SCALE, frame),
    scene.add
      .bitmapText(
        (frame + inset.x + cursorRoom) * SCALE,
        (frame + inset.y) * SCALE,
        FONT.body,
        choices.join('\n'),
      )
      .setScale(SCALE)
      .setTint(INK),
    cursor,
  ]);
  const pointAt = (index: number): void => {
    cursor.setPosition(
      (frame + inset.x) * SCALE,
      (frame + inset.y + index * lineHeight + 1) * SCALE,
    );
  };
  pointAt(0);
  return { container, widths, maxWidth: CHOICE_BOX.maxTextWidth, pointAt };
}

/** A box image sliced at its `corner`-pixel frame and stretched to `width`×`height`, at 2×. */
function nineSlice(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  width: number,
  height: number,
  corner: number,
): Phaser.GameObjects.NineSlice {
  return scene.add
    .nineslice(x * SCALE, y * SCALE, key, undefined, width, height, corner, corner, corner, corner)
    .setOrigin(0)
    .setScale(SCALE);
}
