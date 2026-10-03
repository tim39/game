import Phaser from 'phaser';
import { input } from '../systems/input/game-input';
import { session } from '../systems/session';
import { drawDialogueBox, type DrawnDialogue } from '../ui/dialogue-box';

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

/**
 * A static preview of the dialogue box, so the font and UI scale can be judged on a real screen.
 * M2 replaces it with the real dialogue system (typewriter text, choices, scripts). After the last
 * page, New Game carries on to the field; Cancel goes back to the title.
 */
export class DialogueSampleScene extends Phaser.Scene {
  private page = 0;
  private drawn?: DrawnDialogue;

  constructor() {
    super('dialogue-sample');
  }

  create(): void {
    this.page = 0;
    this.showPage();
  }

  override update(): void {
    if (input.pressed('cancel')) {
      this.scene.start('title');
    } else if (input.pressed('confirm')) {
      this.page += 1;
      if (this.page < PAGES.length) this.showPage();
      else this.scene.start('field', session.state.location);
    }
  }

  /** Read by `window.__game.inspect('dialogue-sample')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return {
      page: this.page,
      speaker: PAGES[this.page]?.speaker,
      lines: this.drawn?.lines,
      lineWidths: this.drawn?.lineWidths,
      maxWidth: this.drawn?.maxWidth,
    };
  }

  private showPage(): void {
    const page = PAGES[this.page];
    if (!page) return;
    this.drawn?.container.destroy();
    this.drawn = drawDialogueBox(this, {
      name: page.speaker,
      portrait: page.portrait,
      text: page.text,
    });
  }
}
