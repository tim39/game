import { defineMap } from '../../core/map/types';

/**
 * A walled square with a shopkeeper selling a bit of everything, an innkeeper, and a Light Shrine,
 * for trying out shops and resting. Reached through the debug menu.
 */
export default defineMap({
  id: 'test-market',
  name: 'Test Market',
  terrain: `
    TTTTTTTTTTTT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TTTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass' },
  objects: [
    { type: 'spawn', id: 'start', at: [5, 4], facing: 'up' },
    {
      type: 'npc',
      id: 'shopkeeper',
      sprite: 'villager-3',
      at: [3, 2],
      facing: 'down',
      script: 'test/shopkeeper',
    },
    {
      type: 'npc',
      id: 'innkeeper',
      sprite: 'woman',
      at: [6, 2],
      facing: 'down',
      script: 'test/innkeeper',
    },
    { type: 'prefab', prefab: 'shrine', at: [8, 2], script: 'test/shrine' },
  ],
});
