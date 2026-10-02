import type Phaser from 'phaser';
import type { FieldStart } from '../scenes/field';
import type { DebugApi } from './api';
import { AssetGalleryScene } from './asset-gallery';

interface Inspectable {
  debugInfo(): Record<string, unknown>;
}

const isInspectable = (scene: object): scene is Inspectable =>
  typeof (scene as Partial<Inspectable>).debugInfo === 'function';

export function installDebugHooks(game: Phaser.Game): void {
  // Debug-only scenes, which production builds never include.
  game.scene.add('asset-gallery', AssetGalleryScene);

  const startScene: DebugApi['startScene'] = (key, data) => {
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    game.scene.start(key, data);
  };

  const api: DebugApi = {
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    startScene,
    inspect: (sceneKey) => {
      const scene = game.scene.getScenes(false).find((s) => s.scene.key === sceneKey);
      return scene && isInspectable(scene) ? scene.debugInfo() : undefined;
    },
    warp: (map, x, y, facing) => startScene('field', { map, x, y, facing } satisfies FieldStart),
  };
  window.__game = api;
}
