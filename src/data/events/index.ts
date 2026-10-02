import type { EventScript } from '../../core/events';
import * as testMaps from './test-maps';

/** Every event script, by ID: `test/tamsin` is `tamsin` in test-maps.ts. */
export const EVENTS: Readonly<Record<string, EventScript>> = Object.fromEntries(
  Object.entries(testMaps).map(([name, script]) => [`test/${name}`, script]),
);
