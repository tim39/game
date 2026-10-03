/**
 * Keeps the browser's own touch gestures out of the game: zooming the page (a pinch, a double tap),
 * the magnifying glass and text selection on a long press, and scrolling. The game handles every
 * touch itself, sizes itself to fit (`pickZoom`), and on a phone those gestures only crop it.
 *
 * The viewport tag and `touch-action: none` (index.html) are meant to stop them, and do in most
 * browsers, but iOS Safari still zoomed while the touch controls were in use. Phaser cancels the
 * browser's handling of touches on its canvas, but the controls are page elements over the game.
 * So this cancels it for every touch on the page, and Safari's own pinch events too. Pointer events
 * come before touch events and don't depend on them, so the touch controls still see every touch;
 * but touches no longer make `click` events.
 */
export function preventBrowserGestures(): void {
  const cancel = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange']) {
    document.addEventListener(type, cancel, { passive: false });
  }
}
