import type Phaser from 'phaser';
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

  const api: DebugApi = {
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    startScene: (key, data) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
      game.scene.start(key, data);
    },
    inspect: (sceneKey) => {
      const scene = game.scene.getScenes(false).find((s) => s.scene.key === sceneKey);
      return scene && isInspectable(scene) ? scene.debugInfo() : undefined;
    },
  };
  window.__game = api;
}
