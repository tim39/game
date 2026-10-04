import { expect, test } from 'vitest';
import { isId, isNamespacedId, isScriptId, recordById } from './ids';

test('IDs are kebab-case', () => {
  for (const id of ['potion', 'tide-caves-b1', 'rowan', 'chest-01', '2']) {
    expect(isId(id)).toBe(true);
  }
  for (const id of ['', 'Potion', 'hi_potion', 'tide--caves', '-rowan', 'rowan-', 'a b', 'a.b']) {
    expect(isId(id)).toBe(false);
  }
});

test('flags and vars are namespaced kebab-case', () => {
  for (const name of ['story.beacon-out', 'chest.saltmere-01', 'quest.shards.mira']) {
    expect(isNamespacedId(name)).toBe(true);
  }
  for (const name of ['beacon-out', 'story.', '.beacon-out', 'story..beacon', 'Story.beacon']) {
    expect(isNamespacedId(name)).toBe(false);
  }
});

test('event scripts are known by their area and name', () => {
  for (const id of ['saltmere/tamsin', 'saltmere/lighthouse-sign', 'test/sign']) {
    expect(isScriptId(id)).toBe(true);
  }
  for (const id of [
    'tamsin',
    'saltmere/',
    '/tamsin',
    'a/b/c',
    'saltmere/Tamsin',
    'saltmere.tamsin',
  ]) {
    expect(isScriptId(id)).toBe(false);
  }
});

test('records by ID keep every entry, and refuse two with one ID', () => {
  expect(
    recordById('map', [
      ['a', 1],
      ['b', 2],
    ]),
  ).toEqual({ a: 1, b: 2 });
  expect(() =>
    recordById('map', [
      ['a', 1],
      ['b', 2],
      ['a', 3],
    ]),
  ).toThrow('Two maps have the ID a');
  // Even an ID that's a special name on objects is just an entry.
  expect(Object.keys(recordById('map', [['__proto__', 1]]))).toEqual(['__proto__']);
});
