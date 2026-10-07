import { defineMap } from '../../core/map/types';
import { INDOOR_MOODS } from './moods';

/**
 * The fisher's cottage in Saltmere, where Hob lives with his daughter Nell: their beds, a table,
 * and the day's catch. Hob's out on the dock by day, and home once the Beacon has gone out.
 */
export default defineMap({
  id: 'saltmere-cottage',
  name: "Fisher's Cottage",
  area: 'saltmere',
  music: 'bgm.saltmere',
  moods: INDOOR_MOODS,
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
    { type: 'prefab', prefab: 'door', at: [4, 6], to: { map: 'saltmere', spawn: 'cottage' } },
    { type: 'spawn', id: 'door', at: [4, 5], facing: 'up' },
    { type: 'prefab', prefab: 'dresser', at: [1, 0] },
    { type: 'prefab', prefab: 'bed', at: [6, 1] },
    { type: 'prefab', prefab: 'bed', at: [7, 1] },
    { type: 'prefab', prefab: 'oven', at: [3, 0] },
    { type: 'prefab', prefab: 'table', at: [2, 3] },
    { type: 'prefab', prefab: 'basket-fish', at: [1, 5] },
    { type: 'prefab', prefab: 'barrel', at: [8, 5] },
    { type: 'prefab', prefab: 'rug', at: [5, 3] },
    {
      type: 'npc',
      id: 'nell',
      sprite: 'woman',
      at: [6, 4],
      facing: 'left',
      wander: 1,
      script: 'saltmere/nell',
    },
    // Out on the dock by day; at home once the Beacon is out.
    {
      type: 'npc',
      id: 'hob',
      sprite: 'old-man-3',
      at: [2, 4],
      facing: 'up',
      script: 'saltmere/hob',
      when: 'story.beacon-out',
    },
  ],
});
