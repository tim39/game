import { describe, expect, it } from 'vitest';
import { GAME_WIDTH } from '../systems/display';
import {
  CHOICE_BOX,
  DIALOGUE_BOX,
  DIALOGUE_BOX_ON_SCREEN,
  MAX_CHOICES,
  MAX_LINES,
  choiceBoxOnScreen,
  lineWidth,
} from './dialogue-layout';

describe('dialogue box layout', () => {
  it('leaves the measured panel width minus the inset on both sides for text', () => {
    expect(lineWidth(true)).toBe(236);
    expect(lineWidth(false)).toBe(280);
  });

  it('fits the maximum number of lines inside the panel', () => {
    const textHeight = 8 + (MAX_LINES - 1) * 12;
    const area = DIALOGUE_BOX.textArea.withPortrait;
    expect(DIALOGUE_BOX.inset.y + textHeight).toBeLessThanOrEqual(area.height);
  });
});

describe('choice box layout', () => {
  it('sits centred just above the dialogue box, in whole box pixels', () => {
    const box = choiceBoxOnScreen(60, 2);
    expect(box.x + box.width / 2).toBe(GAME_WIDTH / 2);
    expect(box.y + box.height).toBe(DIALOGUE_BOX_ON_SCREEN.y - 4);
    for (const value of Object.values(box)) expect(value % 2).toBe(0);
  });

  it('grows to fit its choices: frame, inset, cursor and text', () => {
    // 2 lines: 8 pixels of text, 12 down to the next, 8 more; plus frame and inset top and bottom.
    expect(choiceBoxOnScreen(60, 2)).toMatchObject({ width: (60 + 24) * 2, height: (20 + 16) * 2 });
    expect(choiceBoxOnScreen(60, 3).height - choiceBoxOnScreen(60, 2).height).toBe(24);
  });

  it('fits the most and widest choices on screen', () => {
    const box = choiceBoxOnScreen(CHOICE_BOX.maxTextWidth, MAX_CHOICES);
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThan(0);
  });
});
