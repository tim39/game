import type { Direction } from '../../core/direction';
import { UI_TEXT } from '../../data/ui-text';
import { ASSETS, type AssetKey } from '../asset-manifest';
import type { Action } from './actions';
import {
  TOUCH_ART,
  TOUCH_SLOP,
  dpadDirection,
  layoutTouchControls,
  type Box,
  type Insets,
  type Size,
} from './touch-layout';
import './touch-controls.css';

/** Phones and tablets, where touch is the main way in. They show the controls from the start. */
export function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Whether the touch controls are on: from the start on a phone, or after a first touch. */
export function touchMode(): boolean {
  return document.documentElement.classList.contains('touch');
}

/** The frames in touch-dpad.png. */
const DPAD_FRAMES: Readonly<Record<Direction | 'idle', number>> = {
  idle: 0,
  up: 1,
  down: 2,
  left: 3,
  right: 4,
};

type ButtonName = 'a' | 'b' | 'menu';

/** The touch controls' images. */
type TouchArt = Extract<AssetKey, `touch.${string}`>;

interface ButtonSpec {
  readonly actions: readonly Action[];
  readonly image: TouchArt;
  readonly art: Size;
  /** Its frames, when up and pressed, in its image. */
  readonly frames: readonly [up: number, pressed: number];
}

const BUTTONS: Readonly<Record<ButtonName, ButtonSpec>> = {
  a: { actions: ['confirm'], image: 'touch.buttons', art: TOUCH_ART.button, frames: [0, 1] },
  // As on a gamepad, B cancels, and held while walking switches between walking and running.
  b: { actions: ['cancel', 'run'], image: 'touch.buttons', art: TOUCH_ART.button, frames: [2, 3] },
  menu: { actions: ['menu'], image: 'touch.menu', art: TOUCH_ART.menu, frames: [0, 0] },
};

/** How many frames wide each image is. */
const FRAMES_ACROSS: Readonly<Partial<Record<TouchArt, number>>> = {
  'touch.dpad': 5,
  'touch.buttons': 4,
  'touch.menu': 1,
};

/** A small phone that turns sideways (see the hint's CSS), drawn in pixels. */
const PHONE_SVG = `
<svg class="rotate-hint-phone" viewBox="0 0 16 16" width="96" height="96" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="5" y="2" width="6" height="12" fill="#f2eaf1" />
  <rect x="6" y="1" width="4" height="14" fill="#f2eaf1" />
  <rect x="6" y="3" width="4" height="9" fill="#3d3450" />
  <rect x="7" y="13" width="2" height="1" fill="#3d3450" />
</svg>`;

interface Control {
  readonly element: HTMLDivElement;
  readonly art: HTMLDivElement;
}

/** A control: a touch area a little bigger than its art, which shows one frame of an image. */
function createControl(name: string, image: TouchArt, art: Size): Control {
  const element = document.createElement('div');
  element.className = 'touch-control';
  element.dataset.control = name;
  const artElement = document.createElement('div');
  artElement.className = 'touch-art';
  artElement.style.backgroundImage = `url("${ASSETS[image].url}")`;
  artElement.style.setProperty('--frame-width', String(art.width));
  artElement.style.setProperty('--frame-height', String(art.height));
  artElement.style.setProperty('--sheet-width', String(art.width * (FRAMES_ACROSS[image] ?? 1)));
  artElement.style.setProperty('--frame', '0');
  element.append(artElement);
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  return { element, art: artElement };
}

function place({ element, art }: Control, box: Box, scale: number): void {
  element.style.left = `${box.x - TOUCH_SLOP}px`;
  element.style.top = `${box.y - TOUCH_SLOP}px`;
  element.style.width = `${box.width + 2 * TOUCH_SLOP}px`;
  element.style.height = `${box.height + 2 * TOUCH_SLOP}px`;
  art.style.setProperty('--scale', String(scale));
}

/**
 * The on-screen d-pad, A, B and Menu, drawn by the page over the game in touch mode, and the hint
 * that covers the game while a phone is held upright. The game reads them through `collect`, once
 * a frame, along with the keyboard and gamepads.
 */
export class TouchControls {
  private container?: HTMLElement;
  private probe?: HTMLElement;
  private dpad?: Control;
  private readonly buttons = new Map<ButtonName, Control>();
  private direction: Direction | null = null;
  private dpadPointer: number | null = null;
  /** The pointers holding each button down. */
  private readonly pressedBy = new Map<ButtonName, Set<number>>();
  /** Presses since the last frame, kept even if already let go, so a quick tap still counts. */
  private readonly tapped = new Set<Action>();

