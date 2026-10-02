export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the field camera may look: the map, so it never shows past the edges. Where the map is
 * smaller than the view, the bounds grow to the view's size around the map, which centres it.
 */
export function cameraBounds(
  mapWidth: number,
  mapHeight: number,
  viewWidth: number,
  viewHeight: number,
): Rect {
  const width = Math.max(mapWidth, viewWidth);
  const height = Math.max(mapHeight, viewHeight);
  return {
    x: Math.floor((mapWidth - width) / 2),
    y: Math.floor((mapHeight - height) / 2),
    width,
    height,
  };
}
