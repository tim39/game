import { defineMap } from '../../core/map/types';

/** The lamp room at the top of the lighthouse, where the Tide Beacon burns. A draft. */
export default defineMap({
  id: 'saltmere-lighthouse-top',
  name: 'The Lamp Room',
  terrain: `
    #######
    #.....#
    #.....#
    #.....#
    #######
  `,
  legend: { '#': 'cellar-wall', '.': 'stone-floor' },
  objects: [
    {
      type: 'prefab',
      prefab: 'stairs-down',
      at: [1, 1],
      to: { map: 'saltmere-lighthouse', spawn: 'stairs' },
    },
    { type: 'spawn', id: 'stairs', at: [1, 2], facing: 'right' },
    { type: 'prefab', prefab: 'beacon', at: [3, 2], script: 'saltmere/beacon' },
  ],
});
