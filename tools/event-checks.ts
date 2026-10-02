import type { EventContext, EventScript } from '../src/core/events';
import type { MapDef } from '../src/core/map/types';
import type { Speaker } from '../src/data/speakers';
import type { AssetEntry } from '../src/systems/asset-manifest';

export interface EventSources {
  readonly events: Readonly<Record<string, EventScript>>;
  readonly speakers: Readonly<Record<string, Speaker>>;
  readonly maps: Readonly<Record<string, MapDef>>;
  /** Logical key → entry, as in src/systems/asset-manifest.ts. */
  readonly manifest: Readonly<Record<string, AssetEntry>>;
}

/**
 * Checks the event scripts, who speaks in them, and the maps that run them. Returns one line per
 * problem:
 * - every script a map's NPC or prefab runs exists;
 * - every speaker's portrait is an image in the asset manifest;
 * - every script, run against a stand-in context that answers at once, finishes without an error
 *   and only names speakers that exist.
 */
export async function checkEvents({
  events,
  speakers,
  maps,
  manifest,
}: EventSources): Promise<string[]> {
  const problems: string[] = [];

  for (const map of Object.values(maps)) {
    for (const object of map.objects ?? []) {
      if (object.type !== 'npc' && object.type !== 'prefab') continue;
      if (!object.script || events[object.script]) continue;
      const [x, y] = object.at;
      const what =
        object.type === 'npc' ? `npc ${object.id}` : `the ${object.prefab} at (${x}, ${y})`;
      problems.push(`Map ${map.id}: ${what} runs ${object.script}, which isn't an event script`);
    }
  }

  for (const [id, { portrait }] of Object.entries(speakers)) {
    if (portrait !== undefined && manifest[portrait]?.type !== 'image') {
      problems.push(`Speaker ${id}: the portrait ${portrait} isn't an image in the asset manifest`);
    }
  }

  for (const [id, script] of Object.entries(events)) {
    const ev: EventContext = {
      say: (speaker) => {
        if (!speakers[speaker]) problems.push(`Event ${id}: there's no speaker called ${speaker}`);
        return Promise.resolve();
      },
    };
    try {
      await script(ev);
    } catch (error) {
      problems.push(`Event ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return problems;
}
