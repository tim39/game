import { MAX_ENEMIES } from '../src/core/battle/battle';
import { chestScript, type ChestText } from '../src/core/chest';
import { STEP, isDirection } from '../src/core/direction';
import { PLAYER, type EventContext, type EventScript } from '../src/core/events';
import { compileMap, type CompiledMap } from '../src/core/map/compile';
import type { GridPoint, MapContent, MapDef, MapObject } from '../src/core/map/types';
import {
  addGold,
  addItem,
  createGameState,
  getVar,
  hasFlag,
  hasItem,
  joinParty,
  removeGold,
  removeItem,
  restoreParty,
  setFlag,
  setVar,
  type GameState,
} from '../src/core/state';
import type { Speaker } from '../src/core/schema';
import type { AssetEntry } from '../src/systems/asset-manifest';
import { CHOICE_BOX, MAX_CHOICES, MAX_LINES, lineWidth } from '../src/ui/dialogue-layout';
import { wrapText } from '../src/ui/text-wrap';
import { STORY_NAMESPACE } from './content-checks';
import type { MeasuredFont } from './font-metrics';

export interface EventSources {
  readonly events: Readonly<Record<string, EventScript>>;
  readonly speakers: Readonly<Record<string, Speaker>>;
  readonly maps: Readonly<Record<string, MapDef>>;
  /** The terrains and prefabs the maps are built from, to see where people can walk. */
  readonly content: MapContent;
  /** Everyone who can be in the party, by ID, as in src/data/characters.ts. */
  readonly characters: Readonly<Record<string, unknown>>;
  /** Every item, by ID, as in src/data/items.ts. */
  readonly items: Readonly<Record<string, unknown>>;
  /** Every shop, by ID, as in src/data/shops.ts. */
  readonly shops: Readonly<Record<string, unknown>>;
  /** Every enemy, by ID, as in src/data/enemies.ts, and which are bosses. */
  readonly enemies: Readonly<Record<string, { readonly boss?: boolean }>>;
  /** Every battle backdrop, by ID, as in src/data/backdrops.ts. */
  readonly backdrops: Readonly<Record<string, unknown>>;
  /** Every picture, by ID, as in src/data/pictures.ts. */
  readonly pictures: Readonly<Record<string, unknown>>;
  /** Logical key → entry, as in src/systems/asset-manifest.ts. */
  readonly manifest: Readonly<Record<string, AssetEntry>>;
  /** The body font, which dialogue is drawn in. */
  readonly font: MeasuredFont;
  /** What opening a chest says, as in src/data/ui-text.ts. */
  readonly chestText: ChestText;
  /** The main story's points, as in src/data/story.ts: the only `story.` flags there are. */
  readonly story: readonly { readonly flag: string }[];
}

export interface EventReport {
  /** One line per problem. */
  readonly problems: string[];
  /**
   * Where scripts take the player: for each map that runs a script that teleports, every map it
   * can teleport to from there. Scripts no map runs aren't counted, as nothing sets them off.
   */
  readonly teleports: ReadonlyMap<string, ReadonlySet<string>>;
}

/** More questions than this in one run of a script stops the run: it's probably asking in a loop. */
const MAX_QUESTIONS_PER_RUN = 10;
/** A script with more ways through it than this is too tangled to check, and to follow. */
const MAX_PATHS = 1000;
/** The gold a run that asks has: plenty, so a script that checks it can afford things can buy them. */
const PLENTY_OF_GOLD = 999_999;

/** Thrown to stop a run that has asked MAX_QUESTIONS_PER_RUN questions. */
class LongPath extends Error {}

/**
 * Checks the event scripts, who speaks in them, and the maps that run them. Reports one line per
 * problem:
 * - every script a map's NPC, prefab or trigger runs exists;
 * - every speaker's portrait is an image in the asset manifest;
 * - every script, run against a stand-in context that answers at once, finishes without an error,
 *   down every path it can take. A path is an answer to each question the script asks: which
 *   choice the player picks, whether a flag it hasn't set itself is set, whether the party has an
 *   item, or gold, and whether a battle that can be fled is won or fled. It starts on each map
 *   that runs it, and must only name speakers, items and characters that exist, move and turn
 *   people who are on the map it's on, teleport to spawns that exist, fight 1 to 6 enemies that
 *   exist in front of a backdrop that does, wait and fade for real lengths of time, play music and
 *   sound effects that are in the asset manifest, and only read and set `story.` flags that are
 *   the story's points; and where it ends, it mustn't leave anyone it walked somewhere walling
 *   part of the map off (see `wallsOff`);
 * - every line it says fits in the dialogue box (three lines, narrower beside a portrait), every
 *   choice it offers fits the choice box, it offers one to four at a time, and the font has every
 *   character they use;
 * - every chest's script passes the same checks, run on its map: what it says when it opens and
 *   when it's empty fits the box, and it holds an item that exists.
 *
 * It also reports where the scripts take the player, for checking every map can be reached.
 */
