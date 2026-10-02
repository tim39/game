import { describe, expect, it } from 'vitest';
import { DIALOGUE_BOX, MAX_LINES, lineWidth } from './dialogue-layout';

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
