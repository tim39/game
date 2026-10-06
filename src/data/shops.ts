import type { ShopDef } from '../core/schema';

/**
 * Every shop, by ID: what it sells, in the order it lists them, each at its price in
 * src/data/items.ts. Any shop buys back anything but key items, for half (see Items and economy in
 * docs/DESIGN.md). A script opens one with `ev.shop(id)`.
 */
export const SHOPS: Readonly<Record<string, ShopDef>> = {
  // The market stall on Kindling day: supplies for the road north, and Fire Bombs for its wolves.
  'saltmere-market': {
    items: ['potion', 'antidote', 'eye-drops', 'fire-bomb', 'smoke-pellet'],
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
