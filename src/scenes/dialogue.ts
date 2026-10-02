import Phaser from 'phaser';
import { input } from '../systems/input/game-input';
import { drawDialogueBox, type DialogueLine, type DrawnDialogue } from '../ui/dialogue-box';

/** What to show, and who to tell once the player has read it: `scene.launch('dialogue', ...)`. */
export interface DialogueRequest {
  readonly line: DialogueLine;
  readonly onClose: () => void;
}

/**
 * The dialogue box, shown over the field: one line, until Confirm. The M2 dialogue task adds
 * typewriter text, skipping and choices.
 */
export class DialogueScene extends Phaser.Scene {
  private request?: DialogueRequest;
  private drawn?: DrawnDialogue;

  constructor() {
    super('dialogue');
  }

  create(request: DialogueRequest): void {
    this.request = request;
    this.drawn = drawDialogueBox(this, request.line);
    if (this.drawn.overflow) {
      console.error(`Too long for one dialogue box (3 lines): "${request.line.text}"`);
    }
  }

  override update(): void {
    const { request } = this;
    if (!request || !input.pressed('confirm')) return;
    this.request = undefined;
    this.drawn = undefined;
    this.scene.stop();
    request.onClose();
  }

  /** Read by `window.__game.inspect('dialogue')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { request, drawn } = this;
    if (!request || !drawn) return {};
    const { name, portrait = null, text } = request.line;
    const { lines, lineWidths, maxWidth } = drawn;
    return { name, portrait, text, lines, lineWidths, maxWidth };
  }
}