export async function checkEvents({
  events,
  speakers,
  maps,
  content,
  characters,
  items,
  shops,
  enemies,
  backdrops,
  pictures,
  manifest,
  font,
  chestText,
  story,
}: EventSources): Promise<EventReport> {
  const problems: string[] = [];
  const storyFlags = new Set(story.map(({ flag }) => flag));
  const teleports = new Map<string, Set<string>>();
  // Which maps run each script.
  const runBy = new Map<string, string[]>();

  for (const map of Object.values(maps)) {
    for (const object of map.objects ?? []) {
      const script = scriptOf(object);
      if (!script) continue;
      if (events[script]) runBy.set(script, [...(runBy.get(script) ?? []), map.id]);
      else
        problems.push(
          `Map ${map.id}: ${describe(object)} runs ${script}, which isn't an event script`,
        );
    }
  }

  for (const [id, { portrait }] of Object.entries(speakers)) {
    if (portrait !== undefined && manifest[portrait]?.type !== 'image') {
      problems.push(`Speaker ${id}: the portrait ${portrait} isn't an image in the asset manifest`);
    }
  }

  // Every script to run, named as its problems are: the event scripts, each on every map that runs
  // it, and the script each chest runs, which says what's inside, on its map.
  const runs = [
    ...Object.entries(events).map(([id, script]) => ({
      name: `Event ${id}`,
      script,
      startMaps: runBy.get(id) ?? [null],
    })),
    ...Object.values(maps).flatMap((map) =>
      (map.objects ?? []).flatMap((object) =>
        object.type === 'chest'
          ? [
              {
                name: `Map ${map.id}: ${describe(object)}`,
                script: chestScript(object, chestText),
                startMaps: [map.id],
              },
            ]
          : [],
      ),
    ),
  ];

  for (const { name, script, startMaps } of runs) {
    // A problem found on many paths is reported once. Problems with a line are told apart by the
    // whole line, as the report only quotes the start of it.
    const found = new Map<string, string>();
    const report = (problem: string, key = problem): void => {
      if (!found.has(key)) found.set(key, `${name}: ${problem}`);
    };
    const unknownCharacters = (text: string): string[] => [
      ...new Set([...text].filter((char) => char !== '\n' && !font.has(char))),
    ];

    const checkLine = (speakerId: string, text: string): void => {
      const speaker = speakers[speakerId];
      if (!speaker) {
        report(`there's no speaker called ${speakerId}`);
        return;
      }
      const missing = unknownCharacters(text);
      if (missing.length > 0) {
        report(`${quote(text)} uses ${list(missing)}, which the font lacks`, `font:${text}`);
      }
      const lines = wrapText(text, lineWidth(speaker.portrait !== undefined), font.width).length;
      if (lines > MAX_LINES) {
        const problem = `${quote(text)} needs ${lines} lines, but the box holds ${MAX_LINES}`;
        report(problem, `fit:${speakerId}:${text}`);
      }
    };

    const checkChoices = (options: readonly string[]): boolean => {
      if (options.length < 1 || options.length > MAX_CHOICES) {
        report(`a choice offers ${options.length} options; it can offer 1 to ${MAX_CHOICES}`);
        return false;
      }
      for (const option of options) {
        const missing = unknownCharacters(option);
        if (option.trim() === '') report('a choice offers an empty option');
        if (option.includes('\n')) report(`the choice ${quote(option)} has a line break`);
        if (missing.length > 0) {
          report(`${quote(option)} uses ${list(missing)}, which the font lacks`, `font:${option}`);
        }
        const width = font.width(option);
        const most = CHOICE_BOX.maxTextWidth;
        if (width > most) {
          const problem = `the choice ${quote(option)} is ${width} pixels wide; the most is ${most}`;
          report(problem, `wide:${option}`);
        }
      }
      return true;
    };

    const checkSound = (key: string, kind: 'bgm.' | 'sfx.'): void => {
      if (!key.startsWith(kind) || manifest[key]?.type !== 'audio') {
        const what = kind === 'bgm.' ? 'music' : 'a sound effect';
        report(`it plays ${key}, which isn't ${what} in the asset manifest`);
      }
    };

    const checkTime = (verb: string, ms: number | undefined): void => {
      if (ms !== undefined && !(ms >= 0 && Number.isFinite(ms))) {
        report(`it would ${verb} for ${ms} ms, which isn't a length of time`);
      }
    };

    const checkItem = (item: string, verb: string): void => {
      if (!Object.hasOwn(items, item)) report(`it ${verb} ${item}, which isn't an item`);
    };

    const checkFlag = (flag: string, verb: string): void => {
      if (flag.startsWith(STORY_NAMESPACE) && !storyFlags.has(flag)) {
        report(`it ${verb} ${flag}, which isn't one of the story's points`);
      }
    };

    // Each run follows a path: the answer to each question, 0 past its end. Reaching a question
    // past the end for the first time queues the paths that answer it the other ways.
    for (const startMap of startMaps) {
      const paths: number[][] = [[]];
      for (let runs = 0; paths.length > 0; runs++) {
        if (runs === MAX_PATHS) {
          report(`there are more than ${MAX_PATHS} ways through it; split it up`);
          break;
        }
        const path = paths.shift() ?? [];
        const answers: number[] = [];
        const ask = (ways: number): number => {
          if (answers.length === MAX_QUESTIONS_PER_RUN) throw new LongPath();
          if (answers.length >= path.length) {
            for (let other = 1; other < ways; other++) paths.push([...answers, other]);
          }
          const answer = path[answers.length] ?? 0;
          answers.push(answer);
          return answer;
        };

        let state: GameState = createGameState({
          location: { map: startMap ?? 'nowhere', x: 0, y: 0, facing: 'down' },
          party: ['rowan'],
        });
        let mapId = startMap;
        // What this run has settled: once a flag, an item or gold is read or changed, it stays so.
        const settled = { flags: new Set<string>(), items: new Set<string>(), gold: false };
        // Who this run has seen off the map it's on, and where it has walked people to on it,
        // until it teleports.
        const gone = new Set<string>();
        const walked = new Map<string, GridPoint>();
        const checkActor = (actor: string, verb: string): void => {
          if (actor === PLAYER) return;
          const map = mapId === null ? undefined : maps[mapId];
          if (map && !map.objects?.some((o) => o.type === 'npc' && o.id === actor)) {
            report(`it ${verb} ${actor}, but there's no one called that on ${map.id}`);
          } else if (gone.has(actor)) {
            report(`it ${verb} ${actor}, who has left`);
          }
        };

        const ev: EventContext = {
          say: (speaker, text) => {
            checkLine(speaker, text);
            return Promise.resolve();
          },
          choice: (options) => Promise.resolve(ask(checkChoices(options) ? options.length : 1)),
          wait: (ms) => {
            checkTime('wait', ms);
            return Promise.resolve();
          },
          face: (actor, toward) => {
            checkActor(actor, 'turns');
            if (!isDirection(toward)) checkActor(toward, 'turns someone to face');
            return Promise.resolve();
          },
          move: (actor, route) => {
            checkActor(actor, 'moves');
            for (const step of route) {
              if (!isDirection(step))
                report(`it moves ${actor} "${String(step)}", which isn't a way`);
            }
            const from =
              walked.get(actor) ?? (mapId === null ? undefined : placed(maps[mapId], actor));
            if (from && route.every(isDirection)) {
              walked.set(
                actor,
                route.reduce<GridPoint>(
                  ([x, y], step) => [x + STEP[step][0], y + STEP[step][1]],
                  from,
                ),
              );
            }
            return Promise.resolve();
          },
          leave: (actor) => {
            if (actor === PLAYER)
              report('it has the player leave, which only NPCs can; teleport them');
            else checkActor(actor, 'sees off');
            gone.add(actor);
            return Promise.resolve();
          },
          fadeOut: (ms) => {
            checkTime('fade out', ms);
            return Promise.resolve();
          },
          fadeIn: (ms) => {
            checkTime('fade in', ms);
            return Promise.resolve();
          },
          picture: (id) => {
            if (id !== null && !Object.hasOwn(pictures, id)) {
              report(`it shows the picture ${id}, which isn't a picture`);
            }
            return Promise.resolve();
          },
          teleport: (map, spawn) => {
            const there = maps[map]?.objects?.some((o) => o.type === 'spawn' && o.id === spawn);
            if (!there) {
              report(`it teleports to spawn ${spawn} on ${map}, which isn't there`);
              return Promise.resolve();
            }
            if (mapId !== null) teleports.set(mapId, (teleports.get(mapId) ?? new Set()).add(map));
            mapId = map;
            gone.clear();
            walked.clear();
            return Promise.resolve();
          },
          shop: (id) => {
            if (!Object.hasOwn(shops, id)) report(`it opens the shop ${id}, which isn't a shop`);
            return Promise.resolve();
          },
          battle: (foes, backdrop) => {
            if (foes.length < 1 || foes.length > MAX_ENEMIES) {
              report(`it fights ${foes.length} enemies; a battle has 1 to ${MAX_ENEMIES}`);
            }
            for (const foe of foes) {
              if (!Object.hasOwn(enemies, foe)) report(`it fights ${foe}, which isn't an enemy`);
            }
            if (!Object.hasOwn(backdrops, backdrop)) {
              report(`it fights in front of ${backdrop}, which isn't a backdrop`);
            }
            // Nobody gets away from a boss; any other battle can go either way.
            const boss = foes.some((foe) => Object.hasOwn(enemies, foe) && enemies[foe]?.boss);
            return Promise.resolve(boss || ask(2) === 0 ? 'victory' : 'fled');
          },
          jingle: (sound) => {
            checkSound(sound, 'sfx.');
            return Promise.resolve();
          },
          bgm: (track) => {
            if (track !== null) checkSound(track, 'bgm.');
          },
          sfx: (sound) => checkSound(sound, 'sfx.'),
          flag: (name) => {
            checkFlag(name, 'reads');
            if (!settled.flags.has(name)) {
              settled.flags.add(name);
              state = setFlag(state, name, ask(2) === 1);
            }
            return hasFlag(state, name);
          },
          setFlag: (name, on = true) => {
            checkFlag(name, 'sets');
            state = setFlag(state, name, on);
            settled.flags.add(name);
          },
          var: (name) => getVar(state, name),
          setVar: (name, value) => {
            state = setVar(state, name, value);
          },
          hasItem: (item, count = 1) => {
            checkItem(item, 'checks for');
            if (!settled.items.has(item) && hasItem(state, item, count) === false) {
              settled.items.add(item);
              if (ask(2) === 1) state = addItem(state, item, count);
            }
            return hasItem(state, item, count);
          },
          giveItem: (item, count = 1) => {
            checkItem(item, 'gives');
            state = addItem(state, item, count);
            settled.items.add(item);
          },
          takeItem: (item, count = 1) => {
            checkItem(item, 'takes');
            state = removeItem(state, item, count);
            settled.items.add(item);
          },
          gold: () => {
            if (!settled.gold) {
              settled.gold = true;
              if (ask(2) === 1) state = addGold(state, PLENTY_OF_GOLD);
            }
            return state.gold;
          },
          giveGold: (amount) => {
            state = addGold(state, amount);
            settled.gold = true;
          },
          takeGold: (amount) => {
            state = removeGold(state, amount);
            settled.gold = true;
          },
          joinParty: (character) => {
            if (!Object.hasOwn(characters, character)) {
              report(`it adds ${character} to the party, which isn't a character`);
            }
            state = joinParty(state, character);
          },
          heal: () => {
            state = restoreParty(state);
          },
        };

        try {
          await script(ev);
          const def = mapId === null ? undefined : maps[mapId];
          const walledOff = def && wallsOff(def, content, state, walked, gone);
          if (walledOff) report(walledOff);
        } catch (error) {
          if (!(error instanceof LongPath)) {
            report(error instanceof Error ? error.message : String(error));
          }
        }
      }
    }
    problems.push(...found.values());
  }

  return { problems, teleports };
}

