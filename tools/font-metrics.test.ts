import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { measureBodyFont } from './font-metrics';

const font = measureBodyFont(
  readFileSync(join(import.meta.dirname, '../public/assets/fonts/font-8x8.png')),
);

test('measures the body font as the game does: proportional, with a 1-pixel gap', () => {
  // "i" is 3 pixels wide and "W" 7, with a 1-pixel gap between letters; a space moves the pen 4.
  expect(font.width('i')).toBe(3);
  expect(font.width('W')).toBe(7);
  expect(font.width('iW')).toBe(11);
  expect(font.width('i W')).toBe(15);
  expect(font.width('')).toBe(0);
  expect(font.width('Rowan')).toBe(31);
});

test('knows which characters the font has', () => {
  expect(font.has('a')).toBe(true);
  expect(font.has('é')).toBe(true);
  // Curly quotes and dashes aren't in it: dialogue uses ' and -.
  expect(font.has('’')).toBe(false);
  expect(font.has('—')).toBe(false);
});
