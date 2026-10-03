import { inflateSync } from 'node:zlib';

/** A decoded image: `rgba` holds 4 bytes per pixel, row by row from the top left. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel for each colour type this decoder reads: grey, RGB, grey + alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Decodes a PNG with 8 bits per channel, the kind the pack's art and our fonts are, so the tools
 * can read pixels (font glyph widths) without a browser. Palette, 16-bit and interlaced images
 * throw, as do broken files.
 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new Error('Not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  let header = { width: 0, height: 0, depth: 0, colour: -1, interlace: 0 };
  const data: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = text.decode(bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        depth: body[8] ?? 0,
        colour: body[9] ?? -1,
        interlace: body[12] ?? 0,
      };
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }

  const { width, height, depth, colour, interlace } = header;
  const channels = CHANNELS[colour];
  if (depth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error('Only 8-bit, non-interlaced grey or RGB PNGs (with or without alpha) are read');
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) {
    throw new Error('The PNG has less image data than it should');
  }

  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? -1;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? (out[i - channels] ?? 0) : 0;
      const up = above[i] ?? 0;
      const upLeft = i >= channels ? (above[i - channels] ?? 0) : 0;
      out[i] = ((line[i] ?? 0) + predict(filter, left, up, upLeft)) & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  const grey = colour === 0 || colour === 4;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels;
    const r = rows[from] ?? 0;
    rgba[pixel * 4] = r;
    rgba[pixel * 4 + 1] = grey ? r : (rows[from + 1] ?? 0);
    rgba[pixel * 4 + 2] = grey ? r : (rows[from + 2] ?? 0);
    rgba[pixel * 4 + 3] =
      colour === 4 ? (rows[from + 1] ?? 0) : colour === 6 ? (rows[from + 3] ?? 0) : 255;
  }
  return { width, height, rgba };
}

/** What a scanline filter adds back to each byte. */
function predict(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4: {
      const estimate = left + up - upLeft;
      const toLeft = Math.abs(estimate - left);
      const toUp = Math.abs(estimate - up);
      const toUpLeft = Math.abs(estimate - upLeft);
      if (toLeft <= toUp && toLeft <= toUpLeft) return left;
      return toUp <= toUpLeft ? up : upLeft;
    }
    default:
      throw new Error(`Unknown PNG filter ${filter}`);
  }
}
