import { defineMap } from '../../core/map/types';

/**
 * Saltmere, the fishing village where the game begins (see STORY.md). A draft: the houses around
 * the square with its Kindling pyre, the lamps Rowan lights, the dock, and the lighthouse out on its
 * point. Tamsin's house and the fisher's cottage can be entered. The road north leads nowhere until
 * the overworld exists.
 */
export default defineMap({
  id: 'saltmere',
  name: 'Saltmere',
  terrain: `
    TTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTT
    TT..................................TTTTTTTT
    TT..................................TTTTTTTT
    TT..................................TTTTTTTT
    TT....................................TTTTTT
    TT....................................TTTTTT
    TT....................................TTTTTT
    TT..........................................
    TT........................................~~
    TT......................................~~~~
    TT.....................................~~~~~
    TT......................................~~~~
    TT........................................~~
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..............................~~~~........
    ...............................~~~~~~.......
    ..........................~~~~~~~~~~~.......
    ~~~~~~......~~~~~~~~~~~~~~~~~~~~~~~~~.......
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  `,
  legend: { T: 'sand-trees', '.': 'sand', '~': 'sea' },
  objects: [
    // Tamsin's house, where Rowan lives, and the fisher's cottage.
    { type: 'prefab', prefab: 'house', at: [6, 3], to: { map: 'saltmere-tamsin', spawn: 'door' } },
    { type: 'spawn', id: 'tamsin', at: [7, 6], facing: 'down' },
    {
      type: 'prefab',
      prefab: 'house-pale',
      at: [27, 3],
      to: { map: 'saltmere-cottage', spawn: 'door' },
    },
    { type: 'spawn', id: 'cottage', at: [28, 6], facing: 'down' },
    // The other houses, shut for now.
    { type: 'prefab', prefab: 'house-beige', at: [13, 3] },
    { type: 'prefab', prefab: 'house-red', at: [31, 9] },
    { type: 'prefab', prefab: 'house-beige', at: [5, 13] },
    { type: 'prefab', prefab: 'house', at: [26, 14] },

    // The square, with the Kindling pyre, and the lamps Rowan lights.
    { type: 'prefab', prefab: 'pyre', at: [20, 11] },
    { type: 'prefab', prefab: 'lamp', at: [17, 9] },
    { type: 'prefab', prefab: 'lamp', at: [24, 9] },
    { type: 'prefab', prefab: 'lamp', at: [17, 14] },
    { type: 'prefab', prefab: 'lamp', at: [24, 14] },
    { type: 'prefab', prefab: 'lamp', at: [10, 5] },
    { type: 'prefab', prefab: 'lamp', at: [14, 19] },
    { type: 'prefab', prefab: 'lamp', at: [36, 13] },

    // A market stall's worth of baskets, and barrels by the houses.
    { type: 'prefab', prefab: 'basket-fish', at: [11, 9] },
    { type: 'prefab', prefab: 'basket-greens', at: [12, 9] },
    { type: 'prefab', prefab: 'basket-fruit', at: [13, 9] },
    { type: 'prefab', prefab: 'barrel', at: [11, 4] },
    { type: 'prefab', prefab: 'barrel', at: [26, 5] },
    { type: 'prefab', prefab: 'barrel', at: [9, 15] },

    // The shore: the dock, with a boat tied up beside it, palms and a rock.
    { type: 'prefab', prefab: 'dock', at: [15, 22] },
    { type: 'prefab', prefab: 'boat', at: [19, 24] },
    { type: 'prefab', prefab: 'palm', at: [3, 19] },
    { type: 'prefab', prefab: 'palm-2', at: [10, 20] },
    { type: 'prefab', prefab: 'palm', at: [23, 19] },
    { type: 'prefab', prefab: 'rock', at: [29, 19] },

    // The lighthouse, out on its point.
    {
      type: 'prefab',
      prefab: 'lighthouse',
      at: [39, 16],
      to: { map: 'saltmere-lighthouse', spawn: 'door' },
    },
    { type: 'spawn', id: 'lighthouse', at: [40, 21], facing: 'down' },
    { type: 'prefab', prefab: 'sign', at: [37, 14], script: 'saltmere/lighthouse-sign' },

    // Villagers, busy with the Kindling.
    {
      type: 'npc',
      id: 'fisher',
      sprite: 'old-man-3',
      at: [16, 24],
      facing: 'down',
      script: 'saltmere/fisher',
    },
    {
      type: 'npc',
      id: 'vendor',
      sprite: 'villager-3',
      at: [12, 8],
      facing: 'down',
      script: 'saltmere/vendor',
    },
    {
      type: 'npc',
      id: 'kid',
      sprite: 'child',
      at: [19, 15],
      facing: 'up',
      wander: 3,
      script: 'saltmere/kid',
    },
    { type: 'npc', id: 'walker', sprite: 'villager-4', at: [31, 7], facing: 'left', wander: 2 },
    { type: 'npc', id: 'stroller', sprite: 'villager-5', at: [8, 18], facing: 'right', wander: 2 },
  ],
});
