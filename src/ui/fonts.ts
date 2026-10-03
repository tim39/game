import Phaser from 'phaser';
import type { AssetKey } from '../systems/asset-manifest';
import {
  FONT_CELL,
  FONT_CHARS,
  FONT_CHARS_PER_ROW,
  glyphAdvance,
  measureGlyphColumns,
  textWidth,
} from './glyph-metrics';

/** Bitmap font keys. Both are pixel fonts from the Ninja Adventure pack, recolored white so they can be tinted. */
export const FONT = {
  /** 8×8 grid. Body text, menus, dialogue. Drawn at 2× like the world. */
  body: 'font.body',
  /** 8×10 grid. Titles and headings. Drawn at 4×. */
  display: 'font.display',
} as const satisfies Record<string, AssetKey>;

// The glyph grid starts at the image's top-left corner, with no gaps between cells.
const GRID_ORIGIN = { 'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0 };

/** Phaser's glyph data. Its typings leave out `xAdvance`, which the parser sets and the renderer reads. */
type Glyph = Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & { xAdvance: number };

interface FontEntry {
  data: { chars: Record<number, Glyph | undefined> };
}

/** Call once the font images have loaded. They're in the asset manifest under the same keys. */
export function registerFonts(scene: Phaser.Scene): void {
  register(scene, FONT.body, FONT_CELL.body);
  register(scene, FONT.display, FONT_CELL.display);
}

/** A function giving the drawn width of a string in `fontKey`, in font pixels (before scaling). */
export function textMeasurer(scene: Phaser.Scene, fontKey: string): (text: string) => number {
  const { data } = scene.cache.bitmapFont.get(fontKey) as FontEntry;
  return (text) => textWidth(text, (char) => data.chars[char.charCodeAt(0)]?.xAdvance);
}

function register(
  scene: Phaser.Scene,
  key: string,
  { width: cellWidth, height: cellHeight }: { width: number; height: number },
): void {
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: key,
    width: cellWidth,
    height: cellHeight,
    chars: FONT_CHARS,
    charsPerRow: FONT_CHARS_PER_ROW,
    lineSpacing: 4,
    ...GRID_ORIGIN,
  }) as unknown as FontEntry;
  scene.cache.bitmapFont.add(key, entry);

  // RetroFont spaces every glyph a full cell apart. Measure each glyph's real width instead.
  const image = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D canvas context, so fonts cannot be measured');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const alphaAt = (x: number, y: number): number => pixels[(y * image.width + x) * 4 + 3] ?? 0;

  const columns = measureGlyphColumns(
    alphaAt,
    FONT_CHARS.length,
    FONT_CHARS_PER_ROW,
    cellWidth,
    cellHeight,
  );
  columns.forEach((cell, index) => {
    const glyph = entry.data.chars[FONT_CHARS.charCodeAt(index)];
    if (!glyph) return;
    if (cell) glyph.xOffset = -cell.left;
    glyph.xAdvance = glyphAdvance(cell);
  });
}
