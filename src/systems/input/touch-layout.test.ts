import { describe, expect, test } from 'vitest';
import { CHOICE_BOX, MAX_CHOICES, choiceBoxOnScreen } from '../../ui/dialogue-layout';
import {
  dialogueBoxInView,
  dpadDirection,
  gameBoxInView,
  layoutTouchControls,
  type Box,
  type Insets,
  type Size,
} from './touch-layout';

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
// An iPhone held sideways keeps 47 px clear for the notch on both sides, and 21 px at the bottom.
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 };

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function expectSensible(view: Size, insets: Insets): void {
  const layout = layoutTouchControls(view, insets);
  const controls = [layout.dpad, layout.a, layout.b, layout.menu];
  for (const control of controls) {
    expect(control.x).toBeGreaterThanOrEqual(insets.left);
    expect(control.y).toBeGreaterThanOrEqual(insets.top);
    expect(control.x + control.width).toBeLessThanOrEqual(view.width - insets.right);
    expect(control.y + control.height).toBeLessThanOrEqual(view.height - insets.bottom);
    expect(Number.isInteger(control.x) && Number.isInteger(control.y)).toBe(true);
    expect(overlaps(control, dialogueBoxInView(view))).toBe(false);
  }
  controls.forEach((control, index) => {
    for (const other of controls.slice(index + 1)) expect(overlaps(control, other)).toBe(false);
  });
  for (const scale of Object.values(layout.scale)) expect(Number.isInteger(scale)).toBe(true);
}

describe('layoutTouchControls', () => {
  test('on a wide phone, the controls sit in the bottom corners beside the game', () => {
    // 915×412 shows the game at 1×, with 137 px to spare on each side.
    const layout = layoutTouchControls({ width: 915, height: 412 }, NO_INSETS);
    expect(layout.dpad).toEqual({ x: 12, y: 264, width: 136, height: 136 });
    expect(layout.scale).toEqual({ dpad: 8, button: 4, menu: 3 });
    expect(layout.b.y + layout.b.height).toBeLessThanOrEqual(400);
    expect(layout.a.x + layout.a.width).toBe(903);
    expect(layout.a.x).toBeGreaterThan(layout.b.x);
    expect(layout.a.y).toBeLessThan(layout.b.y);
    expect(layout.menu).toEqual({ x: 825, y: 12, width: 78, height: 27 });
    expectSensible({ width: 915, height: 412 }, NO_INSETS);
  });

  test('where they would cover the dialogue box, they move up to sit above it', () => {
    const view = { width: 844, height: 390 };
    const layout = layoutTouchControls(view, NOTCH);
    const box = dialogueBoxInView(view);
    expect(layout.dpad.x).toBe(59);
    expect(layout.dpad.y + layout.dpad.height).toBe(box.y - 12);
    expectSensible(view, NOTCH);
  });

  test('every control stays on screen and clear of the box on common phones and tablets', () => {
    const views: Size[] = [
      { width: 667, height: 375 },
      { width: 568, height: 320 },
      { width: 932, height: 430 },
      { width: 1024, height: 768 },
      { width: 1180, height: 820 },
    ];
    for (const view of views) {
      expectSensible(view, NO_INSETS);
      expectSensible(view, NOTCH);
    }
  });

  test('stay clear of the biggest choice box on phones held sideways', () => {
    // 16:9 phones fill the screen with the game; phones with a notch have room beside it.
    const phones: [Size, Insets][] = [
      [{ width: 667, height: 375 }, NO_INSETS],
      [{ width: 568, height: 320 }, NO_INSETS],
      [{ width: 812, height: 375 }, NOTCH],
      [{ width: 844, height: 390 }, NOTCH],
      [{ width: 932, height: 430 }, NOTCH],
    ];
    const choices = choiceBoxOnScreen(CHOICE_BOX.maxTextWidth, MAX_CHOICES);
    for (const [view, insets] of phones) {
      const layout = layoutTouchControls(view, insets);
      for (const control of [layout.dpad, layout.a, layout.b, layout.menu]) {
        expect(overlaps(control, gameBoxInView(view, choices))).toBe(false);
      }
    }
  });

  test('a tablet gets bigger controls, still in the corners', () => {
    const layout = layoutTouchControls({ width: 1024, height: 768 }, NO_INSETS);
    expect(layout.scale).toEqual({ dpad: 9, button: 5, menu: 4 });
    expect(layout.dpad.y + layout.dpad.height).toBe(768 - 12);
  });
});

describe('dpadDirection', () => {
  test('presses the way the thumb is furthest from the middle', () => {
    expect(dpadDirection(30, 5, 60)).toBe('right');
    expect(dpadDirection(-30, 5, 60)).toBe('left');
    expect(dpadDirection(5, -30, 60)).toBe('up');
    expect(dpadDirection(5, 30, 60)).toBe('down');
  });

  test('presses nothing near the middle', () => {
    expect(dpadDirection(5, 5, 60)).toBeNull();
    expect(dpadDirection(0, 0, 60)).toBeNull();
  });

  test('keeps the current direction near a diagonal, until the other axis clearly leads', () => {
    expect(dpadDirection(20, 22, 60)).toBe('down');
    expect(dpadDirection(20, 22, 60, 'right')).toBe('right');
    expect(dpadDirection(20, 26, 60, 'right')).toBe('down');
    expect(dpadDirection(-22, -20, 60, 'up')).toBe('up');
    // A held direction doesn't stick once the thumb crosses to the other side.
    expect(dpadDirection(-30, 2, 60, 'right')).toBe('left');
  });
});
