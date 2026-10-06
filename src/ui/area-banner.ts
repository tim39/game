import type { MapDef } from '../core/map/types';
import { GAME_WIDTH } from '../systems/display';
import { FONT_CELL } from './glyph-metrics';

/**
 * The area banner without the drawing (see Screens in docs/DESIGN.md): arriving somewhere new, the
 * area's name fades in across the top of the screen, stays a moment and fades out. A map is an
 * area of its own, or with `area` part of another map's, as a town's houses are part of the town,
 * so going between maps in one area shows nothing. src/ui/area-banner-box.ts draws it.
 */

/** The area a map is in, by the ID of the map that names it: its own, or its `area`. */
export const areaOf = (map: Pick<MapDef, 'id' | 'area'>): string => map.area ?? map.id;

/**
 * The name the banner shows on arriving on `map`: its area's, unless the player has come from
 * `from`, a map in the same area. Starting the game somewhere (a new game, a load) has no `from`,
 * so it always names the area. Null for no banner.
 */
export function bannerOnArrival(
  maps: Readonly<Record<string, MapDef>>,
  map: string,
  from?: string,
): string | null {
  const arriving = own(maps, map);
  if (!arriving) return null;
  const area = areaOf(arriving);
  const left = from === undefined ? undefined : own(maps, from);
  if (left && areaOf(left) === area) return null;
  return own(maps, area)?.name ?? arriving.name;
}

/** The banner is drawn at 2×, like the rest of the UI. */
export const AREA_BANNER_SCALE = 2;

/**
 * The banner: the pack's choice box (`ChoiceBox.png`, as the menus use it), sliced at its frame and
 * stretched to fit the area's name in the display font, centred at the top of the screen. In its
 * own pixels, drawn at 2×.
 */
export const AREA_BANNER = {
  /** How far down from the top of the screen it sits. */
  top: 8,
  /** How thick the frame is, corners included. */
  frame: 5,
  /** Gap between the frame and the name. */
  inset: { x: 6, y: 3 },
  /**
   * The widest a name may be, in font pixels, for `npm run validate`. Centred, a banner this wide
   * stays clear of the touch controls' Menu button on phones held sideways.
   */
  room: 150,
} as const;

/** Where the banner goes on the 640×360 screen, in game pixels, for a name `textWidth` wide. */
export function areaBannerOnScreen(textWidth: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { top, frame, inset } = AREA_BANNER;
  const width = 2 * (frame + inset.x) + textWidth;
  const height = 2 * (frame + inset.y) + FONT_CELL.display.height;
  // In whole banner pixels, so the art stays crisp.
  const left = Math.round((GAME_WIDTH / AREA_BANNER_SCALE - width) / 2);
  return {
    x: left * AREA_BANNER_SCALE,
    y: top * AREA_BANNER_SCALE,
    width: width * AREA_BANNER_SCALE,
    height: height * AREA_BANNER_SCALE,
  };
}

/**
 * How much of the banner shows, from 0 to 1, `ms` after it starts: fading in, staying, then
 * fading out to nothing.
 */
export function bannerAlpha(
  ms: number,
  timing: { readonly fadeIn: number; readonly hold: number; readonly fadeOut: number },
): number {
  const { fadeIn, hold, fadeOut } = timing;
  if (ms < fadeIn) return Math.max(0, ms / fadeIn);
  if (ms < fadeIn + hold) return 1;
  return Math.max(0, 1 - (ms - fadeIn - hold) / fadeOut);
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
