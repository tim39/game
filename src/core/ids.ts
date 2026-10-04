/** One kebab-case word or more: `potion`, `tide-caves-b1`. */
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ID = new RegExp(`^${KEBAB}$`);
const NAMESPACED_ID = new RegExp(`^${KEBAB}(?:\\.${KEBAB})+$`);
const SCRIPT_ID = new RegExp(`^${KEBAB}/${KEBAB}$`);

/** IDs are kebab-case strings: `potion`, `tide-caves-b1`, `rowan`. */
export const isId = (text: string): boolean => ID.test(text);

/**
 * Flags and vars are namespaced: two kebab-case IDs or more, joined by dots, like
 * `story.beacon-out` or `chest.saltmere-01`.
 */
export const isNamespacedId = (text: string): boolean => NAMESPACED_ID.test(text);

/** Event scripts are known by their area and name, `saltmere/lighthouse-sign` (src/data/events). */
export const isScriptId = (text: string): boolean => SCRIPT_ID.test(text);

/**
 * A record of things by ID, from `[id, thing]` pairs. Throws if two share an ID, as the second
 * would otherwise quietly hide the first.
 */
export function recordById<T>(
  kind: string,
  entries: readonly (readonly [id: string, thing: T])[],
): Readonly<Record<string, T>> {
  const seen = new Set<string>();
  for (const [id] of entries) {
    if (seen.has(id)) throw new Error(`Two ${kind}s have the ID ${id}`);
    seen.add(id);
  }
  return Object.fromEntries(entries);
}
