import type { MapDef, SpawnObject } from '../core/map/types';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import type { DebugItem, DebugPage } from './debug-menu';

/** What the debug menu's pages work with. */
export interface DebugMenuContext {
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly switches: DebugSwitches;
  /** Puts the player on `map` at one of its spawns. */
  warp(map: string, spawn: string): void;
  readonly saves: DebugSaves;
  /** Says something at the bottom of the menu: how an export or an import went. */
  notify(notice: string): void;
}

/** What the debug menu does with the save slots: exporting saves to files, and importing them. */
export interface DebugSaves {
  /** The slots, autosave first, each with what's in it. */
  slots(): readonly DebugSlot[];
  /** Downloads a slot's save as a file, and says how that went. */
  exportSlot(slot: SaveSlot): string;
  /** Asks for a save file, puts it in a slot, and then says how that went. */
  importInto(slot: SaveSlot, report: (notice: string) => void): void;
}

export interface DebugSlot {
  readonly slot: SaveSlot;
  readonly label: string;
  /** What's in it, briefly: where and how long it's been played, `empty` or `damaged`. */
  readonly detail: string;
  readonly empty: boolean;
}

/** The debug menu's first page: warping, the switches, and exporting and importing saves. */
export function debugRootPage(context: DebugMenuContext): DebugPage {
  const { switches } = context;
  const toggle = (label: string, name: keyof DebugSwitches): DebugItem => ({
    label,
    on: switches[name],
    choose: () => {
      switches[name] = !switches[name];
    },
  });
  return {
    title: 'Debug',
    items: () => [
      { label: 'Warp to a map', choose: () => warpPage(context) },
      toggle('Noclip', 'noclip'),
      toggle('Show collision', 'showCollision'),
      { label: 'Export a save', choose: () => exportPage(context) },
      { label: 'Import a save', choose: () => importPage(context) },
    ],
  };
}

/** Every slot that holds something can be exported to a file, even one that can't be loaded. */
function exportPage(context: DebugMenuContext): DebugPage {
  const { saves } = context;
  return {
    title: 'Export',
    items: () =>
      saves.slots().map(({ slot, label, detail, empty }) => ({
        label,
        detail,
        choose: empty ? undefined : () => context.notify(saves.exportSlot(slot)),
      })),
  };
}

/** A save file can be imported into any slot, replacing what's there. */
function importPage(context: DebugMenuContext): DebugPage {
  const { saves } = context;
  return {
    title: 'Import into',
    items: () =>
      saves.slots().map(({ slot, label, detail }) => ({
        label,
        detail,
        choose: () => saves.importInto(slot, (notice) => context.notify(notice)),
      })),
  };
}

/** Every map, by name. A map with no spawns can't be warped to, so it's shown but can't be chosen. */
function warpPage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Warp to',
    items: () =>
      Object.values(context.maps).map((map) => {
        const spawns = spawnsOf(map);
        return {
          label: map.name,
          detail: spawns.length > 0 ? map.id : `${map.id}: no spawns`,
          choose: spawns.length > 0 ? () => spawnPage(context, map, spawns) : undefined,
        };
      }),
  };
}

/** A map's spawns, where arrivals appear. Choosing one warps there. */
function spawnPage(context: DebugMenuContext, map: MapDef, spawns: SpawnObject[]): DebugPage {
  return {
    title: map.name,
    items: () =>
      spawns.map((spawn) => ({
        label: spawn.id,
        detail: `${spawn.at[0]}, ${spawn.at[1]}`,
        choose: () => context.warp(map.id, spawn.id),
      })),
  };
}

const spawnsOf = (map: MapDef): SpawnObject[] =>
  (map.objects ?? []).filter((object): object is SpawnObject => object.type === 'spawn');
