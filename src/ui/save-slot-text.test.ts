import { expect, test } from 'vitest';
import { SAVE_MENU_TEXT } from '../data/ui-text';
import { formatPlayTime, formatSavedAt } from './save-slot-text';

test('play time shows hours, minutes and seconds', () => {
  expect(formatPlayTime(0)).toBe('0:00:00');
  expect(formatPlayTime(999)).toBe('0:00:00');
  expect(formatPlayTime(754_321)).toBe('0:12:34');
  expect(formatPlayTime(3_600_000)).toBe('1:00:00');
  expect(formatPlayTime(((123 * 60 + 4) * 60 + 5) * 1000 + 999)).toBe('123:04:05');
});

test('the time a game was saved shows the day, the month and the time, where the player is', () => {
  const { months } = SAVE_MENU_TEXT;
  // Dates made from local time, as the player's own clock shows it.
  expect(formatSavedAt(new Date(2026, 9, 3, 14, 22, 59).toISOString(), months)).toBe('3 Oct 14:22');
  expect(formatSavedAt(new Date(2027, 0, 31, 8, 5).toISOString(), months)).toBe('31 Jan 08:05');
  expect(formatSavedAt(new Date(2026, 11, 25, 0, 0).toISOString(), months)).toBe('25 Dec 00:00');
});
