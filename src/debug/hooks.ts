import type Phaser from 'phaser';
import { MAPS } from '../data/maps';
import type { FieldStart } from '../scenes/field';
import { debugSwitches } from '../systems/debug-switches';
import { input } from '../systems/input/game-input';
import type { DebugApi } from './api';
import { AssetGalleryScene } from './asset-gallery';
import { installDebugMenu } from './debug-menu-scene';

interface Inspectable {
  debugInfo(): Record<string, unknown>;
}

const isInspectable = (scene: object): scene is Inspectable =>
  typeof (scene as Partial<Inspectable>).debugInfo === 'function';

export function installDebugHooks(game: Phaser.Game): void {
  // Debug-only scenes, which production builds never include.
  game.scene.add('asset-gallery', AssetGalleryScene);

  const startScene: DebugApi['startScene'] = (key, data) => {
    // Paused and sleeping scenes too: the debug menu pauses whatever it opens over.
    for (const scene of game.scene.getScenes(false)) {
      const { sys } = scene;
      if (sys.isActive() || sys.isPaused() || sys.isSleeping()) game.scene.stop(scene.scene.key);
    }
    game.scene.start(key, data);
  };

  // Added last, so it draws over everything.
  installDebugMenu(game, {
    maps: MAPS,
    switches: debugSwitches,
    warp: (map, spawn) => startScene('field', { map, spawn } satisfies FieldStart),
  });

  const api: DebugApi = {
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    startScene,
    inspect: (sceneKey) => {
      const scene = game.scene.getScenes(false).find((s) => s.scene.key === sceneKey);
      return scene && isInspectable(scene) ? scene.debugInfo() : undefined;
    },
    warp: (map, x, y, facing) => startScene('field', { map, x, y, facing } satisfies FieldStart),
    held: () => input.heldActions(),
    noclip: (on) => {
      debugSwitches.noclip = on;
    },
    showCollision: (on) => {
      debugSwitches.showCollision = on;
    },
  };
  window.__game = api;
}
