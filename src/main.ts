import Phaser from 'phaser';
import { BattleScene } from './scenes/battle';
import { BootScene } from './scenes/boot';
import { DialogueScene } from './scenes/dialogue';
import { FieldScene } from './scenes/field';
import { GameOverScene } from './scenes/game-over';
import { MainMenuScene } from './scenes/main-menu';
import { OptionsScene } from './scenes/options';
import { PreloadScene } from './scenes/preload';
import { SaveMenuScene } from './scenes/save-menu';
import { ShopScene } from './scenes/shop';
import { TitleScene } from './scenes/title';
import { audio } from './systems/audio';
import { preventBrowserGestures } from './systems/browser-gestures';
import { GAME_HEIGHT, GAME_WIDTH, pickZoom } from './systems/display';
import { input } from './systems/input/game-input';
import { prefersTouch } from './systems/input/touch-controls';
import { DEFAULT_SETTINGS, browserStorage, loadSettings } from './systems/settings';

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
  // Later scenes draw over earlier ones: a battle over the field, the dialogue box over either,
  // the main menu and shops over the field, the save menu over the main menu, the title screen or
  // the Game Over screen, and the Options screen over the title screen or the main menu.
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    FieldScene,
    BattleScene,
    GameOverScene,
    DialogueScene,
    MainMenuScene,
    ShopScene,
    SaveMenuScene,
    OptionsScene,
  ],
});

// Refit whenever the game's space changes size: the window resizing, a phone turning, or browser
// toolbars coming and going, which don't always come with a window resize event.
new ResizeObserver(() => game.scale.setZoom(zoomForContainer())).observe(container);
preventBrowserGestures();
input.attach(game, container);
audio.install(game);
// The player's settings, as they left them. Until they've set any, phones and tablets, which have no
// Run button to hold, run unless B is held (Controls in DESIGN.md).
loadSettings(browserStorage(), { ...DEFAULT_SETTINGS, alwaysRun: prefersTouch() });

// Vite replaces these with constants, so production builds drop the debug code entirely.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  void import('./debug/hooks').then(({ installDebugHooks }) => installDebugHooks(game));
}
