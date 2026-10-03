import { FONT_CELL, measureFont, textWidth } from '../src/ui/glyph-metrics';
import { decodePng } from './png';

/** A font measured the way the game measures it once its image has loaded (src/ui/fonts.ts). */
export interface MeasuredFont {
  /** The drawn width of a string, in font pixels. */
  readonly width: (text: string) => number;
  /** Whether the font has a glyph for a character. */
  readonly has: (char: string) => boolean;
}

/** The body font, which dialogue and menus use, measured from its image (a PNG file's bytes). */
export function measureBodyFont(png: Uint8Array): MeasuredFont {
  const { width, rgba } = decodePng(png);
  const alphaAt = (x: number, y: number): number => rgba[(y * width + x) * 4 + 3] ?? 0;
  const advances = measureFont(alphaAt, FONT_CELL.body.width, FONT_CELL.body.height);
  return {
    width: (text) => textWidth(text, (char) => advances.get(char)),
    has: (char) => advances.has(char),
  };
}
