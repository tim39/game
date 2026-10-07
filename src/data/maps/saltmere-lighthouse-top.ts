import { defineMap } from '../../core/map/types';

/** The lamp room at the top of the lighthouse, where the Tide Beacon burns. A draft. */
export default defineMap({
  id: 'saltmere-lighthouse-top',
  name: 'The Lamp Room',
  area: 'saltmere',
  music: 'bgm.saltmere',
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
    // The Tide Beacon, burning until the night it goes out.
    {
      type: 'prefab',
      prefab: 'beacon',
      at: [3, 2],
      script: 'saltmere/beacon',
      when: '!story.beacon-out',
    },
    {
      type: 'prefab',
      prefab: 'beacon-dead',
      at: [3, 2],
      script: 'saltmere/beacon',
      when: 'story.beacon-out',
    },
  ],
});
