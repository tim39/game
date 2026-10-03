import Phaser from 'phaser';
import { input } from '../systems/input/game-input';
import { session } from '../systems/session';
import type { DialogueLine } from '../ui/dialogue-box';
import type { DialogueRequest } from './dialogue';

const PAGES: readonly DialogueLine[] = [
  {
    name: 'Tamsin',
    portrait: 'portrait.tamsin',
    text: "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
  },
  {
    name: 'Tamsin',
    portrait: 'portrait.tamsin',
    text: "And mind the lighthouse steps. They've been grumbling at me all week.",
  },
  {
    name: 'Preview',
    text: 'This is a preview of the dialogue box. Real conversations arrive in milestone M2.',
  },
];

/**
 * A preview of the dialogue box, which New Game shows until the real opening exists: a few lines
 * in the real dialogue box, and then the field. Cancel goes back to the title.
 */
export class DialogueSampleScene extends Phaser.Scene {
  private page = 0;

  constructor() {
    super('dialogue-sample');
  }

  create(): void {
    this.page = 0;
    this.showPage();
  }

  override update(): void {
    if (!input.pressed('cancel')) return;
    this.scene.stop('dialogue');
    this.scene.start('title');
  }

  /** Read by `window.__game.inspect('dialogue-sample')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return { page: this.page, speaker: PAGES[this.page]?.name };
  }

  private showPage(): void {
    const line = PAGES[this.page];
    if (!line) {
      this.scene.start('field', session.state.location);
      return;
    }
    const onDone = (): void => {
      this.page += 1;
      this.showPage();
    };
    this.scene.launch('dialogue', { line, onDone } satisfies DialogueRequest);
  }
}
