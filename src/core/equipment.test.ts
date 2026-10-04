import { expect, test } from 'vitest';
import { canEquip, slotOf } from './equipment';
import type { CharacterDef, ItemDef } from './schema';

const STATS: CharacterDef['stats'] = {
  hp: [50, 500],
  mp: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  mag: [10, 100],
  res: [10, 100],
  spd: [10, 30],
};
const ROWAN: CharacterDef = {
  name: 'Rowan',
  stats: STATS,
  weapon: 'sword',
  armor: ['light'],
  equipment: {},
  skills: [],
};
const LIORA: CharacterDef = { ...ROWAN, name: 'Liora', weapon: 'staff', armor: ['light', 'robe'] };

const ITEMS: Readonly<Record<string, ItemDef>> = {
  sword: {
    name: 'Sword',
    description: 'A sword.',
    kind: 'weapon',
    weapon: 'sword',
    price: 1,
    stats: {},
  },
  staff: {
    name: 'Staff',
    description: 'A staff.',
    kind: 'weapon',
    weapon: 'staff',
    price: 1,
    stats: {},
  },
  vest: { name: 'Vest', description: 'Light.', kind: 'armor', armor: 'light', price: 1, stats: {} },
  robe: { name: 'Robe', description: 'A robe.', kind: 'armor', armor: 'robe', price: 1, stats: {} },
  ring: { name: 'Ring', description: 'For anyone.', kind: 'accessory', price: 1, stats: {} },
  potion: {
    name: 'Potion',
    description: 'Restores HP.',
    kind: 'consumable',
    price: 1,
    target: 'one-ally',
    effects: [{ type: 'restore', hp: 50 }],
  },
  key: { name: 'Key', description: 'A story item.', kind: 'key' },
};

const item = (id: string): ItemDef => {
  const found = ITEMS[id];
  if (!found) throw new Error(`No ${id} in the test items`);
  return found;
};

test('weapons, armor and accessories each go in their own slot, and nothing else is worn', () => {
  expect(['sword', 'vest', 'ring', 'potion', 'key'].map((id) => slotOf(item(id)))).toEqual([
    'weapon',
    'armor',
    'accessory',
    undefined,
    undefined,
  ]);
});

test('a character wields their kind of weapon and wears their kinds of armor', () => {
  const wears = (character: CharacterDef) =>
    Object.keys(ITEMS).filter((id) => canEquip(character, item(id)));
  expect(wears(ROWAN)).toEqual(['sword', 'vest', 'ring']);
  expect(wears(LIORA)).toEqual(['staff', 'vest', 'robe', 'ring']);
});
