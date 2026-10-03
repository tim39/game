import { chestScript, type ChestText } from '../src/core/chest';
import { isDirection } from '../src/core/direction';
import { PLAYER, type EventContext, type EventScript } from '../src/core/events';
import type { MapDef, MapObject } from '../src/core/map/types';
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
  setFlag,
  setVar,
  type GameState,
} from '../src/core/state';
import type { Speaker } from '../src/data/speakers';
import type { AssetEntry } from '../src/systems/asset-manifest';
import { CHOICE_BOX, MAX_CHOICES, MAX_LINES, lineWidth } from '../src/ui/dialogue-layout';
import { wrapText } from '../src/ui/text-wrap';
import type { MeasuredFont } from './font-metrics';

export interface EventSources {
  readonly events: Readonly<Record<string, EventScript>>;
  readonly speakers: Readonly<Record<string, Speaker>>;
  readonly maps: Readonly<Record<string, MapDef>>;
  /** Logical key → entry, as in src/systems/asset-manifest.ts. */
  readonly manifest: Readonly<Record<string, AssetEntry>>;
  /** The body font, which dialogue is drawn in. */
  readonly font: MeasuredFont;
  /** What opening a chest says, as in src/data/ui-text.ts. */
  readonly chestText: ChestText;
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
 * Checks the event scripts, who speaks in them, and the maps that run them. Returns one line per
 * problem:
 * - every script a map's NPC, prefab or trigger runs exists;
 * - every speaker's portrait is an image in the asset manifest;
 * - every script, run against a stand-in context that answers at once, finishes without an error,
 *   down every path it can take. A path is an answer to each question the script asks: which
 *   choice the player picks, whether a flag it hasn't set itself is set, whether the party has an
 *   item, or gold. It starts on each map that runs it, and must only name speakers that exist,
 *   move and turn people who are on the map it's on, teleport to spawns that exist, and wait and
 *   fade for real lengths of time;
 * - every line it says fits in the dialogue box (three lines, narrower beside a portrait), every
 *   choice it offers fits the choice box, it offers one to four at a time, and the font has every
 *   character they use;
 * - every chest's script passes the same checks, run on its map: what it says when it opens and
 *   when it's empty fits the box, and it holds an item that exists.
 */
export async function checkEvents({
  events,
  speakers,
  maps,
  manifest,
  font,
  chestText,
}: EventSources): Promise<string[]> {
  const problems: string[] = [];
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

    const checkTime = (verb: string, ms: number | undefined): void => {
      if (ms !== undefined && !(ms >= 0 && Number.isFinite(ms))) {
        report(`it would ${verb} for ${ms} ms, which isn't a length of time`);
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
        const checkActor = (actor: string, verb: string): void => {
          if (actor === PLAYER) return;
          const map = mapId === null ? undefined : maps[mapId];
          if (map && !map.objects?.some((o) => o.type === 'npc' && o.id === actor)) {
            report(`it ${verb} ${actor}, but there's no one called that on ${map.id}`);
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
          teleport: (map, spawn) => {
            const there = maps[map]?.objects?.some((o) => o.type === 'spawn' && o.id === spawn);
            if (there) mapId = map;
            else report(`it teleports to spawn ${spawn} on ${map}, which isn't there`);
            return Promise.resolve();
          },
          flag: (name) => {
            if (!settled.flags.has(name)) {
              settled.flags.add(name);
              state = setFlag(state, name, ask(2) === 1);
            }
            return hasFlag(state, name);
          },
          setFlag: (name, on = true) => {
            state = setFlag(state, name, on);
            settled.flags.add(name);
          },
          var: (name) => getVar(state, name),
          setVar: (name, value) => {
            state = setVar(state, name, value);
          },
          hasItem: (item, count = 1) => {
            if (!settled.items.has(item) && hasItem(state, item, count) === false) {
              settled.items.add(item);
              if (ask(2) === 1) state = addItem(state, item, count);
            }
            return hasItem(state, item, count);
          },
          giveItem: (item, count = 1) => {
            state = addItem(state, item, count);
            settled.items.add(item);
          },
          takeItem: (item, count = 1) => {
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
            state = joinParty(state, character);
          },
        };

        try {
          await script(ev);
        } catch (error) {
          if (!(error instanceof LongPath)) {
            report(error instanceof Error ? error.message : String(error));
          }
        }
      }
    }
    problems.push(...found.values());
  }

  return problems;
}

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
