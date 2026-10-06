import type Phaser from 'phaser';
import { ENCOUNTER_RATES } from '../core/encounters';
import { memberVitals, recruit } from '../core/party';
import { addGold, addItem, inParty, setFlag, setLevel, setVitals } from '../core/state';
import { BACKDROPS } from '../data/backdrops';
import { AREAS, EXP_CURVE } from '../data/balance';
import { CHARACTERS } from '../data/characters';
import { DB } from '../data/db';
import { ENCOUNTERS } from '../data/encounters';
import { ENEMIES } from '../data/enemies';
import { MAPS } from '../data/maps';
import { BATTLE_SCENE, type BattleStart } from '../scenes/battle';
import type { FieldScene, FieldStart } from '../scenes/field';
import { ASSETS } from '../systems/asset-manifest';
import { audio } from '../systems/audio';
import { debugSwitches } from '../systems/debug-switches';
import { encounters, reseedEncounters } from '../systems/encounters';
import { input } from '../systems/input/game-input';
import { saveSlots } from '../systems/saves';
import { session } from '../systems/session';
import { settings } from '../systems/settings';
import type { DebugApi, DebugBattleOptions } from './api';
import { AssetGalleryScene } from './asset-gallery';
import { installDebugMenu } from './debug-menu-scene';
import { debugBattles, putOn, type DebugBattlePlan } from './debug-pages';
import { debugSaves } from './debug-saves';

interface Inspectable {
  debugInfo(): Record<string, unknown>;
}

const isInspectable = (scene: object): scene is Inspectable =>
  typeof (scene as Partial<Inspectable>).debugInfo === 'function';

export function installDebugHooks(game: Phaser.Game): void {
  // A build with these in it says so in the browser's tab.
  document.title = `${document.title} (debug build)`;
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

  // A battle over nothing, which goes to the field where the player is once it's won or fled, and
  // to the Game Over screen if it's lost.
  const battle: DebugApi['battle'] = (enemies, options: DebugBattleOptions = {}) => {
    const unknown = enemies.find((id) => !Object.hasOwn(ENEMIES, id));
    if (unknown !== undefined) throw new Error(`There's no enemy called ${unknown}`);
    const { backdrop = 'meadow', seed = Date.now(), start } = options;
    if (!Object.hasOwn(BACKDROPS, backdrop)) throw new Error(`There's no backdrop ${backdrop}`);
    startScene(BATTLE_SCENE, {
      setup: start === undefined ? { enemies } : { enemies, start },
      backdrop,
      seed,
      onEnd: () => startScene('field', session.state.location satisfies FieldStart),
    } satisfies BattleStart);
  };

  // The battle the debug menu's Build a battle puts together, kept until the page is reloaded.
  const plan: DebugBattlePlan = { enemies: [], backdrop: 'meadow', start: null };

  // Added last, so it draws over everything.
  installDebugMenu(game, {
    maps: MAPS,
    switches: debugSwitches,
    settings,
    game: {
      get: () => session.state,
      set: (state) => {
        session.state = state;
      },
    },
    db: DB,
    curve: EXP_CURVE,
    warp: (map, spawn) => startScene('field', { map, spawn } satisfies FieldStart),
    battles: debugBattles({
      enemies: ENEMIES,
      encounters: ENCOUNTERS,
      bosses: Object.values(AREAS).map((area) => ({
        enemies: area.boss,
        table: area.encounters,
      })),
      // Until the caves have a backdrop of their own, their battles are on the beach.
      backdrop: (table) => (table === 'tide-caves' ? 'shore' : 'meadow'),
    }),
    plan,
    backdrops: Object.keys(BACKDROPS),
    battle: ({ enemies, backdrop, start }) =>
      battle(enemies, start === undefined ? { backdrop } : { backdrop, start }),
    // Only those with a sprite to fight as, until everyone has one.
    recruits: () =>
      Object.entries(CHARACTERS)
        .filter(([id]) => Object.hasOwn(ASSETS, `sprite.${id}`))
        .map(([id, { name }]) => ({ id, name, joined: inParty(session.state, id) })),
    join: (id) => {
      session.state = recruit(session.state, id, DB);
    },
    saves: debugSaves(saveSlots),
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
    state: () => session.state,
    setFlag: (flag, on) => {
      session.state = setFlag(session.state, flag, on);
    },
    give: (item, count) => {
      session.state = addItem(session.state, item, count);
    },
    giveGold: (amount) => {
      session.state = addGold(session.state, amount);
    },
    join: (character) => {
      session.state = recruit(session.state, character, DB);
    },
    setLevel: (level, character) => {
      for (const id of character === undefined ? session.state.party : [character]) {
        session.state = setLevel(session.state, id, level, EXP_CURVE);
      }
    },
    equip: (character, item) => {
      session.state = putOn(session.state, character, item, DB);
    },
    vitals: (character, set = {}) => {
      const { now, most } = memberVitals(session.state, character, DB);
      session.state = setVitals(session.state, character, { ...now, ...set }, most);
      return memberVitals(session.state, character, DB);
    },
    run: (script) => {
      if (!game.scene.isActive('field')) throw new Error(`Can't run ${script}: the field isn't up`);
      (game.scene.getScene('field') as FieldScene).runScript(script);
    },
    audio: () => audio.debugInfo(),
    battle,
    battleSpeed: (speed) => {
      if (!(speed > 0)) throw new RangeError(`${speed} isn't a battle speed`);
      settings.battleSpeed = speed;
    },
    encounters: ({ rate, countdown, seed } = {}) => {
      if (rate !== undefined && !ENCOUNTER_RATES.includes(rate)) {
        throw new RangeError(`${String(rate)} isn't an encounter rate`);
      }
      if (countdown !== undefined && !(countdown >= 0)) {
        throw new RangeError(`${countdown} isn't a countdown`);
      }
      if (seed !== undefined) reseedEncounters(seed);
      if (rate !== undefined) settings.encounterRate = rate;
      if (countdown !== undefined) encounters.countdown = countdown;
      return { rate: settings.encounterRate, countdown: encounters.countdown };
    },
  };
  window.__game = api;
}
