import { SaveError } from '../core/save';
import { MAPS } from '../data/maps';
import { SAVE_MENU_TEXT } from '../data/ui-text';
import type { SaveSlot, SaveSlots, SlotContents } from '../systems/saves';
import { formatPlayTime } from '../ui/save-slot-text';
import type { DebugSaves } from './debug-pages';
import { downloadText, pickTextFile } from './save-files';

/**
 * The debug menu's exporting and importing, for moving a save from one device to another, or
 * attaching one to a bug report: a slot's save downloads as `fifth-flame-slot-1.json`, and a file
 * like that imports into any slot.
 */
export function debugSaves(slots: SaveSlots): DebugSaves {
  return {
    slots: () =>
      slots.readAll().map(({ slot, contents }) => ({
        slot,
        label: SAVE_MENU_TEXT.slot(slot),
        detail: detailOf(contents),
        empty: contents.kind === 'empty',
      })),
    exportSlot: (slot) => {
      const text = slots.exportText(slot);
      const label = SAVE_MENU_TEXT.slot(slot);
      if (text === null) return `${label} is empty`;
      downloadText(saveFileName(slot), text);
      return `Exported ${label}.`;
    },
    importInto: (slot, report) => {
      const label = SAVE_MENU_TEXT.slot(slot);
      const failed = (error: unknown): void => {
        console.warn(`Couldn't import a save into ${label}:`, error);
        report(`Can't import that: ${whyNot(error)}.`);
      };
      void pickTextFile().then((text) => {
        if (text === null) return;
        try {
          slots.importText(slot, text);
          report(`Imported into ${label}.`);
        } catch (error) {
          failed(error);
        }
      }, failed);
    },
  };
}

/** What an exported save is called: `fifth-flame-autosave.json`, `fifth-flame-slot-1.json`. */
export const saveFileName = (slot: SaveSlot): string =>
  `fifth-flame-${slot === 'autosave' ? 'autosave' : `slot-${slot}`}.json`;

/** What's in a slot, in a few words: where and how long it's been played, or what's wrong. */
function detailOf(contents: SlotContents): string {
  switch (contents.kind) {
    case 'empty':
      return 'empty';
    case 'unreadable':
      return contents.problem === 'newer' ? 'newer version' : 'damaged';
    case 'saved': {
      const { location, playTimeMs } = contents.save.state;
      return `${MAPS[location.map]?.name ?? location.map}, ${formatPlayTime(playTimeMs)}`;
    }
  }
}

/** Why a file couldn't be imported, in a few words, for the menu; the console has the rest. */
function whyNot(error: unknown): string {
  if (!(error instanceof SaveError)) return "the browser wouldn't keep it";
  return error.problem === 'newer' ? 'a newer version made it' : "it's damaged, or not a save";
}
