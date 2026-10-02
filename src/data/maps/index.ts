import type { MapDef } from '../../core/map/types';
import testShore from './test-shore';

/** Every map, by ID. */
export const MAPS: Readonly<Record<string, MapDef>> = Object.fromEntries(
  [testShore].map((map) => [map.id, map]),
);
