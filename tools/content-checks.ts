import type { z } from 'zod';
import { canEquip, slotOf } from '../src/core/equipment';
import { compileMap, isBlocked, type CompiledMap } from '../src/core/map/compile';
import type { MapContent, MapDef } from '../src/core/map/types';
import {
  CONTENT_SCHEMAS,
  type CharacterDef,
  type EncounterTable,
  type EnemyActionDef,
  type EnemyDef,
  type ItemDef,
  type SkillDef,
} from '../src/core/schema';
import type { NewGame } from '../src/core/state';
import type { AreaBalance } from '../src/data/balance';

type Kind = keyof typeof CONTENT_SCHEMAS;

/** Every kind of content, as written in src/data. Anything goes in: that's what's being checked. */
export type ContentSources = { readonly [K in Kind]: unknown };

/** What each kind of content is called in a problem, before its ID: `Item potion`. */
const NAMES: { readonly [K in Kind]: string } = {
  characters: 'Character',
  skills: 'Skill',
  items: 'Item',
  enemies: 'Enemy',
  encounters: 'Encounter table',
  speakers: 'Speaker',
  terrains: 'Terrain',
  prefabs: 'Prefab',
  maps: 'Map',
  events: 'Event',
  newGame: 'The new game',
};

type Issue = z.core.$ZodIssue;
type Path = readonly PropertyKey[];

/**
 * Checks every kind of content against its schema in src/core/schema.ts. Returns one line per
 * problem, saying whose it is, where and what's wrong:
 * `Map saltmere: objects[3].wander should be a whole number, not 1.5`.
 */
export function checkContent(content: ContentSources): string[] {
  return (Object.keys(CONTENT_SCHEMAS) as Kind[]).flatMap((kind) => {
    const schema: z.ZodType = CONTENT_SCHEMAS[kind];
    const result = schema.safeParse(content[kind], { reportInput: true });
    if (result.success) return [];
    const name = NAMES[kind];
    return result.error.issues.flatMap((issue): string[] => {
      if (kind === 'newGame') return describe(name, issue.path, issue);
      // A collection is a record: the first step of the path is the ID of what has the problem.
      const [id, ...path] = issue.path;
      if (id === undefined) return describe(`${name}s`, [], issue);
      if (path.length === 0 && issue.code === 'invalid_key') {
        return issue.issues.map((inner) => `${name} ${show(id)} ${problem(inner, false)}`);
      }
      return describe(`${name} ${String(id)}`, path, issue);
    });
  });
}

/** The lines saying what's wrong at `path` in `owner`'s content. */
function describe(owner: string, path: Path, issue: Issue): string[] {
  if (issue.code === 'invalid_key') {
    // A key in a record, which the path ends with, is wrong.
    const key = `key ${show(path.at(-1))}`;
    return issue.issues.map((inner) =>
      line(owner, path.slice(0, -1), `${key} ${problem(inner, false)}`),
    );
  }
  if (issue.code === 'invalid_union' && issue.discriminator === undefined) {
    // One of several shapes: if only one fits what's there at all, say what's wrong with that one.
    const near = issue.errors.filter((inners) => !inners.every(isTypeMismatch));
    if (near.length === 1 && near[0]) {
      return near[0].flatMap((inner) => describe(owner, [...path, ...inner.path], inner));
    }
  }
  const says = problem(issue, true);
  // A field that a check of our own turned down is quoted, `id "Ada" isn't kebab-case`. Something
  // turned down whole needs no quoting: its owner says which it is.
  const { input } = issue;
  if (issue.code === 'custom' && path.length > 0 && isPlain(input)) {
    return [line(owner, path, `${show(input)} ${says}`)];
  }
  return [line(owner, path, says)];
}

const line = (owner: string, path: Path, says: string): string =>
  path.length === 0 ? `${owner} ${says}` : `${owner}: ${pathText(path)} ${says}`;

/** Something of the wrong type altogether: text where a list should be. */
const isTypeMismatch = (issue: Issue): boolean =>
  issue.code === 'invalid_type' && issue.path.length === 0;

