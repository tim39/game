import { defineMap } from '../../core/map/types';

/**
 * A walled square for trying out event scripts and what sets them off: a hello when you first
 * arrive, a loose stone to step on, a guide whose script walks, turns and teleports, and a cheer
 * that runs by itself once the guide is done. Reached through the debug menu.
 */
export default defineMap({
  id: 'test-square',
  name: 'Test Square',
  terrain: `
    TTTTTTTTTTTT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TT........TT
    TTTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass' },
  objects: [
    { type: 'spawn', id: 'start', at: [3, 6], facing: 'up' },
    { type: 'spawn', id: 'corner', at: [8, 2], facing: 'down' },
    {
      type: 'npc',
      id: 'guide',
      sprite: 'villager',
      at: [5, 3],
      facing: 'down',
      script: 'test/guide',
    },
    { type: 'touch', at: [6, 6], script: 'test/stone' },
    { type: 'enter', script: 'test/square', when: '!test.square-seen' },
    { type: 'auto', script: 'test/cheer', when: ['test.guide-done', '!test.cheered'] },
  ],
});
