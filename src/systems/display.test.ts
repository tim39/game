import { describe, expect, it } from 'vitest';
import { pickZoom } from './display';

describe('pickZoom', () => {
  it('uses exact whole-number scales for common screen sizes', () => {
    expect(pickZoom(640, 360)).toBe(1);
    expect(pickZoom(1280, 720)).toBe(2);
    expect(pickZoom(1920, 1080)).toBe(3);
    expect(pickZoom(2560, 1440)).toBe(4);
    expect(pickZoom(3840, 2160)).toBe(6);
  });

  it('rounds down to the biggest whole-number scale that fits, limited by either side', () => {
    expect(pickZoom(1366, 768)).toBe(2);
    expect(pickZoom(1920, 960)).toBe(2); // a 1080p screen minus browser toolbars
    expect(pickZoom(3000, 800)).toBe(2); // very wide: height decides
    expect(pickZoom(700, 2000)).toBe(1); // very tall: width decides
  });

  it('shrinks to fit when the view is smaller than the game', () => {
    expect(pickZoom(390, 844)).toBeCloseTo(390 / 640); // phone, portrait
    expect(pickZoom(600, 300)).toBeCloseTo(300 / 360);
  });

  it('copes with a zero-size view', () => {
    expect(pickZoom(0, 0)).toBe(1);
    expect(pickZoom(Number.NaN, 720)).toBe(1);
  });
});
