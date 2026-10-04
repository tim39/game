import type { CharacterDef, ItemDef } from './schema';

/**
 * Equipment: which slot each piece goes in, and who can wear it (see Items and economy in
 * docs/DESIGN.md).
 */

/** Each member has a slot of each kind. */
export const SLOTS = ['weapon', 'armor', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

/** What a member has on: an item's ID in each slot that isn't empty. */
export type Equipment = Readonly<Partial<Record<Slot, string>>>;

/** Each character fights with one kind: Rowan swords, Bram axes, Liora staves, Cass daggers. */
export const WEAPON_TYPES = ['sword', 'axe', 'staff', 'dagger'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

/** Each character wears some of these: heavy armor is Bram's alone, and robes are for Liora and Cass. */
export const ARMOR_TYPES = ['light', 'heavy', 'robe'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

/** The slot an item goes in, or undefined for one that isn't equipment. */
export function slotOf(item: ItemDef): Slot | undefined {
  switch (item.kind) {
    case 'weapon':
    case 'armor':
    case 'accessory':
      return item.kind;
    case 'consumable':
    case 'key':
      return undefined;
  }
}

/**
 * Whether a character can equip an item: a weapon of their kind, armor of a kind they wear, or any
 * accessory.
 */
export function canEquip(character: CharacterDef, item: ItemDef): boolean {
  switch (item.kind) {
    case 'weapon':
      return item.weapon === character.weapon;
    case 'armor':
      return character.armor.includes(item.armor);
    case 'accessory':
      return true;
    case 'consumable':
    case 'key':
      return false;
  }
}
