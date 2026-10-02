import type { Direction } from '../../core/direction';
import { DIALOGUE_BOX_ON_SCREEN } from '../../ui/dialogue-layout';
import { GAME_HEIGHT, GAME_WIDTH, pickZoom } from '../display';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A rectangle in CSS pixels, from the top-left of the game's container. */
export interface Box extends Size {
  readonly x: number;
  readonly y: number;
}

/** How far in from each edge the screen is clear of notches and rounded corners, in CSS pixels. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The size of one frame of each control's art (the pack's gamepad glyphs), in art pixels. */
export const TOUCH_ART = {
  dpad: { width: 17, height: 17 },
  button: { width: 16, height: 15 },
  menu: { width: 26, height: 9 },
} as const;

export interface TouchLayout {
  readonly dpad: Box;
  readonly a: Box;
  readonly b: Box;
  readonly menu: Box;
  /** CSS pixels per art pixel: whole numbers, so the art stays crisp. */
  readonly scale: { readonly dpad: number; readonly button: number; readonly menu: number };
}

/** Extra room around each control that still counts as touching it, in CSS pixels. */
export const TOUCH_SLOP = 10;

/** The gap between the controls and the screen's edges, and above the dialogue box. */
const GAP = 12;

/** A thumb this near the d-pad's middle, as a share of its radius, presses no direction. */
const DEADZONE = 0.2;

/** A thumb stays on its direction until the other axis leads by this much, so a diagonal can't flicker. */
const HYSTERESIS = 1.25;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Where the game's dialogue box is on a view of this size: the game is centred, at `pickZoom`. */
export function dialogueBoxInView(view: Size): Box {
  const zoom = pickZoom(view.width, view.height);
  const left = (view.width - GAME_WIDTH * zoom) / 2;
  const top = (view.height - GAME_HEIGHT * zoom) / 2;
  return {
    x: left + DIALOGUE_BOX_ON_SCREEN.x * zoom,
    y: top + DIALOGUE_BOX_ON_SCREEN.y * zoom,
    width: DIALOGUE_BOX_ON_SCREEN.width * zoom,
    height: DIALOGUE_BOX_ON_SCREEN.height * zoom,
  };
}

/**
 * Where the touch controls go on a view of this size. The d-pad sits in the bottom left corner,
 * and A and B in the bottom right, level with it: beside the game on most phones held sideways.
 * Where any of them would cover the dialogue box they all move up, to sit just above it. Menu goes
 * in the top right corner. They're sized to the view's height, at whole-number scales.
 */
export function layoutTouchControls(view: Size, insets: Insets): TouchLayout {
  const dpadTarget = clamp(view.height * 0.32, 100, 160);
  const scale = {
    dpad: Math.max(4, Math.round(dpadTarget / TOUCH_ART.dpad.width)),
    button: 0,
    menu: 0,
  };
  scale.button = Math.max(2, Math.round(scale.dpad / 2));
  scale.menu = Math.max(2, Math.round(scale.button * 0.75));
  const sized = (art: Size, by: number): Size => ({
    width: art.width * by,
    height: art.height * by,
  });
  const dpadSize = sized(TOUCH_ART.dpad, scale.dpad);
  const buttonSize = sized(TOUCH_ART.button, scale.button);
  const menuSize = sized(TOUCH_ART.menu, scale.menu);

  const left = insets.left + GAP;
  const right = view.width - insets.right - GAP;
  const bottom = view.height - insets.bottom - GAP;

  // A is up and to the right of B, the two of them centred on the d-pad's height.
  const place = (lift: number): Pick<TouchLayout, 'dpad' | 'a' | 'b'> => {
    const dpad = { x: left, y: Math.round(bottom - dpadSize.height - lift), ...dpadSize };
    const middle = dpad.y + dpad.height / 2;
    const a = {
      x: Math.round(right - buttonSize.width),
      y: Math.round(middle - buttonSize.height * 0.85),
      ...buttonSize,
    };
    const b = {
      x: Math.round(right - buttonSize.width * 2.1),
      y: Math.round(middle - buttonSize.height * 0.15),
      ...buttonSize,
    };
    return { dpad, a, b };
  };

  const box = dialogueBoxInView(view);
  const resting = place(0);
  const besideBox = (control: Box): boolean =>
    control.x < box.x + box.width && control.x + control.width > box.x;
  const needed = Math.max(
    0,
    ...Object.values(resting)
      .filter(besideBox)
      .map((control) => control.y + control.height - (box.y - GAP)),
  );
  // On a view too short to fit them above the box, they go as high as they can.
  const room = Math.max(0, resting.dpad.y - (insets.top + GAP));
  const menu = { x: Math.round(right - menuSize.width), y: insets.top + GAP, ...menuSize };
  return { ...place(Math.min(needed, room)), menu, scale };
}

/**
 * The direction a thumb at (dx, dy) from the d-pad's middle presses: whichever way it's further
 * along, or none near the middle. `current` is the direction pressed already, which holds until
 * the other axis clearly leads.
 */
export function dpadDirection(
  dx: number,
  dy: number,
  radius: number,
  current: Direction | null = null,
): Direction | null {
  if (Math.hypot(dx, dy) < radius * DEADZONE) return null;
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  const horizontal = dx < 0 ? 'left' : 'right';
  const vertical = dy < 0 ? 'up' : 'down';
  if (current === horizontal && across * HYSTERESIS >= down) return horizontal;
  if (current === vertical && down * HYSTERESIS >= across) return vertical;
  return across > down ? horizontal : vertical;
}
