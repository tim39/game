import { defineMap } from '../../core/map/types';

/**
 * Inside the lighthouse: stairs up to the lamp room, and stairs down to the sea caves under it, the
 * Tide Caves, roped off until the Beacon goes out.
 */
export default defineMap({
  id: 'saltmere-lighthouse',
  name: 'The Lighthouse',
  area: 'saltmere',
  music: 'bgm.saltmere',
  terrain: `
    #########
    #.......#
    #.......#
    #.......#
    #.......#
    #########
  `,
  legend: { '#': 'cellar-wall', '.': 'stone-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [4, 5], to: { map: 'saltmere', spawn: 'lighthouse' } },
    { type: 'spawn', id: 'door', at: [4, 4], facing: 'up' },
    {
      type: 'prefab',
      prefab: 'stairs-up',
      at: [6, 1],
      to: { map: 'saltmere-lighthouse-top', spawn: 'stairs' },
    },
    { type: 'spawn', id: 'stairs', at: [6, 2], facing: 'down' },
    // The stairs down to the Tide Caves, roped off until the night the Beacon goes out.
    {
      type: 'prefab',
      prefab: 'stairs-down',
      at: [2, 1],
      script: 'saltmere/cave-stairs',
      when: '!story.beacon-out',
    },
    {
      type: 'prefab',
      prefab: 'stairs-down',
      at: [2, 1],
      to: { map: 'tide-caves-b1', spawn: 'stairs' },
      when: 'story.beacon-out',
    },
    { type: 'spawn', id: 'caves', at: [2, 2], facing: 'down' },
    { type: 'prefab', prefab: 'barrel', at: [1, 4] },
    { type: 'prefab', prefab: 'barrel', at: [7, 4] },
  ],
});
