import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { decodePng } from './png';

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  // The decoder doesn't check CRCs, so these stay 0.
  return out;
}

/** A PNG of raw 8-bit samples, every row run through the same scanline filter. */
function encodePng(
  width: number,
  height: number,
  colour: number,
  samples: number[],
  filter: number,
) {
  const channels = CHANNELS[colour] ?? 0;
  const stride = width * channels;
  const sample = (x: number, y: number): number =>
    x < 0 || y < 0 ? 0 : (samples[y * stride + x] ?? 0);
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    data.push(filter);
    for (let x = 0; x < stride; x++) {
      const [left, up, upLeft] = [
        sample(x - channels, y),
        sample(x, y - 1),
        sample(x - channels, y - 1),
      ];
      const estimate = left + up - upLeft;
      const paeth = [left, up, upLeft].sort(
        (a, b) => Math.abs(estimate - a) - Math.abs(estimate - b),
      )[0];
      const predicted = [0, left, up, Math.floor((left + up) / 2), paeth ?? 0][filter] ?? 0;
      data.push((sample(x, y) - predicted) & 0xff);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, colour, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Uint8Array.from(data))),
    chunk('IEND', new Uint8Array()),
  ];
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

describe('decodePng', () => {
  // 3×2 RGBA: varied enough that every filter predicts something different.
  const RGBA = [
    [10, 200, 30, 255, 250, 5, 60, 128, 0, 0, 0, 0],
    [90, 80, 70, 255, 255, 255, 255, 255, 7, 77, 177, 200],
  ].flat();

  test.each([0, 1, 2, 3, 4])('undoes scanline filter %i', (filter) => {
    const png = decodePng(encodePng(3, 2, 6, RGBA, filter));
    expect(png.width).toBe(3);
    expect(png.height).toBe(2);
    expect([...png.rgba]).toEqual(RGBA);
  });

  test('reads grey, RGB and grey with alpha as RGBA', () => {
    expect([...decodePng(encodePng(2, 1, 0, [0, 200], 1)).rgba]).toEqual([
      0, 0, 0, 255, 200, 200, 200, 255,
    ]);
    expect([...decodePng(encodePng(1, 1, 2, [1, 2, 3], 0)).rgba]).toEqual([1, 2, 3, 255]);
    expect([...decodePng(encodePng(2, 1, 4, [9, 0, 50, 255], 4)).rgba]).toEqual([
      9, 9, 9, 0, 50, 50, 50, 255,
    ]);
  });

  test('reads the body font, a real grey-and-alpha PNG', () => {
    const font = decodePng(
      readFileSync(join(import.meta.dirname, '../public/assets/fonts/font-8x8.png')),
    );
    expect([font.width, font.height]).toEqual([120, 64]);
    // The space, the first cell, is empty; "!", the second, isn't.
    const alphaInCell = (cell: number): number[] =>
      Array.from({ length: 64 }, (_, i) => {
        const [x, y] = [cell * 8 + (i % 8), Math.floor(i / 8)];
        return font.rgba[(y * font.width + x) * 4 + 3] ?? 0;
      });
    expect(alphaInCell(0).every((alpha) => alpha === 0)).toBe(true);
    expect(alphaInCell(1).some((alpha) => alpha > 0)).toBe(true);
  });

  test('turns down what it can’t read', () => {
    expect(() => decodePng(new TextEncoder().encode('not a png at all'))).toThrow('Not a PNG');
    const palette = encodePng(1, 1, 6, [0, 0, 0, 0], 0);
    palette[8 + 8 + 9] = 3; // IHDR's colour type
    expect(() => decodePng(palette)).toThrow('Only 8-bit');
  });
});
