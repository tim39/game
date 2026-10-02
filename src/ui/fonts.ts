import Phaser from 'phaser';
import { measureGlyphColumns } from './glyph-metrics';

/** Bitmap font keys. Both are pixel fonts from the Ninja Adventure pack, recolored white so they can be tinted. */
export const FONT = {
  /** 8×8 grid. Body text, menus, dialogue. Drawn at 2× like the world. */
  body: 'font.body',
  /** 8×10 grid. Titles and headings. Drawn at 4×. */
  display: 'font.display',
} as const;

/** Both fonts share one 15×8 grid: printable ASCII, a blank, then the IBM PC accented letters. */
const CHARS =
  Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('') +
  '\u007f' +
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûù';
const CHARS_PER_ROW = 15;

/** Glyphs are drawn at their own width plus this gap, rather than in fixed 8-pixel cells. */
const LETTER_GAP = 1;
const SPACE_ADVANCE = 4;

// The glyph grid starts at the image's top-left corner, with no gaps between cells.
const GRID_ORIGIN = { 'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0 };

/** Phaser's glyph data. Its typings leave out `xAdvance`, which the parser sets and the renderer reads. */
type Glyph = Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & { xAdvance: number };

interface FontEntry {
  data: { chars: Record<number, Glyph | undefined> };
}

export function loadFonts(scene: Phaser.Scene): void {
  scene.load.image('font.body.image', 'assets/fonts/font-8x8.png');
  scene.load.image('font.display.image', 'assets/fonts/font-8x10.png');
}

/** Call once the font images have loaded. */
export function registerFonts(scene: Phaser.Scene): void {
  register(scene, FONT.body, 'font.body.image', 8, 8);
  register(scene, FONT.display, 'font.display.image', 8, 10);
}

/** A function giving the drawn width of a string in `fontKey`, in font pixels (before scaling). */
export function textMeasurer(scene: Phaser.Scene, fontKey: string): (text: string) => number {
  const { data } = scene.cache.bitmapFont.get(fontKey) as FontEntry;
  return (text) => {
    let width = 0;
    for (const char of text) width += data.chars[char.charCodeAt(0)]?.xAdvance ?? 0;
    return text.length > 0 ? width - LETTER_GAP : 0;
  };
}

function register(
  scene: Phaser.Scene,
  fontKey: string,
  imageKey: string,
  cellWidth: number,
  cellHeight: number,
): void {
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: imageKey,
    width: cellWidth,
    height: cellHeight,
    chars: CHARS,
    charsPerRow: CHARS_PER_ROW,
    lineSpacing: 4,
    ...GRID_ORIGIN,
  }) as unknown as FontEntry;
  scene.cache.bitmapFont.add(fontKey, entry);

  // RetroFont spaces every glyph a full cell apart. Measure each glyph's real width instead.
  const image = scene.textures.get(imageKey).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D canvas context, so fonts cannot be measured');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const alphaAt = (x: number, y: number): number => pixels[(y * image.width + x) * 4 + 3] ?? 0;

  measureGlyphColumns(alphaAt, CHARS.length, CHARS_PER_ROW, cellWidth, cellHeight).forEach(
    (columns, index) => {
      const glyph = entry.data.chars[CHARS.charCodeAt(index)];
      if (!glyph) return;
      if (!columns) {
        glyph.xAdvance = SPACE_ADVANCE;
        return;
      }
      glyph.xOffset = -columns.left;
      glyph.xAdvance = columns.right - columns.left + 1 + LETTER_GAP;
    },
  );
}
