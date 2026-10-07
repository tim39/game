import { defineMap } from '../../core/map/types';
import { CAVE_SHADE } from './tide';

/**
 * The Beacon chamber, at the bottom of the Tide Caves, through the door past the last Light
 * Shrine: a causeway between two channels of the sea, up to the dead Beacon on its dais. The
 * Drowned Warden, the caves' boss, stands across the causeway until it's beaten. No music plays
 * here; the boss's starts with the fight.
 */
export default defineMap({
  id: 'tide-caves-beacon',
  name: 'Beacon Chamber',
  terrain: `
    #############
    #~~~.+++.~~~#
    #~~~.+++.~~~#
    #~~~.+++.~~~#
    #~~~.....~~~#
    #~~~.....~~~#
    #~~~.....~~~#
    #~~~.....~~~#
    #~~~.....~~~#
    #~~~.....~~~#
    #~~.......~~#
    #...........#
    #...........#
    #############
  `,
  legend: { '#': 'cave-wall', '.': 'sand', '~': 'sea', '+': 'dais' },
  objects: [
    {
      type: 'prefab',
      prefab: 'cave-door',
      at: [6, 13],
      to: { map: 'tide-caves-b3', spawn: 'door' },
    },
    { type: 'spawn', id: 'door', at: [6, 12], facing: 'up' },
    { type: 'prefab', prefab: 'beacon-dead', at: [6, 2], script: 'tide-caves/beacon' },
    // Across the causeway, until it's beaten.
    {
      type: 'prefab',
      prefab: 'drowned-warden',
      at: [4, 5],
      script: 'tide-caves/warden',
      when: '!story.warden-beaten',
    },
    { type: 'prefab', prefab: 'stone', at: [1, 12] },
    { type: 'prefab', prefab: 'stone', at: [11, 11] },
  ],
  shade: CAVE_SHADE,
});
