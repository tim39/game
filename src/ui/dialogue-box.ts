import Phaser from 'phaser';
import {
  DIALOGUE_BOX,
  DIALOGUE_BOX_ON_SCREEN,
  DIALOGUE_SCALE as SCALE,
  MAX_LINES,
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
  /** The lines shown: the text wrapped to fit, at most three. */
  readonly lines: readonly string[];
  /** Each shown line's width, and the most a line may be, in font pixels. */
  readonly lineWidths: readonly number[];
  readonly maxWidth: number;
  /** The text needed more than three lines, so some of it isn't shown. */
  readonly overflow: boolean;
}

/** Draws the dialogue box along the bottom of the screen, with a bobbing ▼ to say there's more. */
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
    container.add(
      scene.add
        .nineslice(
          x * SCALE,
          y * SCALE,
          'ui.dialogue-box-plain',
          undefined,
          width,
          height,
          corner,
          corner,
          corner,
          corner,
        )
        .setOrigin(0)
        .setScale(SCALE),
    );
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
  container.add(
    scene.add
      .bitmapText(
        (area.x + DIALOGUE_BOX.inset.x) * SCALE,
        (area.y + DIALOGUE_BOX.inset.y) * SCALE,
        FONT.body,
        lines.join('\n'),
      )
      .setScale(SCALE)
      .setTint(INK),
  );

  const marker = scene.add.graphics().fillStyle(INK).fillTriangle(0, 0, 10, 0, 5, 6);
  marker.setPosition((area.x + area.width - 10) * SCALE, (area.y + area.height - 7) * SCALE);
  container.add(marker);
  scene.tweens.add({ targets: marker, y: marker.y + 3, duration: 400, yoyo: true, repeat: -1 });

  return {
    container,
    lines,
    lineWidths: lines.map(widthOf),
    maxWidth,
    overflow: wrapped.length > MAX_LINES,
  };
}
