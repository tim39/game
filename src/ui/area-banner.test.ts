import { describe, expect, test } from 'vitest';
import type { MapDef } from '../core/map/types';
import { GAME_WIDTH } from '../systems/display';
import {
  AREA_BANNER,
  areaBannerOnScreen,
  areaOf,
  bannerAlpha,
  bannerOnArrival,
} from './area-banner';

/** A town with a house in it, a road out of it, and a cave off the road. */
const map = (id: string, name: string, area?: string): MapDef => ({
  id,
  name,
  ...(area ? { area } : {}),
  terrain: '.',
  legend: { '.': 'grass' },
});
const MAPS: Record<string, MapDef> = {
  town: map('town', 'Saltmere'),
  house: map('house', "Tamsin's House", 'town'),
  cellar: map('cellar', 'The Cellar', 'town'),
  road: map('road', 'The North Road'),
};

describe('the area a map is in', () => {
  test('is its own, or the one it says it is part of', () => {
    expect(areaOf(MAPS.town ?? map('', ''))).toBe('town');
    expect(areaOf(MAPS.house ?? map('', ''))).toBe('town');
  });
});

describe('the banner on arriving', () => {
  test('names the area when the player comes from another', () => {
    expect(bannerOnArrival(MAPS, 'road', 'town')).toBe('The North Road');
    expect(bannerOnArrival(MAPS, 'town', 'road')).toBe('Saltmere');
    // From a house in town, the road is another area too.
    expect(bannerOnArrival(MAPS, 'road', 'house')).toBe('The North Road');
  });

  test('shows nothing going between maps in one area', () => {
    expect(bannerOnArrival(MAPS, 'house', 'town')).toBeNull();
    expect(bannerOnArrival(MAPS, 'town', 'house')).toBeNull();
    expect(bannerOnArrival(MAPS, 'cellar', 'house')).toBeNull();
    expect(bannerOnArrival(MAPS, 'town', 'town')).toBeNull();
  });

  test('names the area, not the map, starting somewhere without coming from anywhere', () => {
    expect(bannerOnArrival(MAPS, 'town')).toBe('Saltmere');
    expect(bannerOnArrival(MAPS, 'cellar')).toBe('Saltmere');
  });

  test('shows nothing for a map there isn’t, and names one in an area there isn’t itself', () => {
    expect(bannerOnArrival(MAPS, 'nowhere')).toBeNull();
    expect(bannerOnArrival(MAPS, 'constructor')).toBeNull();
    const lost = { ...MAPS, shed: map('shed', 'The Shed', 'farm') };
    expect(bannerOnArrival(lost, 'shed', 'road')).toBe('The Shed');
  });
});

describe('the banner on screen', () => {
  test('sits centred at the top, in whole banner pixels', () => {
    const box = areaBannerOnScreen(60);
    expect(box.x + box.width / 2).toBe(GAME_WIDTH / 2);
    expect(box.y).toBe(AREA_BANNER.top * 2);
    for (const value of Object.values(box)) expect(value % 2).toBe(0);
  });

  test('fits the name, with the frame and a gap round it', () => {
    // 60 pixels of name, 5 of frame and 6 of gap either side; 10 of name, 5 and 3 above and below.
    expect(areaBannerOnScreen(60)).toMatchObject({ width: 82 * 2, height: 26 * 2 });
    const widest = areaBannerOnScreen(AREA_BANNER.room);
    expect(widest.x).toBeGreaterThan(0);
  });

  test('fades in, stays and fades out', () => {
    const timing = { fadeIn: 300, hold: 2000, fadeOut: 500 };
    expect(bannerAlpha(0, timing)).toBe(0);
    expect(bannerAlpha(150, timing)).toBe(0.5);
    expect(bannerAlpha(300, timing)).toBe(1);
    expect(bannerAlpha(2299, timing)).toBe(1);
    expect(bannerAlpha(2550, timing)).toBe(0.5);
    expect(bannerAlpha(2800, timing)).toBe(0);
    expect(bannerAlpha(5000, timing)).toBe(0);
  });
});
