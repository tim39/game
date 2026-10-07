import { defineMap } from '../../core/map/types';
import { OUTDOOR_MOODS } from './moods';

/**
 * The North Road, out of Saltmere through the meadows and woods, where wolves prowl: the first
 * random battles. A draft. Its north end leads nowhere until the overworld exists (M7).
 */
export default defineMap({
  id: 'north-road',
  name: 'The North Road',
  music: 'bgm.saltmere',
  moods: OUTDOOR_MOODS,
  terrain: `
    TTTTTTTTTTTTT,,TTTTTTTTT
    TTTTTTTTTTTTT,,TTTTTTTTT
    TT...........,,......TTT
    TT....TT.....,,.......TT
    TT..........,,....~~..TT
    TT.........,,....~~~~.TT
    TT........,,......~~..TT
    TT........,,..........TT
    TT........,,.....TT...TT
    TT.........,,.........TT
    TT...TT.....,,........TT
    TT...........,,.......TT
    TT............,,......TT
    TT............,,...TT.TT
    TT...........,,.......TT
    TT..TT......,,........TT
    TT.........,,.........TT
    TT.........,,.........TT
    TTTTTTTTTTT,,TTTTTTTTTTT
    TTTTTTTTTTT,,TTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass', ',': 'path', '~': 'water' },
  objects: [{ type: 'spawn', id: 'south', at: [11, 17], facing: 'up' }],
  edges: { south: { map: 'saltmere', spawn: 'north-road' } },
  encounters: { table: 'north-road', backdrop: 'meadow' },
});
