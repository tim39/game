import { expect, test } from 'vitest';
import { cameraBounds } from './camera';

test('a map bigger than the view bounds the camera to the map', () => {
  expect(cameraBounds(640, 384, 320, 180)).toEqual({ x: 0, y: 0, width: 640, height: 384 });
});

test('a map smaller than the view sits in the middle of it', () => {
  // A 10×6-tile room in a 20×11.25-tile view.
  expect(cameraBounds(160, 96, 320, 180)).toEqual({ x: -80, y: -42, width: 320, height: 180 });
  // Wide but short: bounded across, centred down.
  expect(cameraBounds(640, 176, 320, 180)).toEqual({ x: 0, y: -2, width: 640, height: 180 });
});
