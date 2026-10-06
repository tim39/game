import { describe, expect, test } from 'vitest';
import {
  choiceSound,
  isTyping,
  picked,
  showsChoices,
  showsPrompt,
  startDialogue,
  stepDialogue,
  visibleLines,
  type DialogueFlow,
  type DialogueInput,
} from './dialogue-flow';

/** 50 characters a second: one every 20 ms. */
const SPEED = 50;
const LINES = ['Hello there,', 'Rowan.'];
const idle: DialogueInput = { dt: 0, confirm: false, move: 0 };

const step = (flow: DialogueFlow, input: Partial<DialogueInput>): DialogueFlow =>
  stepDialogue(flow, { ...idle, ...input }, SPEED);

/** Runs `ms` milliseconds of frames with nothing pressed. */
function wait(flow: DialogueFlow, ms: number, frameMs = 16): DialogueFlow {
  for (let t = 0; t < ms; t += frameMs) flow = step(flow, { dt: Math.min(frameMs, ms - t) });
  return flow;
}

describe('the typewriter', () => {
  test('types the text out a character at a time, across the lines', () => {
    let flow = startDialogue(LINES);
    expect(visibleLines(flow)).toEqual(['', '']);
    expect(isTyping(flow)).toBe(true);
    flow = wait(flow, 100);
    expect(visibleLines(flow)).toEqual(['Hello', '']);
    flow = wait(flow, 200);
    expect(visibleLines(flow)).toEqual(['Hello there,', 'Row']);
    flow = wait(flow, 1000);
    expect(visibleLines(flow)).toEqual(LINES);
    expect(isTyping(flow)).toBe(false);
  });

  test('keeps the same pace however the frames fall', () => {
    const smooth = wait(startDialogue(LINES), 200, 10);
    const choppy = wait(startDialogue(LINES), 200, 50);
    expect(visibleLines(smooth)).toEqual(visibleLines(choppy));
  });

  test('shows the ▼ only once the text is all out', () => {
    let flow = startDialogue(LINES);
    expect(showsPrompt(flow)).toBe(false);
    flow = wait(flow, 1000);
    expect(showsPrompt(flow)).toBe(true);
  });

  test('can show a line all at once', () => {
    const flow = startDialogue(LINES, [], false);
    expect(visibleLines(flow)).toEqual(LINES);
    expect(showsPrompt(flow)).toBe(true);
  });
});

describe('Confirm', () => {
  test('shows the rest of the text at once, and only then goes on', () => {
    let flow = wait(startDialogue(LINES), 100);
    flow = step(flow, { confirm: true });
    expect(visibleLines(flow)).toEqual(LINES);
    // The press that finished the typing doesn't also close the box.
    expect(flow.done).toBe(false);
    expect(showsPrompt(flow)).toBe(true);
    flow = step(flow, { confirm: true });
    expect(flow.done).toBe(true);
    expect(showsPrompt(flow)).toBe(false);
    expect(picked(flow)).toBeNull();
  });

  test('after the end changes nothing', () => {
    const done = step(startDialogue(LINES, [], false), { confirm: true });
    expect(step(done, { confirm: true, dt: 100, move: 1 })).toBe(done);
  });
});

describe('choices', () => {
  const CHOICES = ['On my way!', 'Five more minutes?', 'Tell me again.'];

  test('come up once the text is all out', () => {
    let flow = startDialogue(LINES, CHOICES);
    expect(showsChoices(flow)).toBe(false);
    flow = step(flow, { move: 1 });
    expect(flow.cursor).toBe(0);
    flow = wait(flow, 1000);
    expect(showsChoices(flow)).toBe(true);
    // No ▼ while there's a choice to make.
    expect(showsPrompt(flow)).toBe(false);
  });

  test('have a cursor that wraps round both ends', () => {
    let flow = startDialogue([], CHOICES);
    expect(flow.cursor).toBe(0);
    flow = step(flow, { move: -1 });
    expect(flow.cursor).toBe(2);
    flow = step(flow, { move: 1 });
    flow = step(flow, { move: 1 });
    expect(flow.cursor).toBe(1);
  });

  test('pick the one under the cursor', () => {
    let flow = startDialogue(LINES, CHOICES, false);
    flow = step(flow, { move: 1 });
    expect(picked(flow)).toBeNull();
    flow = step(flow, { confirm: true });
    expect(flow.done).toBe(true);
    expect(showsChoices(flow)).toBe(false);
    expect(picked(flow)).toBe(1);
  });

  test('need the text read first: Confirm while typing only shows the rest', () => {
    let flow = step(startDialogue(LINES, CHOICES), { confirm: true });
    expect(flow.done).toBe(false);
    expect(showsChoices(flow)).toBe(true);
    flow = step(flow, { confirm: true });
    expect(picked(flow)).toBe(0);
  });

  test('click as the cursor moves, and confirm as one is picked', () => {
    const flow = startDialogue(LINES, CHOICES, false);
    expect(choiceSound(flow, step(flow, { move: 1 }))).toBe('cursor');
    expect(choiceSound(flow, step(flow, { confirm: true }))).toBe('confirm');
    expect(choiceSound(flow, step(flow, { dt: 100 }))).toBeNull();
    // With one choice, the cursor has nowhere to go.
    const one = startDialogue(LINES, ['Yes.'], false);
    expect(choiceSound(one, step(one, { move: 1 }))).toBeNull();
  });

  test('make no sound until they show, and reading a line makes none', () => {
    const typing = startDialogue(LINES, CHOICES);
    expect(choiceSound(typing, step(typing, { confirm: true }))).toBeNull();
    const line = startDialogue(LINES, [], false);
    expect(choiceSound(line, step(line, { confirm: true }))).toBeNull();
    const done = step(startDialogue(LINES, CHOICES, false), { confirm: true });
    expect(choiceSound(done, step(done, { confirm: true }))).toBeNull();
  });
});
