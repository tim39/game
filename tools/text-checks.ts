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
 * checked where they're measured, and how wide these may be is for the menus to say (see
 * `checkBattleText`).
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

/** How wide the battle screen's text can be, in font pixels: BATTLE_LAYOUT.room. */
export interface BattleTextRoom {
  /** A party member's name, in the status panel. */
  readonly name: number;
  /** A skill's or item's name, in its list beside its cost or count. */
  readonly listLabel: number;
  /** What a skill or item does, in the help line. */
  readonly help: number;
}

/**
 * Checks that the battle screen has room for the text it shows: each character's name in the
 * status panel, and the name of each skill and of each item that can be used up, in its list, and
 * what it does, in the help line. Returns one line per problem. Text with characters the font lacks
 * is `checkText`'s to report.
 */
export function checkBattleText(
  sources: Pick<TextSources, 'characters' | 'skills'> & {
    readonly items: Readonly<Record<string, Named[string] & { readonly kind: string }>>;
  },
  font: MeasuredFont,
  room: BattleTextRoom,
): string[] {
  const consumables = Object.fromEntries(
    Object.entries(sources.items).filter(([, item]) => item.kind === 'consumable'),
  );
  const fits = (owner: string, field: string, text: string, most: number, where: string) => {
    const width = font.width(text);
    if (width <= most) return [];
    return [`${owner}: its ${field}, "${text}", is ${width} pixels wide; ${where} ${most}`];
  };
  const characters = Object.entries(sources.characters).flatMap(([id, { name }]) =>
    fits(`Character ${id}`, 'name', name, room.name, 'the battle status panel has room for'),
  );
  const lists = { skills: sources.skills, items: consumables };
  const listed = (['skills', 'items'] as const).flatMap((kind) =>
    Object.entries(lists[kind]).flatMap(([id, { name, description = '' }]) => [
      ...fits(`${OWNERS[kind]} ${id}`, 'name', name, room.listLabel, 'battle lists have room for'),
      ...fits(
        `${OWNERS[kind]} ${id}`,
        'description',
        description,
        room.help,
        'the battle help line has room for',
      ),
    ]),
  );
  return [...characters, ...listed];
}
