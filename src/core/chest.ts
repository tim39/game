import type { EventScript } from './events';

/** What a chest holds: an item, or some gold. */
export type ChestContents = { readonly item: string } | { readonly gold: number };

/**
 * A treasure chest: what's inside, and the flag that's set once it has been opened, which keeps it
 * open. Every chest has a flag of its own, in the `chest.` namespace: `chest.saltmere-01`.
 */
export type Chest = { readonly flag: string } & ChestContents;

/**
 * What opening a chest says. The words are content, so they're passed in: `CHEST_TEXT` in
 * src/data/ui-text.ts.
 */
export interface ChestText {
  /** Who says it: a speaker with no name or portrait, for narration. */
  readonly speaker: string;
  /** What finding what's inside says, like "Found Potion!" */
  found(contents: ChestContents): string;
  /** What a chest says once it has been opened. */
  readonly empty: string;
}

/**
 * The event script that opening a chest runs. The first time, it sets the chest's flag, gives the
 * party what's inside and says what it was; after that, the chest is empty.
 */
export function chestScript(chest: Chest, text: ChestText): EventScript {
  return async (ev) => {
    if (ev.flag(chest.flag)) {
      await ev.say(text.speaker, text.empty);
      return;
    }
    // The words come first, so a chest that can't say what's inside (an item that doesn't exist)
    // stays shut.
    const found = text.found(chest);
    ev.setFlag(chest.flag);
    if ('gold' in chest) ev.giveGold(chest.gold);
    else ev.giveItem(chest.item);
    await ev.say(text.speaker, found);
  };
}
