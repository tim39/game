import Phaser from 'phaser';

/**
 * How the field gives way to a random battle: a soft white flash (left out with Reduce flashing),
 * then bands of black sweeping in across the screen from either side in turn, each a little after
 * the one above.
 */
const TRANSITION = { flashMs: 140, sweepMs: 380, staggerMs: 22, bands: 10, flash: 0.6 } as const;

/**
 * Plays the transition into a battle over what a scene's camera shows, and resolves once the
 * screen is black, with the curtain that covers it: the scene takes it away once the battle is
 * over. Drawn in the world, over the camera's view, so the camera mustn't move meanwhile. Without
 * `flashing`, the bands sweep in without the white flash first.
 */
export function playBattleTransition(
  scene: Phaser.Scene,
  depth: number,
  flashing = true,
): Promise<Phaser.GameObjects.Graphics> {
  const { flashMs, sweepMs, staggerMs, bands, flash } = TRANSITION;
  // A pixel past the view all round, so nothing shows at its edges.
  const view = scene.cameras.main.worldView;
  const left = Math.floor(view.x) - 1;
  const top = Math.floor(view.y) - 1;
  const width = Math.ceil(view.width) + 2;
  const height = Math.ceil(view.height) + 2;
  const band = Math.ceil(height / bands);

  if (flashing) {
    const white = scene.add
      .rectangle(left, top, width, height, 0xffffff)
      .setOrigin(0)
      .setDepth(depth)
      .setAlpha(0);
    scene.tweens.add({
      targets: white,
      alpha: flash,
      duration: flashMs / 2,
      yoyo: true,
      onComplete: () => white.destroy(),
    });
  }

  const curtain = scene.add.graphics().setDepth(depth);
  const total = sweepMs + staggerMs * (bands - 1);
  const draw = (elapsed: number): void => {
    curtain.clear().fillStyle(0x000000);
    for (let index = 0; index < bands; index++) {
      const progress = Phaser.Math.Clamp((elapsed - index * staggerMs) / sweepMs, 0, 1);
      const reach = Math.round(width * Phaser.Math.Easing.Quadratic.In(progress));
      // Bands come in from the left and the right by turns.
      const x = index % 2 === 0 ? left : left + width - reach;
      curtain.fillRect(x, top + index * band, reach, band);
    }
  };
  return new Promise((resolve) => {
    scene.tweens.addCounter({
      from: 0,
      to: total,
      duration: total,
      delay: flashMs / 2,
      onUpdate: (tween) => draw(tween.getValue() ?? 0),
      onComplete: () => {
        draw(total);
        resolve(curtain);
      },
    });
  });
}
