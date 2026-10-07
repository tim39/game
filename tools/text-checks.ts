import { wrapText } from '../src/ui/text-wrap';
import type { MeasuredFont } from './font-metrics';

/**
 * A collection of things with text the game shows: a name, maybe a description, and for a boss,
 * maybe what the battle's banner says as each of its phases starts.
 */
type Named = Readonly<
  Record<
    string,
    {
      readonly name: string;
      readonly description?: string;
      readonly phases?: readonly { readonly banner?: string }[];
    }
  >
>;

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
    Object.entries(sources[kind]).flatMap(([id, { name, description, phases = [] }]) =>
      [
        ['name', name],
        ['description', description],
        ...phases.map(({ banner }, index) => [phaseBanner(index), banner]),
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

/** What a problem with the banner a boss's phase shows calls it: the first is phase 1. */
const phaseBanner = (index: number): string => `banner for phase ${index + 1}`;

/** How wide the battle screen's text can be, in font pixels: BATTLE_LAYOUT.room. */
export interface BattleTextRoom {
  /** A party member's name, in the status panel. */
  readonly name: number;
  /** A skill's or item's name, in its list beside its cost or count. */
  readonly listLabel: number;
  /** What a skill or item does, in the help line; and the banner, which the help line is. */
  readonly help: number;
}

/**
 * Checks that the battle screen has room for the text it shows: each character's name in the
 * status panel, the name of each skill and of each item that can be used up, in its list, and
 * what it does, in the help line, and what a boss's phases say in the banner. Returns one line per
 * problem. Text with characters the font lacks is `checkText`'s to report.
 */
export function checkBattleText(
  sources: Pick<TextSources, 'characters' | 'skills' | 'enemies'> & {
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
  const banners = Object.entries(sources.enemies).flatMap(([id, { phases = [] }]) =>
    phases.flatMap(({ banner }, index) =>
      banner === undefined
        ? []
        : fits(
            `Enemy ${id}`,
            phaseBanner(index),
            banner,
            room.help,
            'the battle banner has room for',
          ),
    ),
  );
  return [...characters, ...listed, ...banners];
}

/** How wide the main menu's text can be, in font pixels (MENU_LAYOUT.room), and its info lines. */
export interface MenuTextRoom {
  /** A party member's name, beside their portrait, before their level. */
  readonly name: number;
  /** An item's or skill's name, in its list, before its count or MP cost. */
  readonly listLabel: number;
  /** A line of the info panel, which a description wraps over. */
  readonly info: number;
  /** How many lines the info panel holds. */
  readonly infoLines: number;
}

/**
 * Checks that the main menu has room for the text it shows: each character's name in the party's
 * rows, each item's and skill's name in its list and what it does in the info panel, wrapped over
 * its lines, and each map's name there, as where the party is. Returns one line per problem.
 */
export function checkMenuText(
  sources: Pick<TextSources, 'characters' | 'skills' | 'items'> & {
    readonly maps: Readonly<Record<string, { readonly name: string }>>;
  },
  font: MeasuredFont,
  room: MenuTextRoom,
): string[] {
  const fits = (owner: string, field: string, text: string, most: number, where: string) => {
    const width = font.width(text);
    if (width <= most) return [];
    return [`${owner}: its ${field}, "${text}", is ${width} pixels wide; ${where} ${most}`];
  };
  const wraps = (owner: string, description: string) => {
    const lines = wrapText(description, room.info, (text) => font.width(text)).length;
    if (lines <= room.infoLines) return [];
    return [
      `${owner}: its description, "${description}", takes ${lines} lines of the main menu's ` +
        `info panel, which holds ${room.infoLines}`,
    ];
  };
  const characters = Object.entries(sources.characters).flatMap(([id, { name }]) =>
    fits(`Character ${id}`, 'name', name, room.name, "the main menu's party rows have room for"),
  );
  const listed = (['skills', 'items'] as const).flatMap((kind) =>
    Object.entries(sources[kind]).flatMap(([id, { name, description }]) => [
      ...fits(
        `${OWNERS[kind]} ${id}`,
        'name',
        name,
        room.listLabel,
        'main menu lists have room for',
      ),
      ...(description === undefined ? [] : wraps(`${OWNERS[kind]} ${id}`, description)),
    ]),
  );
  const maps = Object.entries(sources.maps).flatMap(([id, { name }]) =>
    fits(`Map ${id}`, 'name', name, room.info, "the main menu's info panel has room for"),
  );
  return [...characters, ...listed, ...maps];
}
