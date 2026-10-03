/** A touch that ends this soon after the last one could be the second half of a double tap. */
export const DOUBLE_TAP_MS = 350;

/**
 * Stops the browser zooming the page, which would push part of the game off the screen. The game
 * sizes itself to fit (`pickZoom`), so page zoom only ever gets in the way. The viewport tag and
 * `touch-action: none` (both in index.html) stop it in most browsers. iOS Safari lets people pinch
 * whatever the viewport tag says, and can zoom on a quick second tap, like mashing A through
 * dialogue, so for it this cancels its pinch gestures, and every touch that ends soon after the
 * last one. The touch controls work on pointer events, which come first, so they still see the tap.
 */
export function preventPageZoom(): void {
  const cancel = (event: Event): void => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, cancel, { passive: false });
  }

  let lastEnd = Number.NEGATIVE_INFINITY;
  document.addEventListener(
    'touchend',
    (event) => {
      if (event.timeStamp - lastEnd < DOUBLE_TAP_MS) event.preventDefault();
      lastEnd = event.timeStamp;
    },
    { passive: false },
  );
}
