import { defineMap } from '../../core/map/types';
import { INDOOR_MOODS } from './moods';

/**
 * Rhona's house in Saltmere, where she lives with her boy Pip: the oven, their beds and the table,
 * and a chest in the corner. Pip is home once the Beacon has gone out.
 */
export default defineMap({
  id: 'saltmere-rhona',
  name: "Rhona's House",
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
    { type: 'prefab', prefab: 'door', at: [4, 6], to: { map: 'saltmere', spawn: 'rhona' } },
    { type: 'spawn', id: 'door', at: [4, 5], facing: 'up' },
    { type: 'prefab', prefab: 'oven', at: [1, 0] },
    { type: 'prefab', prefab: 'shelf', at: [3, 0] },
    { type: 'prefab', prefab: 'bed-red', at: [6, 1] },
    { type: 'prefab', prefab: 'bed-blue', at: [8, 1], script: 'saltmere/pips-bed' },
    { type: 'prefab', prefab: 'chair', at: [2, 3] },
    { type: 'prefab', prefab: 'table', at: [3, 3] },
    { type: 'prefab', prefab: 'pot', at: [1, 5] },
    { type: 'chest', at: [8, 5], flag: 'chest.saltmere-rhona-01', gold: 20 },
    {
      type: 'npc',
      id: 'rhona',
      sprite: 'princess',
      at: [3, 2],
      facing: 'down',
      script: 'saltmere/rhona',
    },
    {
      type: 'npc',
      id: 'pip',
      sprite: 'child',
      at: [7, 4],
      facing: 'left',
      script: 'saltmere/pip',
      when: 'story.beacon-out',
    },
  ],
});
