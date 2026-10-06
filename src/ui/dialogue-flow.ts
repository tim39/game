import type { MenuSound } from './menu-sound';

/**
 * What the dialogue box does, without the drawing: the typewriter, skipping it, the ▼ prompt and
 * the choices. DialogueScene feeds it each frame's time and presses, and draws what it shows.
 */
export interface DialogueFlow {
  /** The text, already wrapped to fit the box. */
  readonly lines: readonly string[];
  /** How many of the lines' characters are showing, counted along them; fractional while typing. */
  readonly shown: number;
  /** What the player picks from once the text is all showing. Empty for a line to read. */
  readonly choices: readonly string[];
  /** The choice the cursor is on. */
  readonly cursor: number;
  /** The player has read the line, or picked the choice under the cursor. */
  readonly done: boolean;
}

/** One frame's worth of what the player did. */
export interface DialogueInput {
  /** Milliseconds since the last frame. */
  readonly dt: number;
  /** Confirm was pressed. */
  readonly confirm: boolean;
  /** Up (-1) or down (1) was pressed, or held long enough to repeat; 0 for neither. */
  readonly move: -1 | 0 | 1;
}

/**
 * A new line in the box, typed out from the start, or all at once with `typed` false (when choices
 * come up under a line that's already been read). With no lines, there are only the choices.
 */
export function startDialogue(
  lines: readonly string[],
  choices: readonly string[] = [],
  typed = true,
): DialogueFlow {
  return { lines, shown: typed ? 0 : characterCount(lines), choices, cursor: 0, done: false };
}

/**
 * Moves the box on by one frame. While the text is typing, Confirm shows the rest of it at once.
 * Once it's all showing, Confirm says the player has read it; or, with choices, Up and Down move
 * the cursor, wrapping round, and Confirm picks one. A Confirm that finishes the typing does
 * nothing else, so a quick double press can't skip a line unread.
 */
export function stepDialogue(
  flow: DialogueFlow,
  { dt, confirm, move }: DialogueInput,
  charsPerSecond: number,
): DialogueFlow {
  if (flow.done) return flow;
  const total = characterCount(flow.lines);
  if (flow.shown < total) {
    const shown = confirm ? total : Math.min(total, flow.shown + (dt * charsPerSecond) / 1000);
    return { ...flow, shown };
  }
  const count = flow.choices.length;
  const cursor = count > 0 ? (((flow.cursor + move) % count) + count) % count : 0;
  return { ...flow, cursor, done: confirm };
}

/** The lines as far as the typewriter has got: whole characters only. */
export function visibleLines(flow: DialogueFlow): string[] {
  let left = Math.floor(flow.shown);
  return flow.lines.map((line) => {
    const visible = line.slice(0, Math.max(0, left));
    left -= line.length;
    return visible;
  });
}

/** The text is still typing out. */
export const isTyping = (flow: DialogueFlow): boolean => flow.shown < characterCount(flow.lines);

/** The ▼ shows: the text is all out, and Confirm goes on. */
export const showsPrompt = (flow: DialogueFlow): boolean =>
  !flow.done && !isTyping(flow) && flow.choices.length === 0;

/** The choices show: the text is all out, and the player is picking one. */
export const showsChoices = (flow: DialogueFlow): boolean =>
  !flow.done && !isTyping(flow) && flow.choices.length > 0;

/** The choice picked, once the player has picked one. */
export const picked = (flow: DialogueFlow): number | null =>
  flow.done && flow.choices.length > 0 ? flow.cursor : null;

/**
 * The sound a frame made, from the box as it was to as it is: the cursor moving between the
 * choices, or one picked. Reading a line makes none.
 */
export function choiceSound(before: DialogueFlow, after: DialogueFlow): MenuSound | null {
  if (!showsChoices(before)) return null;
  if (picked(after) !== null) return 'confirm';
  return after.cursor === before.cursor ? null : 'cursor';
}

function characterCount(lines: readonly string[]): number {
  return lines.reduce((count, line) => count + line.length, 0);
}
