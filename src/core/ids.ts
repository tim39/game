/** One kebab-case word or more: `potion`, `tide-caves-b1`. */
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ID = new RegExp(`^${KEBAB}$`);
const NAMESPACED_ID = new RegExp(`^${KEBAB}(?:\\.${KEBAB})+$`);

/** IDs are kebab-case strings: `potion`, `tide-caves-b1`, `rowan`. */
export const isId = (text: string): boolean => ID.test(text);

/**
 * Flags and vars are namespaced: two kebab-case IDs or more, joined by dots, like
 * `story.beacon-out` or `chest.saltmere-01`.
 */
export const isNamespacedId = (text: string): boolean => NAMESPACED_ID.test(text);
