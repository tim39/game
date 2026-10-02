import { defineMap } from '../../core/map/types';

/** Under the test house: stairs back up. */
export default defineMap({
  id: 'test-cellar',
  name: 'Test Cellar',
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
  ],
});
