import Phaser from 'phaser';
import { ActionState } from './action-state';
import { ACTIONS, BOUND_KEYS, KEYBOARD, gamepadActions, type Action } from './actions';

/**
 * The game's one input source. It reads the keyboard, gamepads and (until M1's touch controls)
 * a tap on the game as Confirm, and updates once per frame before any scene runs.
 */
class GameInput {
  private readonly state = new ActionState();
  private readonly keysDown = new Set<string>();
  // Presses since the last frame, kept even if already released, so a tap shorter than a frame still counts.
  private readonly keysTapped = new Set<string>();
  private pointerDown = false;
  private pointerTapped = false;

  attach(game: Phaser.Game): void {
    window.addEventListener('keydown', (event) => {
      if (!BOUND_KEYS.has(event.code)) return;
      event.preventDefault();
      this.keysDown.add(event.code);
      this.keysTapped.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.code));
    // Keys released while the window is in the background never send keyup.
    window.addEventListener('blur', () => this.keysDown.clear());

    game.events.once(Phaser.Core.Events.READY, () => {
      game.canvas.addEventListener('pointerdown', () => {
        this.pointerDown = true;
        this.pointerTapped = true;
      });
    });
    window.addEventListener('pointerup', () => (this.pointerDown = false));
    window.addEventListener('pointercancel', () => (this.pointerDown = false));

    game.events.on(Phaser.Core.Events.PRE_STEP, (time: number) => {
      this.state.update(this.collectHeld(), time);
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

  private collectHeld(): Set<Action> {
    const held = gamepadActions(navigator.getGamepads());
    for (const action of ACTIONS) {
      const codes = KEYBOARD[action];
      if (codes.some((code) => this.keysDown.has(code) || this.keysTapped.has(code))) {
        held.add(action);
      }
    }
    if (this.pointerDown || this.pointerTapped) held.add('confirm');
    this.keysTapped.clear();
    this.pointerTapped = false;
    return held;
  }
}

export const input = new GameInput();