/** What the types Zod expects are called. */
const TYPES: Readonly<Record<string, string>> = {
  string: 'text',
  number: 'a number',
  int: 'a whole number',
  boolean: 'true or false',
  array: 'a list',
  tuple: 'a list',
  object: 'an object',
  record: 'an object',
  function: 'a function',
};

/** How a bound on a number is said: [when the bound itself is allowed, when it isn't]. */
const BOUNDS = { too_small: ['at least', 'more than'], too_big: ['at most', 'less than'] } as const;

/**
 * What's wrong, as said of the thing that has the problem. With `withValue`, it ends by saying what
 * the thing is instead: `should be a number, not "3"`.
 */
function problem(issue: Issue, withValue: boolean): string {
  const not = withValue ? `, not ${show(issue.input)}` : '';
  const missing = withValue && issue.input === undefined;
  switch (issue.code) {
    case 'invalid_type':
      return missing ? 'is missing' : `should be ${TYPES[issue.expected] ?? issue.expected}${not}`;
    case 'too_small':
    case 'too_big': {
      const small = issue.code === 'too_small';
      const limit = Number(small ? issue.minimum : issue.maximum);
      if (issue.origin === 'string' || issue.origin === 'array') {
        // A bound on how long text or a list is.
        if (small && limit === 1 && !issue.exact) return 'is empty';
        const [one, many] =
          issue.origin === 'string' ? ['character', 'characters'] : ['entry', 'entries'];
        const bound = issue.exact ? 'exactly' : small ? 'at least' : 'at most';
        const { input } = issue;
        const sized = typeof input === 'string' || Array.isArray(input);
        const length = withValue && sized ? `, not ${input.length}` : '';
        return `should have ${bound} ${limit} ${limit === 1 ? one : many}${length}`;
      }
      return `should be ${BOUNDS[issue.code][issue.inclusive ? 0 : 1]} ${limit}${not}`;
    }
    case 'invalid_value':
      return missing ? 'is missing' : `should be ${oneOf(issue.values)}${not}`;
    case 'unrecognized_keys':
      return issue.keys.length === 1
        ? `has a field it shouldn't: ${issue.keys.join('')}`
        : `has fields it shouldn't: ${issue.keys.join(', ')}`;
    case 'invalid_union': {
      if (missing) return 'is missing';
      if (issue.discriminator !== undefined) {
        // The path ends at the field that says which shape it is, but the input is the whole thing.
        const value: unknown = isRecord(issue.input) ? issue.input[issue.discriminator] : undefined;
        const options = oneOf(('options' in issue ? issue.options : undefined) ?? []);
        return value === undefined
          ? `is missing; it should be ${options}`
          : `should be ${options}, not ${show(value)}`;
      }
      const types = issue.errors.flatMap((inners) =>
        inners.flatMap((inner) =>
          inner.code === 'invalid_type' ? [TYPES[inner.expected] ?? inner.expected] : [],
        ),
      );
      return `should be ${[...new Set(types)].join(' or ')}${not}`;
    }
    case 'custom':
    case 'invalid_key':
    case 'invalid_format':
    case 'not_multiple_of':
    case 'invalid_element':
      return issue.message;
  }
}

/** Text or a number: something short enough to quote. */
const isPlain = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = (values: readonly unknown[]): string =>
  values.length === 1 ? show(values[0]) : `one of ${values.map(show).join(', ')}`;

/** A value as a problem quotes it: text in quotes, numbers as they are, anything bigger by kind. */
function show(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'undefined':
      return 'nothing';
    case 'function':
      return 'a function';
    case 'object':
      return value === null ? 'null' : Array.isArray(value) ? 'a list' : 'an object';
  }
}

/** Where in some content a problem is, as it would be written in code: `objects[3].at[0]`. */
const pathText = (path: Path): string =>
  path
    .map((key, index) => {
      if (typeof key === 'number') return `[${key}]`;
      const name = String(key);
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) return `[${JSON.stringify(name)}]`;
      return index === 0 ? name : `.${name}`;
    })
    .join('');

export interface NewGameSources {
  readonly newGame: NewGame;
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly content: MapContent;
  readonly characters: Readonly<Record<string, unknown>>;
  readonly items: Readonly<Record<string, unknown>>;
}

