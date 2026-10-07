import Phaser from 'phaser';
import { compilePicture } from '../core/map/backdrop';
import type { PictureDef } from '../core/schema';
import { LIGHTS } from '../data/balance';
import { PICTURES } from '../data/pictures';
import { MAP_CONTENT } from '../data/terrain';
import { DEPTH, TILE, createTilemap, driftMist, mistMap, shadeMap } from '../systems/tilemap';

/** A picture on screen (see src/data/pictures.ts), with its mist drifting and its lights alive. */
export interface DrawnPicture {
  readonly id: string;
  /** Moves its mist and its lights on by `dt` milliseconds. */
  update(dt: number): void;
  destroy(): void;
}

type Light = NonNullable<PictureDef['lights']>[number];

/** How a glow fades from its middle out: within each fraction of its radius, this bright. */
const GLOW_RINGS: readonly (readonly [within: number, alpha: number])[] = [
  [0.25, 0.5],
  [0.5, 0.28],
  [0.75, 0.14],
  [1, 0.06],
];

/** A beam is brightest at the light, and fades away along its length in this many steps. */
const BEAM_STEPS = 4;

/**
 * Draws a picture from the top left of the world, as a battle draws its backdrop, for a camera
 * zoomed 2× to fill the screen with: its tiles, its shade, the Gloam's mist if it has it, and its
 * lights over everything, glowing as they're added to what's under them.
 */
export function drawPicture(scene: Phaser.Scene, id: string): DrawnPicture {
  const picture = Object.hasOwn(PICTURES, id) ? PICTURES[id] : undefined;
  if (!picture) throw new Error(`There's no picture called ${id}`);
  const map = compilePicture(id, picture, MAP_CONTENT);
  const layers = Object.values(createTilemap(scene, map));
  const shade =
    picture.shade === undefined ? undefined : shadeMap(scene, map, picture.shade, DEPTH.shade);
  const mist = picture.mist ? mistMap(scene, map, DEPTH.mist) : undefined;
  const lights = (picture.lights ?? []).map((light, index) => drawLight(scene, light, index));
  let elapsed = 0;
  const update = (dt: number): void => {
    elapsed += dt;
    if (mist) driftMist(mist, dt);
    for (const light of lights) light.update(elapsed);
  };
  update(0);
  return {
    id,
    update,
    destroy: () => {
      layers[0]?.tilemap.destroy();
      for (const layer of layers) layer.destroy();
      shade?.destroy();
      mist?.destroy();
      for (const light of lights) light.destroy();
    },
  };
}

/** A light: its glow, and its beam if it has one, which `update` brings to `elapsed` ms on. */
function drawLight(
  scene: Phaser.Scene,
  light: Light,
  index: number,
): { update(elapsed: number): void; destroy(): void } {
  const [col, row] = light.at;
  const x = col * TILE + TILE / 2;
  const y = row * TILE + TILE / 2;
  const glow = addGlow(scene, x, y, Math.round(light.radius * TILE), light.color, DEPTH.light);
  const beam = light.beam
    ? scene.add
        .image(x, y, beamTexture(scene))
        .setOrigin(0, 0.5)
        .setTint(light.color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.light)
    : undefined;
  // Each light pulses a little out of step with the one before it.
  const phase = index * 0.37;
  return {
    update: (elapsed) => {
      const pulse = Math.sin((elapsed / LIGHTS.pulseMs + phase) * 2 * Math.PI);
      glow.setAlpha(1 - LIGHTS.pulse + LIGHTS.pulse * pulse);
      beam?.setRotation((elapsed / LIGHTS.beam.turnMs) * 2 * Math.PI);
    },
    destroy: () => {
      glow.destroy();
      beam?.destroy();
    },
  };
}

/**
 * A glow of `color` round (x, y), `radius` pixels from its middle to its edge, added to what's
 * under it at `depth`, as a picture's lights glow.
 */
export function addGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  depth: number,
): Phaser.GameObjects.Image {
  return scene.add
    .image(x, y, glowTexture(scene, radius))
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth);
}

/**
 * A round glow in white, to be tinted: `radius` pixels from its middle to its edge, in rings that
 * fade outwards, so it reads as pixel art at the world's scale. Made once, and kept.
 */
function glowTexture(scene: Phaser.Scene, radius: number): string {
  const key = `picture.glow-${radius}`;
  if (scene.textures.exists(key)) return key;
  const size = radius * 2;
  return paintTexture(scene, key, size, size, (x, y) => {
    const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
    return GLOW_RINGS.find(([within]) => distance < within)?.[1] ?? 0;
  });
}

/**
 * A lighthouse's beam in white, to be tinted: a long thin wedge from its left middle, `spread`
 * degrees across, fading in steps along its length. Made once, and kept.
 */
function beamTexture(scene: Phaser.Scene): string {
  const key = 'picture.beam';
  if (scene.textures.exists(key)) return key;
  const { length: cells, spread, alpha } = LIGHTS.beam;
  const length = cells * TILE;
  const slope = Math.tan(((spread / 2) * Math.PI) / 180);
  const half = Math.ceil(length * slope);
  return paintTexture(scene, key, length, half * 2, (x, y) => {
    if (Math.abs(y + 0.5 - half) > (x + 0.5) * slope) return 0;
    return (alpha * Math.ceil((1 - x / length) * BEAM_STEPS)) / BEAM_STEPS;
  });
}

/** Makes a white texture `width`×`height` pixels, each as opaque as `alphaAt` says. */
function paintTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): string {
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Couldn't make the texture ${key}`);
  const image = texture.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      image.data.fill(255, at, at + 3);
      image.data[at + 3] = Math.round(alphaAt(x, y) * 255);
    }
  }
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}
