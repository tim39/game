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
