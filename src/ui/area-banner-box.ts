import Phaser from 'phaser';
import { AREA_BANNER, AREA_BANNER_SCALE, areaBannerOnScreen, bannerAlpha } from './area-banner';
import { FONT, textMeasurer } from './fonts';

/** The name in ink, as on the menus' cream panels. */
const INK = 0x0b001e;

/** The area banner on screen. */
export interface AreaBannerBox {
  /** The area it names. */
  readonly name: string;
  /** Whether it's still there: not once it has faded out, or been taken away. */
  readonly showing: boolean;
  /** Takes it away at once. */
  destroy(): void;
}

/**
 * Shows the area banner (see src/ui/area-banner.ts) over a scene, fixed to the screen however its
 * camera scrolls or zooms, as the field's follows the player at 2×. It fades in, stays and fades
 * out over `timing`, then takes itself away. The camera's own fades cover it with the rest of the
 * scene, and it pauses with the scene.
 */
export function showAreaBanner(
  scene: Phaser.Scene,
  name: string,
  depth: number,
  timing: { readonly fadeIn: number; readonly hold: number; readonly fadeOut: number },
): AreaBannerBox {
  const camera = scene.cameras.main;
  // Fixed to the screen, something is drawn as if the camera hadn't scrolled, but still zoomed
  // about the middle of the screen: so a game pixel is 1 / zoom across, from this corner.
  const { zoom } = camera;
  const corner = {
    x: (camera.width / 2) * (1 - 1 / zoom),
    y: (camera.height / 2) * (1 - 1 / zoom),
  };
  const scale = AREA_BANNER_SCALE / zoom;
  const { frame, inset } = AREA_BANNER;
  const box = areaBannerOnScreen(textMeasurer(scene, FONT.display)(name));
  const x = corner.x + box.x / zoom;
  const y = corner.y + box.y / zoom;
  const panel = scene.add.nineslice(
    x,
    y,
    'ui.choice-box',
    undefined,
    box.width / AREA_BANNER_SCALE,
    box.height / AREA_BANNER_SCALE,
    frame,
    frame,
    frame,
    frame,
  );
  const text = scene.add
    .bitmapText(x + (frame + inset.x) * scale, y + (frame + inset.y) * scale, FONT.display, name)
    .setTint(INK);
  const parts = [panel, text];
  for (const part of parts) {
    part.setOrigin(0).setScale(scale).setScrollFactor(0).setDepth(depth).setAlpha(0);
  }

  let showing = true;
  const takeAway = (): void => {
    showing = false;
    for (const part of parts) part.destroy();
  };
  const total = timing.fadeIn + timing.hold + timing.fadeOut;
  const fade = scene.tweens.addCounter({
    from: 0,
    to: total,
    duration: total,
    onUpdate: (tween) => {
      const alpha = bannerAlpha(tween.getValue() ?? 0, timing);
      for (const part of parts) part.setAlpha(alpha);
    },
    onComplete: takeAway,
  });
  return {
    name,
    get showing() {
      return showing;
    },
    destroy: () => {
      if (!showing) return;
      fade.remove();
      takeAway();
    },
  };
}
