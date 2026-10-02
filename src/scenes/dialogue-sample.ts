import Phaser from 'phaser';
import { NEW_GAME_START } from '../data/new-game';
import { input } from '../systems/input/game-input';
import { DIALOGUE_BOX, MAX_LINES, lineWidth } from '../ui/dialogue-layout';
import { FONT, textMeasurer } from '../ui/fonts';
import { wrapText } from '../ui/text-wrap';

interface Page {
  readonly speaker: string;
  readonly portrait?: string;
  readonly text: string;
}

const PAGES: readonly Page[] = [
  {
    speaker: 'Tamsin',
    portrait: 'portrait.tamsin',
    text: "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
  },
  {
    speaker: 'Tamsin',
    portrait: 'portrait.tamsin',
    text: "And mind the lighthouse steps. They've been grumbling at me all week.",
  },
  {
    speaker: 'Preview',
    text: 'This is a preview of the dialogue box. Real conversations arrive in milestone M2.',
  },
];

const SCALE = 2;
const INK = 0x0b001e; // the pack's own glyph color, made for the light panel
const PAPER = 0xf2eaf1;

/**
 * A static preview of the dialogue box, so the font and UI scale can be judged on a real screen.
 * M2 replaces it with the real dialogue system (typewriter text, choices, scripts). After the last
 * page, New Game carries on to the field; Cancel goes back to the title.
 */
export class DialogueSampleScene extends Phaser.Scene {
  private page = 0;
  private shownLines: string[] = [];
  private maxWidth = 0;
  private widthOf: (text: string) => number = (text) => text.length;
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super('dialogue-sample');
  }

  create(): void {
    this.page = 0;
    this.widthOf = textMeasurer(this, FONT.body);
    this.showPage();
  }

  override update(): void {
    if (input.pressed('cancel')) {
      this.scene.start('title');
    } else if (input.pressed('confirm')) {
      this.page += 1;
      if (this.page < PAGES.length) this.showPage();
      else this.scene.start('field', NEW_GAME_START);
    }
  }

  /** Read by `window.__game.inspect('dialogue-sample')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return {
      page: this.page,
      speaker: PAGES[this.page]?.speaker,
      lines: this.shownLines,
      lineWidths: this.shownLines.map(this.widthOf),
      maxWidth: this.maxWidth,
    };
  }

  private showPage(): void {
    const page = PAGES[this.page];
    if (!page) return;
    this.layer?.destroy();

    const boxX = (this.scale.width - DIALOGUE_BOX.width * SCALE) / 2;
    const boxY = this.scale.height - DIALOGUE_BOX.height * SCALE - 12;
    const layer = this.add.container(boxX, boxY);
    this.layer = layer;

    const withPortrait = page.portrait !== undefined;
    layer.add(
      this.add
        .image(0, 0, withPortrait ? 'ui.dialogue-box-portrait' : 'ui.dialogue-box')
        .setOrigin(0)
        .setScale(SCALE),
    );
    if (page.portrait) {
      const { x, y } = DIALOGUE_BOX.portrait;
      layer.add(
        this.add
          .image(x * SCALE, y * SCALE, page.portrait)
          .setOrigin(0)
          .setScale(SCALE),
      );
    }

    const tab = DIALOGUE_BOX.nameTab;
    layer.add(
      this.add
        .bitmapText((tab.x + 4) * SCALE, (tab.y + 1) * SCALE, FONT.body, page.speaker)
        .setScale(SCALE)
        .setTint(PAPER),
    );

    const area = withPortrait ? DIALOGUE_BOX.textArea.withPortrait : DIALOGUE_BOX.textArea.plain;
    this.maxWidth = lineWidth(withPortrait);
    this.shownLines = wrapText(page.text, this.maxWidth, this.widthOf).slice(0, MAX_LINES);
    layer.add(
      this.add
        .bitmapText(
          (area.x + DIALOGUE_BOX.inset.x) * SCALE,
          (area.y + DIALOGUE_BOX.inset.y) * SCALE,
          FONT.body,
          this.shownLines.join('\n'),
        )
        .setScale(SCALE)
        .setTint(INK),
    );

    // The ▼ "more" marker, bobbing in the panel's bottom-right corner.
    const marker = this.add.graphics().fillStyle(INK).fillTriangle(0, 0, 10, 0, 5, 6);
    marker.setPosition((area.x + area.width - 10) * SCALE, (area.y + area.height - 7) * SCALE);
    layer.add(marker);
    this.tweens.add({ targets: marker, y: marker.y + 3, duration: 400, yoyo: true, repeat: -1 });
  }
}
