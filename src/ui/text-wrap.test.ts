import { describe, expect, it } from 'vitest';
import { wrapText } from './text-wrap';

describe('wrapText', () => {
  it('fills each line with as many words as fit', () => {
    expect(
      wrapText("Kindling's tonight, Rowan, and the lamps won't light themselves.", 29),
    ).toEqual(["Kindling's tonight, Rowan,", "and the lamps won't light", 'themselves.']);
  });

  it('allows a line of exactly the maximum width', () => {
    expect(wrapText('abc def', 7)).toEqual(['abc def']);
    expect(wrapText('abc defg', 7)).toEqual(['abc', 'defg']);
  });

  it('measures with the given function, for proportional fonts', () => {
    // A font where "i" is 2 pixels wide and every other character, space included, is 6.
    const widthOf = (text: string) => [...text].reduce((w, c) => w + (c === 'i' ? 2 : 6), 0);
    expect(wrapText('iiii iiii', 22, widthOf)).toEqual(['iiii iiii']); // 8 + 6 + 8
    expect(wrapText('iiii iiii', 21, widthOf)).toEqual(['iiii', 'iiii']);
    expect(wrapText('mm mm', 22, widthOf)).toEqual(['mm', 'mm']); // 30 wide in only 5 characters
  });

  it('keeps newlines and blank lines', () => {
    expect(wrapText('one\n\ntwo', 10)).toEqual(['one', '', 'two']);
  });

  it('collapses runs of spaces', () => {
    expect(wrapText('  spaced   out  ', 20)).toEqual(['spaced out']);
  });

  it('splits words too wide for one line', () => {
    expect(wrapText('a supercalifragilistic word', 8)).toEqual([
      'a',
      'supercal',
      'ifragili',
      'stic',
      'word',
    ]);
  });

  it('returns one empty line for empty text, and rejects impossible widths', () => {
    expect(wrapText('', 10)).toEqual(['']);
    expect(() => wrapText('x', 0)).toThrow(RangeError);
    expect(() => wrapText('x', Number.NaN)).toThrow(RangeError);
  });
});
