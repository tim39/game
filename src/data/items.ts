import type { ItemDef } from '../core/schema';

/** Every item, by ID. */
export const ITEMS: Readonly<Record<string, ItemDef>> = {
  potion: { name: 'Potion' },
};

/** An item's name, as the game shows it. Throws for an item that doesn't exist. */
export function itemName(id: string): string {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!item) throw new Error(`There's no item called ${id}`);
  return item.name;
}
