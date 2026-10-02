import type { MapDef } from '../../core/map/types';
import testCellar from './test-cellar';
import testHouse from './test-house';
import testMeadow from './test-meadow';
import testShore from './test-shore';

/** Every map, by ID. */
export const MAPS: Readonly<Record<string, MapDef>> = Object.fromEntries(
  [testShore, testHouse, testCellar, testMeadow].map((map) => [map.id, map]),
);
