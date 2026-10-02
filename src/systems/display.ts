/** The game's fixed resolution. The world is drawn at 2× inside it (see "Rendering" in docs/TECH.md). */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

/**
 * How much to scale the game to fit a view of the given size, in CSS pixels.
 * Whole-number scales keep every game pixel the same size, so use the biggest one that fits.
 * Views smaller than the game itself (phones, mostly) shrink it to fit instead.
 */
export function pickZoom(viewWidth: number, viewHeight: number): number {
  const fit = Math.min(viewWidth / GAME_WIDTH, viewHeight / GAME_HEIGHT);
  if (!(fit > 0)) return 1; // a zero-size or hidden view; any value will do until it resizes
  return fit >= 1 ? Math.floor(fit) : fit;
}
