import { defineMap } from '../../core/map/types';

/** Under the test house: stairs back up, and two chests, one with a Potion and one with gold. */
export default defineMap({
  id: 'test-cellar',
  name: 'Test Cellar',
  area: 'test-shore',
  terrain: `
    ########
    #......#
    #......#
    #......#
    #......#
    ########
  `,
  legend: { '#': 'cellar-wall', '.': 'stone-floor' },
  objects: [
    { type: 'prefab', prefab: 'stairs-up', at: [2, 1], to: { map: 'test-house', spawn: 'stairs' } },
    { type: 'spawn', id: 'stairs', at: [2, 2], facing: 'down' },
    { type: 'chest', at: [4, 1], flag: 'chest.test-cellar-01', item: 'potion' },
    { type: 'chest', at: [6, 1], flag: 'chest.test-cellar-02', gold: 25 },
  ],
});