  attach(container: HTMLElement): void {
    this.container = container;
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.setAttribute('aria-hidden', 'true');

    const dpad = createControl('dpad', 'touch.dpad', TOUCH_ART.dpad);
    this.dpad = dpad;
    this.listenToDpad(dpad);
    root.append(dpad.element);
    // B before A, so A wins where their edges overlap.
    for (const name of ['b', 'a', 'menu'] as const) {
      const spec = BUTTONS[name];
      const control = createControl(name, spec.image, spec.art);
      this.buttons.set(name, control);
      this.pressedBy.set(name, new Set());
      this.listenToButton(name, control);
      this.showButton(name);
      root.append(control.element);
    }
    container.append(root);

    this.probe = document.createElement('div');
    this.probe.className = 'safe-area-probe';
    document.body.append(this.probe);

    const hint = document.createElement('div');
    hint.id = 'rotate-hint';
    hint.innerHTML = PHONE_SVG;
    const text = document.createElement('p');
    text.textContent = UI_TEXT.turnSideways;
    hint.append(text);
    document.body.append(hint);

    if (prefersTouch()) this.enable();
    // A laptop with a touchscreen switches to touch mode the first time it's touched.
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch') this.enable();
      },
      { capture: true },
    );
    window.addEventListener('resize', () => {
      // Turned upright, the controls hide, and can't hear fingers lifting.
      if (window.matchMedia('(orientation: portrait)').matches) this.releaseAll();
    });
    // Whenever the game's space changes size, as the game itself refits (see main.ts).
    new ResizeObserver(() => this.layout()).observe(container);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  /**
   * Adds what's held to `held`: the d-pad's direction, the buttons, and any taps since last time,
   * which also go in `fresh`, as presses.
   */
  collect(held: Set<Action>, fresh: Set<Action>): void {
    if (this.direction) held.add(this.direction);
    for (const [name, pointers] of this.pressedBy) {
      if (pointers.size > 0) for (const action of BUTTONS[name].actions) held.add(action);
    }
    for (const action of this.tapped) {
      held.add(action);
      fresh.add(action);
    }
    this.tapped.clear();
  }

  private enable(): void {
    if (touchMode()) return;
    document.documentElement.classList.add('touch');
    this.layout();
  }

  private layout(): void {
    const { container, dpad } = this;
    if (!container || !dpad || !touchMode()) return;
    const view = { width: container.clientWidth, height: container.clientHeight };
    const layout = layoutTouchControls(view, this.insets());
    place(dpad, layout.dpad, layout.scale.dpad);
    for (const [name, control] of this.buttons) {
      place(control, layout[name], name === 'menu' ? layout.scale.menu : layout.scale.button);
    }
  }

  private insets(): Insets {
    if (!this.probe) return { top: 0, right: 0, bottom: 0, left: 0 };
    const style = getComputedStyle(this.probe);
    const px = (value: string): number => Number.parseFloat(value) || 0;
    return {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    };
  }

  /** The d-pad follows the thumb that pressed it until it lifts, even off the pad. */
  private listenToDpad({ element, art }: Control): void {
    const steer = (event: PointerEvent): void => {
      const rect = art.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      this.setDirection(dpadDirection(dx, dy, rect.width / 2, this.direction));
    };
    element.addEventListener('pointerdown', (event) => {
      if (this.dpadPointer !== null) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      this.dpadPointer = event.pointerId;
      steer(event);
    });
    element.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.dpadPointer) steer(event);
    });
    const lift = (event: PointerEvent): void => {
      if (event.pointerId !== this.dpadPointer) return;
      this.dpadPointer = null;
      this.setDirection(null);
    };
    element.addEventListener('pointerup', lift);
    element.addEventListener('pointercancel', lift);
    element.addEventListener('lostpointercapture', lift);
  }

  private setDirection(direction: Direction | null): void {
    if (direction === this.direction) return;
    this.direction = direction;
    if (direction) this.tapped.add(direction);
    this.dpad?.art.style.setProperty('--frame', String(DPAD_FRAMES[direction ?? 'idle']));
    this.dpad?.element.classList.toggle('pressed', direction !== null);
  }

  /** A button stays down until every finger on it lifts, even if they slide off. */
  private listenToButton(name: ButtonName, { element }: Control): void {
    const pointers = this.pressedBy.get(name);
    if (!pointers) return;
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      pointers.add(event.pointerId);
      for (const action of BUTTONS[name].actions) this.tapped.add(action);
      this.showButton(name);
    });
    const lift = (event: PointerEvent): void => {
      if (pointers.delete(event.pointerId)) this.showButton(name);
    };
    element.addEventListener('pointerup', lift);
    element.addEventListener('pointercancel', lift);
    element.addEventListener('lostpointercapture', lift);
  }

  private showButton(name: ButtonName): void {
    const control = this.buttons.get(name);
    const down = (this.pressedBy.get(name)?.size ?? 0) > 0;
    if (!control) return;
    const [up, pressed] = BUTTONS[name].frames;
    control.art.style.setProperty('--frame', String(down ? pressed : up));
    control.element.classList.toggle('pressed', down);
  }

  /** Lets go of everything, for when the controls might stop hearing about fingers lifting. */
  private releaseAll(): void {
    this.dpadPointer = null;
    this.setDirection(null);
    for (const [name, pointers] of this.pressedBy) {
      pointers.clear();
      this.showButton(name);
    }
  }
}