/**
 * Checks what a new game starts with against the rest of the content. Returns one line per
 * problem: it starts on a map that exists, on a cell of it where the player can stand, and with
 * characters and items that exist.
 */
export function checkNewGame({
  newGame,
  maps,
  content,
  characters,
  items,
}: NewGameSources): string[] {
  const problems: string[] = [];
  const { map: id, x, y } = newGame.location;
  const map = Object.hasOwn(maps, id) ? maps[id] : undefined;
  if (!map) problems.push(`The new game starts on ${id}, which isn't a map`);
  let compiled: CompiledMap | undefined;
  try {
    if (map) compiled = compileMap(map, content);
  } catch {
    // checkMaps reports maps that don't compile.
  }
  if (compiled) {
    const onMap = x >= 0 && y >= 0 && x < compiled.width && y < compiled.height;
    const someone = compiled.npcs.find((npc) => npc.x === x && npc.y === y);
    if (!onMap || isBlocked(compiled, x, y)) {
      problems.push(`The new game starts at (${x}, ${y}) on ${id}, where the player can't stand`);
    } else if (someone) {
      problems.push(`The new game starts at (${x}, ${y}) on ${id}, where npc ${someone.id} stands`);
    }
  }
  for (const id of newGame.party) {
    if (!Object.hasOwn(characters, id)) {
      problems.push(`The new game starts with ${id} in the party, which isn't a character`);
    }
  }
  for (const item of Object.keys(newGame.inventory ?? {})) {
    if (!Object.hasOwn(items, item)) {
      problems.push(`The new game starts with ${item}, which isn't an item`);
    }
  }
  return problems;
}

export interface CharacterSources {
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly skills: Readonly<Record<string, unknown>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  /** The last level there is, EXP_CURVE.maxLevel in src/data/balance.ts. */
  readonly maxLevel: number;
}

/**
 * Checks each character against the skills and items. Returns one line per problem: the gear they
 * start with exists, is for the slot it's in, and is something they can equip; and the skills they
 * learn exist, at levels there are.
 */
export function checkCharacters({
  characters,
  skills,
  items,
  maxLevel,
}: CharacterSources): string[] {
  const problems: string[] = [];
  for (const [id, character] of Object.entries(characters)) {
    const owner = `Character ${id}`;
    for (const [slot, item] of Object.entries(character.equipment)) {
      const def = Object.hasOwn(items, item) ? items[item] : undefined;
      if (!def) problems.push(`${owner}: starts with ${item}, which isn't an item`);
      else if (slotOf(def) !== slot)
        problems.push(`${owner}: starts with ${item} as their ${slot}, which it isn't`);
      else if (!canEquip(character, def)) {
        problems.push(`${owner}: starts with ${item}, which they can't equip`);
      }
    }
    for (const { skill, level } of character.skills) {
      if (!Object.hasOwn(skills, skill)) {
        problems.push(`${owner}: learns ${skill}, which isn't a skill`);
      } else if (level !== undefined && level > maxLevel) {
        problems.push(
          `${owner}: learns ${skill} at level ${level}, but levels stop at ${maxLevel}`,
        );
      }
    }
  }
  return problems;
}

export interface EnemySources {
  readonly enemies: Readonly<Record<string, EnemyDef>>;
  readonly skills: Readonly<Record<string, SkillDef>>;
}

/**
 * Checks each enemy's actions, in every phase, against the skills. Returns one line per problem:
 * the skills they use exist, and an action with a rule for picking its target is aimed at one
 * fighter.
 */
