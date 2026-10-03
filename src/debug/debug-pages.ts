import type { MapDef, SpawnObject } from '../core/map/types';
import type { DebugSwitches } from '../systems/debug-switches';
import type { DebugItem, DebugPage } from './debug-menu';

/** What the debug menu's pages work with. */
export interface DebugMenuContext {
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly switches: DebugSwitches;
  /** Puts the player on `map` at one of its spawns. */
  warp(map: string, spawn: string): void;
}

/** The debug menu's first page: warping, and the switches. */
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
    ],
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
