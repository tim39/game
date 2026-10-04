import type { EventScript } from '../../core/events';
import { recordById } from '../../core/ids';
import * as saltmere from './saltmere';
import * as testMaps from './test-maps';

/** `lighthouseSign` → `lighthouse-sign`: script IDs are kebab-case, like every other ID. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const area = (prefix: string, scripts: Record<string, EventScript>): [string, EventScript][] =>
  Object.entries(scripts).map(([name, script]) => [`${prefix}/${kebab(name)}`, script]);

/**
 * Every event script, by ID: `saltmere/lighthouse-sign` is `lighthouseSign` in saltmere.ts. Two
 * with the same ID are an error, rather than one replacing the other.
 */
export const EVENTS: Readonly<Record<string, EventScript>> = recordById('event script', [
  ...area('saltmere', saltmere),
  ...area('test', testMaps),
]);
