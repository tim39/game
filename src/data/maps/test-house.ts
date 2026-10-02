import { defineMap } from '../../core/map/types';

/** Inside the test shore's house: a door back out, and stairs down to the cellar. */
export default defineMap({
  id: 'test-house',
  name: 'Test House',
  terrain: `
    ##########
    #........#
    #........#
    #........#
    #........#
    #........#
    ##########
  `,
  legend: { '#': 'house-wall', '.': 'wood-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [4, 6], to: { map: 'test-shore', spawn: 'house' } },
    { type: 'spawn', id: 'door', at: [4, 5], facing: 'up' },
    {
      type: 'prefab',
      prefab: 'stairs-down',
      at: [7, 2],
      to: { map: 'test-cellar', spawn: 'stairs' },
    },
    { type: 'spawn', id: 'stairs', at: [7, 3], facing: 'down' },
    {
      type: 'npc',
      id: 'host',
      sprite: 'old-man',
      at: [2, 2],
      facing: 'right',
      script: 'test/host',
    },
  ],
});
