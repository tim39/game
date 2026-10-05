import { ENCOUNTER_RATES, type EncounterRate } from '../core/encounters';
import type { MapDef, SpawnObject } from '../core/map/types';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import type { DebugItem, DebugPage } from './debug-menu';

/** What the debug menu's pages work with. */
export interface DebugMenuContext {
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly switches: DebugSwitches;
  /** The Encounter rate option, which the debug menu sets until the Options screen exists. */
  readonly settings: { encounterRate: EncounterRate };
  /** Puts the player on `map` at one of its spawns. */
  warp(map: string, spawn: string): void;
  /** The battles there are to start (see `debugBattles`). */
  readonly battles: readonly DebugBattle[];
  /** Starts a battle, with the party as it is, which goes back to the field once it's over. */
  battle(battle: DebugBattle): void;
  /** Who could join the party: everyone with a sprite to fight as, and whether they're in it. */
  recruits(): readonly { readonly id: string; readonly name: string; readonly joined: boolean }[];
  /** Has someone join the party, at level 1 in the gear they start with. */
  join(id: string): void;
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

/**
 * The debug menu's first page: warping, battles, joining the party, the switches, the encounter
 * rate, and exporting and importing saves.
 */
export function debugRootPage(context: DebugMenuContext): DebugPage {
  const { switches, settings } = context;
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
      { label: 'Start a battle', choose: () => battlePage(context) },
      { label: 'Join the party', choose: () => joinPage(context) },
      toggle('Noclip', 'noclip'),
      toggle('Show collision', 'showCollision'),
      {
        label: 'Encounter rate',
        detail: RATE_NAMES[settings.encounterRate],
        // Off, Low, Normal, High, and round again.
        choose: () => {
          const next =
            (ENCOUNTER_RATES.indexOf(settings.encounterRate) + 1) % ENCOUNTER_RATES.length;
          settings.encounterRate = ENCOUNTER_RATES[next] ?? 'normal';
        },
      },
      { label: 'Export a save', choose: () => exportPage(context) },
      { label: 'Import a save', choose: () => importPage(context) },
    ],
  };
}

const RATE_NAMES: Readonly<Record<EncounterRate, string>> = {
  off: 'Off',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

/** A battle the debug menu can start. */
export interface DebugBattle {
  /** Whom it's against, as the menu lists them: `Cave Bat x3`. */
  readonly label: string;
  /** Where they're met: an encounter table's ID, `boss`, or `pair`. */
  readonly detail: string;
  readonly enemies: readonly string[];
  /** What it's fought in front of. */
  readonly backdrop: string;
}

/** Where a debug battle's enemies come from, and what to fight them in front of. */
export interface DebugBattleSources {
  readonly enemies: Readonly<Record<string, { readonly name: string; readonly boss?: boolean }>>;
  readonly encounters: Readonly<
    Record<string, { readonly groups: readonly { readonly enemies: readonly string[] }[] }>
  >;
  /** Each area's boss, and the encounter table of the area it's met in (src/data/balance.ts). */
  readonly bosses: readonly { readonly enemies: readonly string[]; readonly table: string }[];
  /** The backdrop for an encounter table's battles, or for any other. */
  readonly backdrop: (table?: string) => string;
}

/**
 * The battles the debug menu offers: every group of every encounter table, each area's boss, and
 * each other enemy in a pair, as wolves come.
 */
export function debugBattles(sources: DebugBattleSources): DebugBattle[] {
  const { enemies, encounters, bosses, backdrop } = sources;
  const label = (group: readonly string[]): string => {
    const counts = new Map<string, number>();
    for (const id of group) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts]
      .map(([id, count]) => `${enemies[id]?.name ?? id}${count > 1 ? ` x${count}` : ''}`)
      .join(', ');
  };
  const battle = (group: readonly string[], detail: string, table?: string): DebugBattle => ({
    label: label(group),
    detail,
    enemies: group,
    backdrop: backdrop(table),
  });
  return [
    ...Object.entries(encounters).flatMap(([table, { groups }]) =>
      groups.map((group) => battle(group.enemies, table, table)),
    ),
    ...bosses.map(({ enemies: group, table }) => battle(group, 'boss', table)),
    ...Object.entries(enemies)
      .filter(([, enemy]) => !enemy.boss)
      .map(([id]) => battle([id, id], 'pair')),
  ];
}

/** Everyone who could join the party; those in it already can't be chosen. */
function joinPage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Join the party',
    items: () =>
      context.recruits().map(({ id, name, joined }) => ({
        label: name,
        detail: joined ? 'in the party' : id,
        choose: joined ? undefined : () => context.join(id),
      })),
  };
}

/** Every battle there is to start. */
function battlePage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Start a battle',
    items: () =>
      context.battles.map((battle) => ({
        label: battle.label,
        detail: battle.detail,
        choose: () => context.battle(battle),
      })),
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
