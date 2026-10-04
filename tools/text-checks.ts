import type { MeasuredFont } from './font-metrics';

/** A collection of things with text the game shows: a name, and maybe a description. */
type Named = Readonly<Record<string, { readonly name: string; readonly description?: string }>>;

export interface TextSources {
  readonly characters: Named;
  readonly skills: Named;
  readonly items: Named;
  readonly enemies: Named;
  /** Signs and narration have no name, which is fine. */
  readonly speakers: Named;
}

const OWNERS: Readonly<Record<keyof TextSources, string>> = {
  characters: 'Character',
  skills: 'Skill',
  items: 'Item',
  enemies: 'Enemy',
  speakers: 'Speaker',
};

/**
 * Checks that the names and descriptions menus, battles and the dialogue box show use characters
 * the body font has: no curly quotes, say. Returns one line per problem. Dialogue and map names are
 * checked where they're measured, and how wide these may be is for the menus to say, once there are
 * some.
 */
export function checkText(sources: TextSources, font: MeasuredFont): string[] {
  return (Object.keys(OWNERS) as (keyof TextSources)[]).flatMap((kind) =>
    Object.entries(sources[kind]).flatMap(([id, { name, description }]) =>
      [
        ['name', name],
        ['description', description],
      ].flatMap(([field, text]) => {
        if (text === undefined) return [];
        const missing = [...new Set([...text].filter((char) => !font.has(char)))];
        if (missing.length === 0) return [];
        const chars = missing.map((char) => `"${char}"`).join(', ');
        return [
          `${OWNERS[kind]} ${id}: its ${field}, "${text}", uses ${chars}, which the font lacks`,
        ];
      }),
    ),
  );
}
