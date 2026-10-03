/** Both fonts share one 15×8 grid: printable ASCII, a blank, then the IBM PC accented letters. */
export const FONT_CHARS =
  Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('') +
  '\u007f' +
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûù';
export const FONT_CHARS_PER_ROW = 15;

/** Each font sheet's cell size, in pixels: an 8×8 grid for body text and an 8×10 one for titles. */
export const FONT_CELL = {
  body: { width: 8, height: 8 },
  display: { width: 8, height: 10 },
} as const;

/** Glyphs are drawn at their own width plus this gap, rather than in fixed 8-pixel cells. */
export const LETTER_GAP = 1;
/** How far a space (an empty cell) moves the pen. */
const SPACE_ADVANCE = 4;

export interface GlyphColumns {
  /** First column (from the cell's left edge) with any visible pixel. */
  readonly left: number;
  /** Last column with any visible pixel. */
  readonly right: number;
}

/**
 * For each cell of a fixed-grid font sheet, the span of columns its glyph actually uses, or
 * `null` for an empty cell (like the space). Lets a monospaced sheet be drawn proportionally.
 */
export function measureGlyphColumns(
  alphaAt: (x: number, y: number) => number,
  cellCount: number,
  cellsPerRow: number,
  cellWidth: number,
  cellHeight: number,
): (GlyphColumns | null)[] {
  return Array.from({ length: cellCount }, (_, index) => {
    const cellX = (index % cellsPerRow) * cellWidth;
    const cellY = Math.floor(index / cellsPerRow) * cellHeight;
    let left = Infinity;
    let right = -Infinity;
    for (let x = 0; x < cellWidth; x++) {
      for (let y = 0; y < cellHeight; y++) {
        if (alphaAt(cellX + x, cellY + y) > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return right >= left ? { left, right } : null;
  });
}

/** How far the pen moves past a glyph: its width and the gap, or a space's width for an empty cell. */
export const glyphAdvance = (columns: GlyphColumns | null): number =>
  columns ? columns.right - columns.left + 1 + LETTER_GAP : SPACE_ADVANCE;

/**
 * The drawn width of a string, in font pixels: each character's advance, less the gap after the
 * last. A character the font doesn't have takes no room, as it draws nothing.
 */
export function textWidth(text: string, advanceOf: (char: string) => number | undefined): number {
  let width = 0;
  for (const char of text) width += advanceOf(char) ?? 0;
  return text.length > 0 ? width - LETTER_GAP : 0;
}

/** Every character of a font sheet laid out as FONT_CHARS, with how far each moves the pen. */
export function measureFont(
  alphaAt: (x: number, y: number) => number,
  cellWidth: number,
  cellHeight: number,
): Map<string, number> {
  const columns = measureGlyphColumns(
    alphaAt,
    FONT_CHARS.length,
    FONT_CHARS_PER_ROW,
    cellWidth,
    cellHeight,
  );
  return new Map(
    [...FONT_CHARS].map((char, index) => [char, glyphAdvance(columns[index] ?? null)]),
  );
}
