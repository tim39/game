import { defineMap } from '../../core/map/types';

/** A small map for checking the map compiler: shorelines, path edges, and trees to walk behind. */
export default defineMap({
  id: 'test-shore',
  name: 'Test Shore',
  terrain: `
    TTTTTTTTTTTTTTTTTTTT
    TT................TT
    TT..TTT....~~~~...TT
    TT........~~~~~~..TT
    TT.,,,,,,..~~~~~..TT
    TT.,....,...~~~...TT
    TT.,....,....~....TT
    TT.,..TT,,,,,~~...TT
    TT.,........~~~~..TT
    TT.,,,......~~~~..TT
    TTTTTTTTTTTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass', ',': 'path', '~': 'water' },
});
