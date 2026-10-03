import Phaser from 'phaser';
import { TEXT_SPEED } from '../data/balance';
import { input } from '../systems/input/game-input';
import {
  drawChoiceBox,
  drawDialogueBox,
  type DialogueLine,
  type DrawnChoices,
  type DrawnDialogue,
} from '../ui/dialogue-box';
import {
  isTyping,
  picked,
  showsChoices,
  showsPrompt,
  startDialogue,
  stepDialogue,
  visibleLines,
  type DialogueFlow,
} from '../ui/dialogue-flow';

/** What to show, and who to tell once the player is done: `scene.launch('dialogue', request)`. */
export interface DialogueRequest {
  /** The line to show. Without one, there are only the choices. */
  readonly line?: DialogueLine;
  /** Choices to pick from once the line is all showing. */
  readonly choices?: readonly string[];
  /** Types the line out (the default), or shows it all at once, as when it's been read already. */
  readonly typed?: boolean;
  /** Called with the index of the choice picked, or null for a line that was read. */
  readonly onDone: (picked: number | null) => void;
}

/** A frame longer than this (say, after the tab was hidden) counts as this long. */
const MAX_FRAME_MS = 100;

/**
 * The dialogue box, over the field: a line typed out, which Confirm shows all at once and then
 * closes; or choices under it, picked with Up, Down and Confirm. src/ui/dialogue-flow.ts decides
 * what happens; this draws it.
 */
export class DialogueScene extends Phaser.Scene {
  private request?: DialogueRequest;
  private flow?: DialogueFlow;
  private drawn?: DrawnDialogue;
  private choices?: DrawnChoices;

  constructor() {
    super('dialogue');
  }

  create(request: DialogueRequest): void {
    const { line, choices = [], typed = true } = request;
    this.request = request;
    this.drawn = line ? drawDialogueBox(this, line) : undefined;
    if (line && this.drawn?.overflow) {
      console.error(`Too long for one dialogue box (3 lines): "${line.text}"`);
    }
    const drawnChoices = choices.length > 0 ? drawChoiceBox(this, choices) : undefined;
    this.choices = drawnChoices;
    if (drawnChoices?.widths.some((width) => width > drawnChoices.maxWidth)) {
      console.error(`Too wide for the choice box: "${choices.join('", "')}"`);
    }
    this.flow = startDialogue(this.drawn?.lines ?? [], choices, typed);
    this.render();
  }

  override update(_time: number, delta: number): void {
    const { request, flow } = this;
    if (!request || !flow) return;
    const move = input.pressedOrRepeated('down') ? 1 : input.pressedOrRepeated('up') ? -1 : 0;
    const confirm = input.pressed('confirm');
    this.flow = stepDialogue(
      flow,
      { dt: Math.min(delta, MAX_FRAME_MS), confirm, move },
      TEXT_SPEED,
    );
    this.render();
    if (!this.flow.done) return;
    this.request = undefined;
    this.scene.stop();
    request.onDone(picked(this.flow));
  }

  /** Read by `window.__game.inspect('dialogue')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { request, flow, drawn } = this;
    if (!request || !flow) return {};
    return {
      name: request.line?.name ?? null,
      portrait: request.line?.portrait ?? null,
      text: request.line?.text ?? null,
      lines: drawn?.lines ?? [],
      lineWidths: drawn?.lineWidths ?? [],
      maxWidth: drawn?.maxWidth ?? null,
      shown: visibleLines(flow),
      typing: isTyping(flow),
      prompt: showsPrompt(flow),
      choices: showsChoices(flow) ? flow.choices : [],
      cursor: flow.cursor,
      choiceWidths: this.choices?.widths ?? [],
    };
  }

  private render(): void {
    const { flow, drawn, choices } = this;
    if (!flow) return;
    drawn?.showText(visibleLines(flow));
    drawn?.showPrompt(showsPrompt(flow));
    choices?.container.setVisible(showsChoices(flow));
    choices?.pointAt(flow.cursor);
  }
}