/** Where a map places someone, if it places them: not the player. */
function placed(map: MapDef | undefined, actor: string): GridPoint | undefined {
  const people = map?.objects?.flatMap((object) => (object.type === 'npc' ? [object] : []));
  return people?.find(({ id }) => id === actor)?.at;
}

/**
 * Whether the people a script walked somewhere wall part of the map off, where it leaves them:
 * cells that could be walked between with everyone where the map places them, but can't be with
 * them standing where they are now. A player there couldn't get out. Everyone the map places
 * stands in the way, about or not, as a run doesn't know who is; those seen off don't. Says who
 * is where, and the cells walled off, all but the biggest piece of what was split; or returns
 * null if nothing is.
 */
function wallsOff(
  def: MapDef,
  content: MapContent,
  state: GameState,
  walked: ReadonlyMap<string, GridPoint>,
  gone: ReadonlySet<string>,
): string | null {
  const people = (def.objects ?? []).flatMap((object) => (object.type === 'npc' ? [object] : []));
  const moved = people.flatMap(({ id, at }) => {
    const there = walked.get(id);
    return there && !gone.has(id) && (there[0] !== at[0] || there[1] !== at[1])
      ? [{ id, there }]
      : [];
  });
  if (moved.length === 0) return null;
  let map: CompiledMap;
  try {
    map = compileMap(def, content, (flag) => hasFlag(state, flag));
  } catch {
    return null; // checkMaps reports a map that doesn't compile
  }
  const { width, height, solid } = map;
  const cellAt = ([x, y]: GridPoint): number | null =>
    x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null;
  // The cells people stand in: where the map places them, and where the script leaves them.
  const standing = (where: (person: (typeof people)[number]) => GridPoint | null): Set<number> => {
    const cells = new Set<number>();
    for (const person of people) {
      const spot = where(person);
      const cell = spot && cellAt(spot);
      if (typeof cell === 'number') cells.add(cell);
    }
    return cells;
  };
  const before = standing(({ at }) => at);
  const after = standing(({ id, at }) => (gone.has(id) ? null : (walked.get(id) ?? at)));

  // Which piece of the map each open cell is in, with people standing in the way: -1 for none.
  const pieces = (blocked: ReadonlySet<number>): Int32Array => {
    const piece = new Int32Array(width * height).fill(-1);
    const open = (cell: number | null): cell is number =>
      cell !== null && !solid[cell] && !blocked.has(cell) && piece[cell] === -1;
    let next = 0;
    for (let first = 0; first < width * height; first++) {
      if (!open(first)) continue;
      piece[first] = next;
      for (let queue = [first], cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
        for (const [dx, dy] of Object.values(STEP)) {
          const neighbour = cellAt([(cell % width) + dx, Math.floor(cell / width) + dy]);
          if (open(neighbour)) {
            piece[neighbour] = next;
            queue.push(neighbour);
          }
        }
      }
      next++;
    }
    return piece;
  };
  const was = pieces(before);
  const now = pieces(after);
  // Each piece as it was, split into the pieces its cells are in now.
  const splits = new Map<number, Map<number, number[]>>();
  was.forEach((piece, cell) => {
    const into = now[cell] ?? -1;
    if (piece === -1 || into === -1) return;
    const split = splits.get(piece) ?? new Map<number, number[]>();
    split.set(into, [...(split.get(into) ?? []), cell]);
    splits.set(piece, split);
  });
  const walledOff = [...splits.values()]
    .flatMap((split) =>
      [...split.values()]
        .sort((a, b) => b.length - a.length)
        .slice(1)
        .flat(),
    )
    .sort((a, b) => a - b);
  if (walledOff.length === 0) return null;

  const named = ([x, y]: GridPoint): string => `(${x}, ${y})`;
  const who = moved.map(({ id, there }) => `${id} at ${named(there)}`);
  const cells = walledOff.map((cell) => named([cell % width, Math.floor(cell / width)]));
  const shown = cells.length > 4 ? [...cells.slice(0, 3), `${cells.length - 3} more cells`] : cells;
  return `it leaves ${andList(who)}, walling ${andList(shown)} off from the rest of ${def.id}`;
}