export function checkEnemies({ enemies, skills }: EnemySources): string[] {
  const problems: string[] = [];
  for (const [id, enemy] of Object.entries(enemies)) {
    const lists: [string, readonly EnemyActionDef[]][] = [
      ['actions', enemy.actions ?? []],
      ...(enemy.phases ?? []).map((phase, index): [string, readonly EnemyActionDef[]] => [
        `phases[${index}].actions`,
        phase.actions,
      ]),
    ];
    for (const [path, actions] of lists) {
      for (const [index, action] of actions.entries()) {
        if (action.type !== 'skill') continue;
        const where = `Enemy ${id}: ${path}[${index}]`;
        const skill = Object.hasOwn(skills, action.skill) ? skills[action.skill] : undefined;
        if (!skill) {
          problems.push(`${where} uses ${action.skill}, which isn't a skill`);
        } else if (
          action.target !== undefined &&
          skill.target !== 'one-enemy' &&
          skill.target !== 'one-ally'
        ) {
          problems.push(`${where} picks a target for ${skill.name}, which isn't aimed at one`);
        }
      }
    }
  }
  return problems;
}

/** Checks that every enemy an encounter table's groups name exists. One line per problem. */
export function checkEncounters({
  encounters,
  enemies,
}: {
  readonly encounters: Readonly<Record<string, EncounterTable>>;
  readonly enemies: Readonly<Record<string, unknown>>;
}): string[] {
  return Object.entries(encounters).flatMap(([id, table]) =>
    table.groups.flatMap((group, index) =>
      [...new Set(group.enemies)]
        .filter((enemy) => !Object.hasOwn(enemies, enemy))
        .map(
          (enemy) => `Encounter table ${id}: groups[${index}] has ${enemy}, which isn't an enemy`,
        ),
    ),
  );
}

export interface AreaSources {
  readonly areas: Readonly<Record<string, AreaBalance>>;
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly enemies: Readonly<Record<string, unknown>>;
  readonly encounters: Readonly<Record<string, unknown>>;
  /** The last level there is, EXP_CURVE.maxLevel in src/data/balance.ts. */
  readonly maxLevel: number;
}

/**
 * Checks the areas the simulator plays (AREAS in src/data/balance.ts) against the content. One
 * line per problem: their party, gear, items, encounter table and boss exist, the gear fits its
 * wearer, and their levels are levels there are, the boss's no lower than the arrival's.
 */
export function checkAreas({
  areas,
  characters,
  items,
  enemies,
  encounters,
  maxLevel,
}: AreaSources): string[] {
  const problems: string[] = [];
  for (const [id, area] of Object.entries(areas)) {
    const owner = `Area ${id}`;
    for (const member of area.party) {
      if (!Object.hasOwn(characters, member)) {
        problems.push(`${owner}: ${member} is in its party, but isn't a character`);
      }
    }
    if (!Object.hasOwn(encounters, area.encounters)) {
      problems.push(`${owner}: its encounter table, ${area.encounters}, doesn't exist`);
    }
    for (const enemy of area.boss) {
      if (!Object.hasOwn(enemies, enemy))
        problems.push(`${owner}: its boss, ${enemy}, isn't an enemy`);
    }
    for (const [when, checkpoint] of [
      ['arrival', area.arrival],
      ['atBoss', area.atBoss],
    ] as const) {
      if (
        !Number.isSafeInteger(checkpoint.level) ||
        checkpoint.level < 1 ||
        checkpoint.level > maxLevel
      ) {
        problems.push(
          `${owner}: ${when}.level is ${checkpoint.level}, but levels go from 1 to ${maxLevel}`,
        );
      }
      for (const item of Object.keys(checkpoint.items)) {
        if (!Object.hasOwn(items, item))
          problems.push(`${owner}: ${when} carries ${item}, which isn't an item`);
      }
      for (const [member, gear] of Object.entries(checkpoint.gear ?? {})) {
        const character = Object.hasOwn(characters, member) ? characters[member] : undefined;
        if (!area.party.includes(member) || !character) {
          problems.push(`${owner}: ${when} gives gear to ${member}, who isn't in its party`);
          continue;
        }
        for (const item of gear) {
          const def = Object.hasOwn(items, item) ? items[item] : undefined;
          if (!def) problems.push(`${owner}: ${when} gives ${member} ${item}, which isn't an item`);
          else if (!canEquip(character, def)) {
            problems.push(`${owner}: ${when} gives ${member} ${item}, which they can't equip`);
          }
        }
      }
    }
    if (area.atBoss.level < area.arrival.level) {
      problems.push(`${owner}: the party is a lower level at the boss than on arrival`);
    }
  }
  return problems;
}
