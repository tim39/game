import type { ItemDef } from '../core/schema';

/**
 * Every item, by ID: things to use up, equipment and key items. So far, Act 1's. Prices are
 * starting points for the balance passes, and items sell for half.
 */
export const ITEMS: Readonly<Record<string, ItemDef>> = {
  // Used up, in battle or from the menu.
  potion: {
    name: 'Potion',
    description: 'Restores HP to one ally.',
    kind: 'consumable',
    price: 25,
    target: 'one-ally',
    effects: [{ type: 'restore', hp: 50 }],
  },
  ether: {
    name: 'Ether',
    description: 'Restores MP to one ally.',
    kind: 'consumable',
    price: 90,
    target: 'one-ally',
    effects: [{ type: 'restore', mp: 15 }],
  },
  'ember-feather': {
    name: 'Ember Feather',
    description: "Gets a KO'd ally back on their feet.",
    kind: 'consumable',
    price: 150,
    target: 'one-ally',
    effects: [{ type: 'revive', hp: 0.25 }],
  },
  antidote: {
    name: 'Antidote',
    description: 'Cures poison.',
    kind: 'consumable',
    price: 15,
    target: 'one-ally',
    effects: [{ type: 'cure', statuses: ['poison'] }],
  },
  'eye-drops': {
    name: 'Eye Drops',
    description: 'Cures blindness.',
    kind: 'consumable',
    price: 15,
    target: 'one-ally',
    effects: [{ type: 'cure', statuses: ['blind'] }],
  },
  'smoke-pellet': {
    name: 'Smoke Pellet',
    description: "Gets the party out of a battle, unless it's a boss.",
    kind: 'consumable',
    price: 60,
    target: 'self',
    effects: [{ type: 'escape' }],
  },
  // Bombs, so anyone can hit a weakness early on.
  'fire-bomb': {
    name: 'Fire Bomb',
    description: 'Bursts into flame against one enemy.',
    kind: 'consumable',
    price: 40,
    target: 'one-enemy',
    effects: [{ type: 'damage', amount: 40, element: 'fire' }],
  },
  'water-bomb': {
    name: 'Water Bomb',
    description: 'Bursts into a drenching wave against one enemy.',
    kind: 'consumable',
    price: 40,
    target: 'one-enemy',
    effects: [{ type: 'damage', amount: 40, element: 'water' }],
  },
  'wind-bomb': {
    name: 'Wind Bomb',
    description: 'Bursts into a howling gust against one enemy.',
    kind: 'consumable',
    price: 40,
    target: 'one-enemy',
    effects: [{ type: 'damage', amount: 40, element: 'wind' }],
  },
  'earth-bomb': {
    name: 'Earth Bomb',
    description: 'Bursts into a hail of stone against one enemy.',
    kind: 'consumable',
    price: 40,
    target: 'one-enemy',
    effects: [{ type: 'damage', amount: 40, element: 'earth' }],
  },

  // Weapons: Rowan's swords, Bram's axes, Liora's staves.
  'bronze-sword': {
    name: 'Bronze Sword',
    description: 'A plain, sturdy blade.',
    kind: 'weapon',
    weapon: 'sword',
    price: 60,
    stats: { atk: 4 },
  },
  'iron-sword': {
    name: 'Iron Sword',
    description: 'Heavier than bronze, and keener.',
    kind: 'weapon',
    weapon: 'sword',
    price: 240,
    stats: { atk: 9 },
  },
  'hand-axe': {
    name: 'Hand Axe',
    description: "A Warden's sidearm, worn smooth.",
    kind: 'weapon',
    weapon: 'axe',
    price: 70,
    stats: { atk: 5 },
  },
  'bearded-axe': {
    name: 'Bearded Axe',
    description: 'Its long blade hooks shields aside.',
    kind: 'weapon',
    weapon: 'axe',
    price: 280,
    stats: { atk: 10 },
  },
  'oak-staff': {
    name: 'Oak Staff',
    description: "A priestess's walking staff.",
    kind: 'weapon',
    weapon: 'staff',
    price: 50,
    stats: { atk: 2, mag: 3 },
  },
  'willow-staff': {
    name: 'Willow Staff',
    description: "Said to steady a healer's hands.",
    kind: 'weapon',
    weapon: 'staff',
    price: 220,
    stats: { atk: 3, mag: 7 },
  },

  // Armor: light for anyone, heavy for Bram, robes for Liora and Cass.
  'travel-clothes': {
    name: 'Travel Clothes',
    description: 'Good for long roads, and not much else.',
    kind: 'armor',
    armor: 'light',
    price: 30,
    stats: { def: 2 },
  },
  'leather-vest': {
    name: 'Leather Vest',
    description: 'Hardened leather over the chest.',
    kind: 'armor',
    armor: 'light',
    price: 150,
    stats: { def: 5 },
  },
  'chain-mail': {
    name: 'Chain Mail',
    description: 'Rings of iron, heavy on the shoulders.',
    kind: 'armor',
    armor: 'heavy',
    price: 160,
    stats: { def: 7, spd: -1 },
  },
  'scale-mail': {
    name: 'Scale Mail',
    description: "Overlapping plates, like a fish's.",
    kind: 'armor',
    armor: 'heavy',
    price: 360,
    stats: { def: 11, spd: -1 },
  },
  'linen-robe': {
    name: 'Linen Robe',
    description: 'Plain Warden vestments.',
    kind: 'armor',
    armor: 'robe',
    price: 40,
    stats: { def: 2, res: 3 },
  },
  'acolyte-robe': {
    name: 'Acolyte Robe',
    description: 'Woven with a blessing in every hem.',
    kind: 'armor',
    armor: 'robe',
    price: 200,
    stats: { def: 3, res: 7 },
  },

  // Accessories, for anyone.
  'swift-anklet': {
    name: 'Swift Anklet',
    description: 'Lightens the step. SPD Up.',
    kind: 'accessory',
    price: 300,
    stats: { spd: 2 },
  },
  'guard-ring': {
    name: 'Guard Ring',
    description: 'A band of warded iron. DEF and RES Up.',
    kind: 'accessory',
    price: 260,
    stats: { def: 3, res: 3 },
  },
};

/** An item's name, as the game shows it. Throws for an item that doesn't exist. */
export function itemName(id: string): string {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!item) throw new Error(`There's no item called ${id}`);
  return item.name;
}
