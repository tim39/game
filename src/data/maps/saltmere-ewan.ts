import { defineMap } from '../../core/map/types';
import { INDOOR_MOODS } from './moods';

/**
 * Old Ewan's house in Saltmere: a sailor's, long ashore, with a sea chart for a rug, his books, his
 * bed and a chest. He knows the caves under the lighthouse.
 */
export default defineMap({
  id: 'saltmere-ewan',
  name: "Ewan's House",
  area: 'saltmere',
  music: 'bgm.saltmere',
  moods: INDOOR_MOODS,
  terrain: `
    #########
    #.......#
    #.......#
    #.......#
    #.......#
    #########
  `,
  legend: { '#': 'house-wall', '.': 'wood-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [4, 5], to: { map: 'saltmere', spawn: 'ewan' } },
    { type: 'spawn', id: 'door', at: [4, 4], facing: 'up' },
    { type: 'prefab', prefab: 'bed-blue', at: [1, 1] },
    { type: 'prefab', prefab: 'bookshelf', at: [3, 0], script: 'saltmere/ewans-books' },
    { type: 'prefab', prefab: 'dresser', at: [5, 0] },
    { type: 'prefab', prefab: 'sea-chart', at: [3, 2], script: 'saltmere/sea-chart' },
    { type: 'prefab', prefab: 'chair', at: [6, 3] },
    { type: 'chest', at: [7, 2], flag: 'chest.saltmere-ewan-01', item: 'ember-feather' },
    {
      type: 'npc',
      id: 'ewan',
      sprite: 'old-man-2',
      at: [5, 3],
      facing: 'down',
      script: 'saltmere/ewan',
    },
  ],
});
