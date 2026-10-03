import { defineMap } from '../../core/map/types';

/**
 * Inside the lighthouse: stairs up to the lamp room, and stairs down to the sea caves (the Tide
 * Caves, M6), shut until then. A draft.
 */
export default defineMap({
  id: 'saltmere-lighthouse',
  name: 'The Lighthouse',
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
    { type: 'prefab', prefab: 'stairs-down', at: [2, 1], script: 'saltmere/cave-stairs' },
    { type: 'prefab', prefab: 'barrel', at: [1, 4] },
    { type: 'prefab', prefab: 'barrel', at: [7, 4] },
  ],
});
