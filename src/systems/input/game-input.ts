import Phaser from 'phaser';
import { ActionState } from './action-state';
import { ACTIONS, BOUND_KEYS, KEYBOARD, gamepadActions, type Action } from './actions';
import { TouchControls } from './touch-controls';

/**
 * The game's one input source. It reads the keyboard, gamepads and the touch controls, and updates
 * once per frame before any scene runs.
 */
class GameInput {
  private readonly state = new ActionState();
  private readonly keysDown = new Set<string>();
  // Presses since the last frame, kept even if already released, so a tap shorter than a frame
  // still counts, and so does a second tap. The keyboard's own repeats while a key is held aren't.
  private readonly keysTapped = new Set<string>();
  private readonly touch = new TouchControls();

  /** Starts listening. The touch controls go in `container`, over the game. */
  attach(game: Phaser.Game, container: HTMLElement): void {
    window.addEventListener('keydown', (event) => {
      if (!BOUND_KEYS.has(event.code)) return;
      event.preventDefault();
      this.keysDown.add(event.code);
      if (!event.repeat) this.keysTapped.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.code));
    // Keys released while the window is in the background never send keyup.
    window.addEventListener('blur', () => this.keysDown.clear());
    this.touch.attach(container);

    game.events.on(Phaser.Core.Events.PRE_STEP, (time: number) => {
      const { held, fresh } = this.collect();
      this.state.update(held, time, fresh);
    });
  }

  held(action: Action): boolean {
    return this.state.held(action);
  }

  pressed(action: Action): boolean {
    return this.state.pressed(action);
  }

  pressedOrRepeated(action: Action): boolean {
    return this.state.pressedOrRepeated(action);
  }

  /** Every action held this frame, from any device. */
  heldActions(): Action[] {
    return ACTIONS.filter((action) => this.state.held(action));
  }

  /** What's held this frame, from every device, and what was pressed since the last one. */
  private collect(): { held: Set<Action>; fresh: Set<Action> } {
    const held = gamepadActions(navigator.getGamepads());
    const fresh = new Set<Action>();
    for (const action of ACTIONS) {
      const codes = KEYBOARD[action];
      if (codes.some((code) => this.keysDown.has(code))) held.add(action);
      if (codes.some((code) => this.keysTapped.has(code))) {
        held.add(action);
        fresh.add(action);
      }
    }
    this.keysTapped.clear();
    this.touch.collect(held, fresh);
    return { held, fresh };
  }
}

export const input = new GameInput();
