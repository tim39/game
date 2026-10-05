import type { EncounterTable } from '../core/schema';

/**
 * Every encounter table, by ID: the groups of enemies each area's random battles are against, and
 * how likely each is. M4 puts them on maps. So far, a first draft of the Tide Caves'.
 */
export const ENCOUNTERS: Readonly<Record<string, EncounterTable>> = {
  'tide-caves': {
    groups: [
      { enemies: ['cave-bat', 'cave-bat', 'cave-bat'], weight: 3 },
      { enemies: ['reef-snail'], weight: 2 },
      { enemies: ['reef-snail', 'cave-bat'], weight: 2 },
      { enemies: ['grotto-octopus', 'cave-bat'], weight: 2 },
      { enemies: ['grotto-octopus', 'grotto-octopus'] },
      { enemies: ['drowned-wisp', 'drowned-wisp'] },
      { enemies: ['reef-snail', 'drowned-wisp'] },
      { enemies: ['cave-bat', 'cave-bat', 'drowned-wisp'] },
    ],
  },
};
