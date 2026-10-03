import { defineMap } from '../../core/map/types';

/**
 * East of the test shore, through its east edge: a second outdoor map to walk between, with a
 * music box, for trying out a script's music and sound.
 */
export default defineMap({
  id: 'test-meadow',
  name: 'Test Meadow',
  terrain: `
    TTTTTTTTTTTTTTTTTTTTTTTT
    TT....................TT
    TT...TT.........~~~...TT
    TT.............~~~~~..TT
    TT..............~~~...TT
    TT....................TT
    TT.......TTT..........TT
    ,,,,,,,,,,,,,,,,......TT
    TT............,.......TT
    TT............,..TT...TT
    TT............,.......TT
    TT............,,,,,...TT
    TT....................TT
    TTTTTTTTTTTTTTTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass', ',': 'path', '~': 'water' },
  // Two cells in from the edge, clear of the treetops overhanging the path.
  objects: [
    { type: 'spawn', id: 'west', at: [2, 7], facing: 'right' },
    { type: 'npc', id: 'walker', sprite: 'villager-2', at: [12, 4], facing: 'down', wander: 3 },
    { type: 'prefab', prefab: 'sign', at: [19, 10], script: 'test/music-box' },
  ],
  edges: { west: { map: 'test-shore', spawn: 'east' } },
});
