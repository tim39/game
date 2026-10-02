import type Phaser from 'phaser';
import type { DebugApi } from './api';

export function installDebugHooks(game: Phaser.Game): void {
  const api: DebugApi = {
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    startScene: (key, data) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
      game.scene.start(key, data);
    },
  };
  window.__game = api;
}
