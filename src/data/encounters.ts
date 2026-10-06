import type { EncounterTable } from '../core/schema';

/**
 * Every encounter table, by ID: the groups of enemies each area's random battles are against, and
 * how likely each is. Maps name theirs (see `encounters` in src/core/map/types.ts). So far, the
 * North Road's wolves, and a first draft of the Tide Caves'.
 */
export const ENCOUNTERS: Readonly<Record<string, EncounterTable>> = {
  // Wolves outside Saltmere. Rowan and Bram at level 1 always see off a pair, or even three; Rowan
  // alone, before Bram arrives, always beats one but only about a third of pairs, so they're rarer.
  'north-road': {
    groups: [{ enemies: ['wolf'], weight: 2 }, { enemies: ['wolf', 'wolf'] }],
  },
  'tide-caves': {
    groups: [
      { enemies: ['cave-bat', 'cave-bat', 'cave-bat'], weight: 3 },
      { enemies: ['reef-snail'], weight: 2 },
      { enemies: ['reef-snail', 'cave-bat'], weight: 2 },
      { enemies: ['grotto-octopus', 'cave-bat'], weight: 2 },
      { enemies: ['tide-jelly', 'tide-jelly'], weight: 2 },
      { enemies: ['sea-snake', 'cave-bat'], weight: 2 },
      { enemies: ['grotto-octopus', 'grotto-octopus'] },
      { enemies: ['drowned-wisp', 'drowned-wisp'] },
      { enemies: ['reef-snail', 'drowned-wisp'] },
      { enemies: ['cave-bat', 'cave-bat', 'drowned-wisp'] },
      { enemies: ['sea-snake', 'tide-jelly'] },
    ],
  },
};
