import { defineMap } from '../../core/map/types';

/**
 * The Gull's Rest, Saltmere's inn: Gwen keeps it from behind her counter, where the party can take
 * a room for the night. Three beds for guests, and a table where the pilgrim Aled waits for the
 * Kindling.
 */
export default defineMap({
  id: 'saltmere-inn',
  name: "The Gull's Rest",
  area: 'saltmere',
  music: 'bgm.saltmere',
  terrain: `
    ##############
    #............#
    #............#
    #............#
    #............#
    #............#
    #............#
    #............#
    ##############
  `,
  legend: { '#': 'house-wall', '.': 'wood-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [6, 8], to: { map: 'saltmere', spawn: 'inn' } },
    { type: 'spawn', id: 'door', at: [6, 7], facing: 'up' },
    // Gwen's corner: her shelves, barrels, and the counter she talks across.
    { type: 'prefab', prefab: 'shelf', at: [1, 0] },
    { type: 'prefab', prefab: 'shelf', at: [3, 0] },
    { type: 'prefab', prefab: 'barrel', at: [4, 1] },
    { type: 'prefab', prefab: 'barrel', at: [4, 2] },
    { type: 'prefab', prefab: 'table', at: [1, 3], script: 'saltmere/gwen' },
    {
      type: 'npc',
      id: 'gwen',
      sprite: 'villager-4',
      at: [2, 2],
      facing: 'down',
      script: 'saltmere/gwen',
    },
    // The guests' beds.
    { type: 'prefab', prefab: 'bed', at: [8, 1], script: 'saltmere/inn-bed' },
    { type: 'prefab', prefab: 'plant', at: [9, 0] },
    { type: 'prefab', prefab: 'bed-red', at: [10, 1], script: 'saltmere/inn-bed' },
    { type: 'prefab', prefab: 'bed-blue', at: [12, 1], script: 'saltmere/inn-bed' },
    // The common room.
    { type: 'prefab', prefab: 'round-table', at: [5, 3] },
    { type: 'prefab', prefab: 'stool', at: [4, 4] },
    { type: 'prefab', prefab: 'bench', at: [9, 5] },
    { type: 'prefab', prefab: 'rug', at: [5, 6] },
    { type: 'prefab', prefab: 'pot', at: [12, 7] },
    { type: 'prefab', prefab: 'plant', at: [1, 6] },
    {
      type: 'npc',
      id: 'aled',
      sprite: 'monk',
      at: [7, 4],
      facing: 'left',
      script: 'saltmere/aled',
    },
  ],
});
