import { expect, test } from 'vitest';
import { badConditionTerms, conditionFlags, conditionHolds } from './conditions';
import { createGameState, setFlag } from './state';

const start = createGameState({
  location: { map: 'test-shore', x: 1, y: 1, facing: 'down' },
  party: ['rowan'],
});
const lit = setFlag(start, 'story.lamps-lit');

test('a flag holds when it is set, and its opposite when it is not', () => {
  expect(conditionHolds('story.lamps-lit', start)).toBe(false);
  expect(conditionHolds('story.lamps-lit', lit)).toBe(true);
  expect(conditionHolds('!story.lamps-lit', start)).toBe(true);
  expect(conditionHolds('!story.lamps-lit', lit)).toBe(false);
});

test('a list holds when all of it does, and no condition always holds', () => {
  const both = setFlag(lit, 'story.festival');
  expect(conditionHolds(['story.lamps-lit', '!story.festival'], lit)).toBe(true);
  expect(conditionHolds(['story.lamps-lit', '!story.festival'], both)).toBe(false);
  expect(conditionHolds(undefined, start)).toBe(true);
  expect(conditionHolds([], start)).toBe(true);
});

test('finds terms that are not flag names, and the flags a condition reads', () => {
  expect(badConditionTerms(['story.lamps-lit', '!story.festival'])).toEqual([]);
  expect(badConditionTerms(['lamps-lit', '!!story.x', 'Story.x'])).toEqual([
    'lamps-lit',
    '!!story.x',
    'Story.x',
  ]);
  expect(conditionFlags(['story.lamps-lit', '!story.festival'])).toEqual([
    'story.lamps-lit',
    'story.festival',
  ]);
});
