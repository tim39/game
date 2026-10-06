import type { ShopDef } from '../core/schema';

/**
 * Every shop, by ID: what it sells, in the order it lists them, each at its price in
 * src/data/items.ts. Any shop buys back anything but key items, for half (see Items and economy in
 * docs/DESIGN.md). A script opens one with `ev.shop(id)`.
 */
export const SHOPS: Readonly<Record<string, ShopDef>> = {
  // Corin's stall in Saltmere: supplies for the road north, and bombs for its wolves (fire) and
  // for whatever has wings (wind) or a shell (earth).
  'saltmere-market': {
    items: [
      'potion',
      'antidote',
      'eye-drops',
      'fire-bomb',
      'wind-bomb',
      'earth-bomb',
      'smoke-pellet',
    ],
  },
  // Hal's forge in Saltmere: plain blades and armor for the village's first adventurers. The
  // Leather Vest is the one step up; the next tier is Wardenhold's, or in the Tide Caves' chests.
  'saltmere-forge': {
    items: ['bronze-sword', 'hand-axe', 'travel-clothes', 'leather-vest', 'chain-mail'],
  },
  // A bit of everything, for the tests and the debug menu: more than a page of it.
  'test-shop': {
    items: [
      'potion',
      'ether',
      'ember-feather',
      'antidote',
      'fire-bomb',
      'iron-sword',
      'bearded-axe',
      'willow-staff',
      'leather-vest',
      'scale-mail',
      'acolyte-robe',
      'guard-ring',
      'swift-anklet',
    ],
  },
};
