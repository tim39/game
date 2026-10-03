/** An item: so far, just what it's called. M3 adds what it does, its price and who can equip it. */
export interface ItemDef {
  readonly name: string;
}

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
