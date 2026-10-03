import type { EventContext, EventScript } from '../src/core/events';
import type { MapDef } from '../src/core/map/types';
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
}

/** More choices than this in one run of a script stops the run: it's probably asking in a loop. */
const MAX_CHOICES_PER_RUN = 8;
/** A script with more ways through its choices than this is too tangled to check, and to follow. */
const MAX_PATHS = 1000;

/** Thrown to stop a run that has made MAX_CHOICES_PER_RUN choices. */
class LongPath extends Error {}

/**
 * Checks the event scripts, who speaks in them, and the maps that run them. Returns one line per
 * problem:
 * - every script a map's NPC or prefab runs exists;
 * - every speaker's portrait is an image in the asset manifest;
 * - every script, run against a stand-in context that answers at once, down every path its
 *   choices can take, finishes without an error and only names speakers that exist;
 * - every line it says fits in the dialogue box (three lines, narrower beside a portrait), every
 *   choice it offers fits the choice box, it offers one to four at a time, and the font has every
 *   character they use.
 */
export async function checkEvents({
  events,
  speakers,
  maps,
  manifest,
  font,
}: EventSources): Promise<string[]> {
  const problems: string[] = [];

  for (const map of Object.values(maps)) {
    for (const object of map.objects ?? []) {
      if (object.type !== 'npc' && object.type !== 'prefab') continue;
      if (!object.script || events[object.script]) continue;
      const [x, y] = object.at;
      const what =
        object.type === 'npc' ? `npc ${object.id}` : `the ${object.prefab} at (${x}, ${y})`;
      problems.push(`Map ${map.id}: ${what} runs ${object.script}, which isn't an event script`);
    }
  }

  for (const [id, { portrait }] of Object.entries(speakers)) {
    if (portrait !== undefined && manifest[portrait]?.type !== 'image') {
      problems.push(`Speaker ${id}: the portrait ${portrait} isn't an image in the asset manifest`);
    }
  }

  for (const [id, script] of Object.entries(events)) {
    // A problem found on many paths is reported once. Problems with a line are told apart by the
    // whole line, as the report only quotes the start of it.
    const found = new Map<string, string>();
    const report = (problem: string, key = problem): void => {
      if (!found.has(key)) found.set(key, `Event ${id}: ${problem}`);
    };
    const unknownCharacters = (text: string): string[] => [
      ...new Set([...text].filter((char) => char !== '\n' && !font.has(char))),
    ];

    const say = (speakerId: string, text: string): Promise<void> => {
      const speaker = speakers[speakerId];
      if (!speaker) {
        report(`there's no speaker called ${speakerId}`);
        return Promise.resolve();
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
      return Promise.resolve();
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

    // Each run follows a path: which option to pick at each choice, 0 past its end. Reaching a
    // choice past the end for the first time queues the paths that pick its other options.
    const paths: number[][] = [[]];
    for (let runs = 0; paths.length > 0; runs++) {
      if (runs === MAX_PATHS) {
        report(`there are more than ${MAX_PATHS} ways through its choices; split it up`);
        break;
      }
      const path = paths.shift() ?? [];
      const taken: number[] = [];
      const ev: EventContext = {
        say,
        choice: (options) => {
          if (taken.length === MAX_CHOICES_PER_RUN) return Promise.reject(new LongPath());
          const valid = checkChoices(options);
          if (valid && taken.length >= path.length) {
            for (let other = 1; other < options.length; other++) paths.push([...taken, other]);
          }
          const pick = path[taken.length] ?? 0;
          taken.push(pick);
          return Promise.resolve(pick);
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
    problems.push(...found.values());
  }

  return problems;
}

/** The start of some text, quoted, to say which line a problem is in. */
function quote(text: string): string {
  return `"${text.length > 32 ? `${text.slice(0, 30).trimEnd()}…` : text}"`;
}

const list = (chars: readonly string[]): string => chars.map((char) => `"${char}"`).join(', ');
