import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { PreloadScene } from './scenes/preload';
import { TitleScene } from './scenes/title';
import { GAME_HEIGHT, GAME_WIDTH, pickZoom } from './systems/display';

const container = document.getElementById('game');
if (!container) throw new Error('index.html needs a <div id="game">');
const zoomForContainer = (): number => pickZoom(container.clientWidth, container.clientHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: container,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#14101c',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: zoomForContainer(),
  },
  scene: [BootScene, PreloadScene, TitleScene],
});

window.addEventListener('resize', () => game.scale.setZoom(zoomForContainer()));

// Vite replaces these with constants, so production builds drop the debug code entirely.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  void import('./debug/hooks').then(({ installDebugHooks }) => installDebugHooks(game));
}
