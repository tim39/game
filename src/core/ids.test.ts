import { expect, test } from 'vitest';
import { isId, isNamespacedId } from './ids';

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
