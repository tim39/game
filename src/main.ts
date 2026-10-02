import Phaser from 'phaser';
import { BootScene } from './scenes/boot';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 360,
  backgroundColor: '#14101c',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});

// Vite replaces these with constants, so production builds drop the debug code entirely.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  void import('./debug/hooks').then(({ installDebugHooks }) => installDebugHooks(game));
}