/** Things in a list, as a sentence says them: "a", "a and b", "a, b and c". */
const andList = (things: readonly string[]): string =>
  things.length < 2 ? (things[0] ?? '') : `${things.slice(0, -1).join(', ')} and ${things.at(-1)}`;

/** The script a map object runs, if it runs one. */
function scriptOf(object: MapObject): string | undefined {
  switch (object.type) {
    case 'npc':
    case 'prefab':
    case 'touch':
    case 'enter':
    case 'auto':
      return object.script;
    case 'warp':
    case 'spawn':
    case 'chest':
      return undefined;
  }
}

/** A map object, as a problem with it names it. */
function describe(object: MapObject): string {
  switch (object.type) {
    case 'npc':
      return `npc ${object.id}`;
    case 'prefab':
      return `the ${object.prefab} at (${object.at[0]}, ${object.at[1]})`;
    case 'touch':
      return `the touch at (${object.at[0]}, ${object.at[1]})`;
    case 'enter':
      return 'its enter trigger';
    case 'auto':
      return 'its auto trigger';
    case 'chest':
      return `the chest at (${object.at[0]}, ${object.at[1]})`;
    case 'warp':
    case 'spawn':
      return `its ${object.type}`;
  }
}

/** The start of some text, quoted, to say which line a problem is in. */
function quote(text: string): string {
  return `"${text.length > 32 ? `${text.slice(0, 30).trimEnd()}…` : text}"`;
}

const list = (chars: readonly string[]): string => chars.map((char) => `"${char}"`).join(', ');
