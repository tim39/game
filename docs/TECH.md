# Tech

Architecture and tooling. Until the code exists, this is the plan; once it does, keep this doc in step with it.

## Stack

| | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict` | Pinned to 6.0.x: TS 7 is out, but typescript-eslint only supports up to 6.0 |
| Engine | Phaser 4 (4.2.x) | Tilemaps, cameras, tweens, particles, input, audio, scenes |
| Build | Vite 8 | Dev server and static build |
| Unit tests | Vitest 5 | Runs `src/core` and the data checks in Node |
| Data validation | Zod 4 | A schema for every kind of content |
| End-to-end tests | Playwright 1.56.1 (pinned) | Drives the real game in Chromium and takes screenshots. Pinned because it uses Chromium build 1194, the one preinstalled in cloud sessions; bump the two together |
| Lint and format | ESLint 10 + typescript-eslint, Prettier | |
| Scripts | tsx | Runs the TypeScript tools (`fetch-assets`, `validate`, `sim`) |
| Hosting | GitHub Pages via GitHub Actions | Every push to `main` deploys to https://tim39.github.io/game/ |

Versions were checked in October 2026. M0 installs the latest compatible ones.

## Layout

```
.
├── CLAUDE.md  README.md  CREDITS.md
├── docs/                 DESIGN, STORY, TECH, ROADMAP
├── assets-src/           raw asset packs fetched from GitHub Releases (gitignored)
├── public/assets/        the curated files the game loads (shipped as-is)
├── src/
│   ├── main.ts           Phaser config, scene list, boot
│   ├── core/             pure game rules: no Phaser, no DOM
│   │   ├── battle/       CTB engine, damage, statuses, enemy AI
│   │   ├── map/          map format, autotiler, compiler, collision
│   │   ├── walker.ts     grid movement
│   │   ├── npc.ts        how NPCs stand, wander and look at the player
│   │   ├── ids.ts        what IDs and flag names look like
│   │   ├── state.ts      GameState and the operations on it
│   │   ├── save.ts       serialization, versions, migrations
│   │   ├── events.ts     EventContext types for scripts
│   │   ├── schema.ts     Zod schemas and the types derived from them
│   │   └── rng.ts        seeded RNG
│   ├── data/             content: characters, skills, items, enemies, encounters,
│   │                     shops, balance.ts, terrain.ts, maps/, events/, speakers.ts
│   ├── systems/          Phaser-side services: the game being played (session), input (keys,
│   │                     gamepads, touch controls), settings, debug switches, audio, storage,
│   │                     assets, event runner
│   ├── scenes/           boot, preload, title, field, battle, menu, dialogue, shop, game-over
│   ├── ui/               the UI kit
│   └── debug/            debug menu and window.__game (dev and test builds only)
├── tools/                fetch-assets.ts, validate.ts, sim.ts and other scripts
├── tests/e2e/            Playwright specs
└── .github/workflows/    ci.yml (checks, then deploy)
```

## Dependency rules

- `core` imports nothing from the rest of `src`, and never `phaser`. Content is passed in (a `GameDb` object), so tests can use small fixtures.
- `data` imports only from `core` (schemas, `define*` helpers, types).
- `systems`, `scenes` and `ui` may import `core`, `data` and each other.
- Only `main.ts` imports `debug`, and only in dev and test builds.

`eslint.config.js` enforces the first two with `no-restricted-imports`, and also bans `Math.random`, `Date.now` and browser globals (`window`, `document`, `localStorage`, `performance`) inside `src/core`.

TypeScript is split in two: `tsconfig.app.json` covers `src/` (browser code, DOM types), and `tsconfig.node.json` covers the config files, `tests/` and `tools/` (Node types). `tsconfig.json` only references the two, which is what editors and ESLint pick up.

## Rendering

- Canvas **640×360** with `pixelArt: true` and `roundPixels: true`.
- The world camera uses zoom 2, so the world is effectively 320×180 pixels: 20×11 tiles of 16 px.
- **The UI is drawn at world scale too (2×)**, because the pack's UI art is (the dialogue box is 300×58). Decided in M0 from screenshots: text is clearly readable on a phone held sideways. Held upright, the whole 640×360 game shrinks to about 0.6× and nothing is comfortable, so M1 asks players to turn the phone.
- **Fonts** (`src/ui/fonts.ts`): two pixel fonts from the pack, registered as RetroFonts. `FONT.body` is the 8×8 sheet, drawn at 2×, for text, menus and dialogue. `FONT.display` is the 24×30 sheet shrunk back to its native 8×10 grid, drawn at 4×, for titles. Both are recolored white and tinted per use. RetroFont spaces glyphs in fixed cells, so at load time `measureGlyphColumns()` measures each glyph's real width and the font becomes proportional (1 px between letters, 4 px spaces).
- **Text layout:** `textMeasurer(scene, font)` gives a string's width in font pixels, and `wrapText(text, maxWidth, widthOf)` wraps by width. The dialogue box's measured layout lives in `src/ui/dialogue-layout.ts`: 3 lines of up to 236 px with a portrait (about 48 characters) or 280 px without (about 56).
- Scaling uses whole-number multiples of 640×360 where the window allows (720p, 1080p, 1440p and 4K are all exact), letterboxed. Smaller screens such as phones fall back to fit-to-screen. `pickZoom()` in `src/systems/display.ts` decides, and `main.ts` applies it with `game.scale.setZoom()` whenever the game's container changes size. A `ResizeObserver` watches it, because on phones browser toolbars coming and going can change it without a window resize event. `tests/e2e/scaling.spec.ts` checks five screen sizes, and a refit with no window resize.
- **The page never zooms**, and the browser's other touch gestures (the magnifying glass and text selection on a long press, scrolling) stay out of the game, which handles every touch itself and fits the screen; a zoomed page only crops it. The viewport tag (`maximum-scale=1, user-scalable=no`) and `touch-action: none` on the page are meant to stop them, and do in most browsers, but iOS Safari still zoomed while the touch controls were used. Phaser cancels the default handling of touches on its canvas, and the controls are page elements over it, so `preventBrowserGestures()` (`src/systems/browser-gestures.ts`) cancels it for every touch on the page (non-passive `touchstart`, `touchmove` and `touchend` listeners), and for Safari's own `gesturestart` and `gesturechange`. The touch controls run on pointer events, which come before touch events and don't depend on them, so they still see every touch. Touches no longer make `click` events, though: listen for pointer, touch or key events instead.

## Scenes

```
Boot → Preload → Title ──▶ Field ◀──▶ Battle ──▶ GameOver
                              │
                              ├── Dialogue  (overlay)
                              ├── Menu      (overlay)
                              └── Shop      (overlay)
```

- **Field** owns the current map, the actors and the event runner. Until the real opening exists, New Game starts a fresh game state, shows the M0 dialogue preview and then puts the player where the state says: in Saltmere, at Tamsin's door (`NEW_GAME` in `src/data/new-game.ts`). It starts at a cell or at one of a map's spawns (`FieldStart`).
- **Going between maps:** when a step heads into a way out (a doorway, a warp or an edge exit), the controls stop and the camera fades to black while the step finishes; then the field scene restarts on the target map at its spawn, and fades back in. Both fades take `MAP_FADE_MS` (250 ms, in `balance.ts`). The fade out is forced, so a way out taken while the fade in is still running can't get stuck. The walker always stops on an exit cell, so it can't walk through one in a long frame.
- **Grid movement** is `updateWalker` in `src/core/walker.ts`, pure and unit-tested. A step claims its cell as it starts, so nothing else can move in, then slides there; it always finishes. Holding a direction chains steps with the leftover time carried over, so walking never stutters, and a tap during a step is buffered for when it ends. A direction towards a blocked cell turns the player without moving them. Speeds are `FIELD_SPEEDS` in `src/data/balance.ts`. The scene caps a frame at 100 ms so the player can't jump after the tab was hidden.
- **NPCs** come from a map's `npc` objects and move by the rules in `src/core/npc.ts`, on the same walker as the player, with `NPC_TUNING` from `balance.ts`. Without `wander` they stand still; with it, they wait a random 1.5–4 s, then step a random way if the cell is free and within `wander` cells of home, or else just turn to look. Their randomness comes from an `Rng` seeded with `field:<map id>` each time the map loads. A walker takes up its cell, and mid-step the cell it's leaving too, so nobody overlaps: the player can't walk into an NPC, and NPCs keep out of walls, ways out, the player and each other. Walking into an NPC makes them turn and look at the player for `lookMs` (3 s); one that stands still then turns back the way it was placed. Characters are sorted by height on screen, so a lower one is drawn in front, still under the overhead layer.
- **Talking and examining:** Confirm, pressed while standing still, looks at the cell the player faces. An NPC there turns to look at the player (as when bumped) and runs their `script`, if they have one; one partway through a step is ignored. Otherwise the map's script for that cell runs, if any: a prefab's `script` covers its cells under characters. While a script runs (`running` in the field's debug info) the player can't move and NPCs stand still, with their look timers paused, so a conversation never ends with someone walking off.
- **The dialogue box** is an overlay scene, `DialogueScene` (`src/scenes/dialogue.ts`), registered after Field so it draws on top. A script's `say` launches it with one line and a callback; Confirm closes it and calls back, which resumes the script. Scene operations are queued until the next frame, and the script resumes after the frame's updates, so the Confirm that closes a box never opens the next one or talks to someone again. `drawDialogueBox` (`src/ui/dialogue-box.ts`) draws it: the portrait box for a speaker with a portrait, the plain one with a name tab otherwise, and for a speaker with no name (a sign) the pack's tab-less box, nine-sliced to the same size and place. A line too long for three lines logs an error. The typewriter, skipping and choices are M2's dialogue task.
- **The walk cycle** is rows 0–3 of a character sheet (feet together, stride, feet together, other stride), two rows per step, starting on a stride; short sheets use rows 0–1 (`src/systems/character-frames.ts`).
- **The camera** follows the player in whole pixels and stops at the map's edges. On a map smaller than the view it centres the map instead (`cameraBounds` in `src/systems/camera.ts`), since Phaser alone would pin it to the top-left.
- **Battle** starts on top of Field (which sleeps) and hands back a result: victory, defeat or fled.
- **Overlays** run above Field. A focus stack decides which one gets input.

## Game state and saves

```ts
interface GameState {
  party: CharacterId[];                        // in battle order, 4 at most
  members: Record<CharacterId, MemberState>;   // level and EXP; M3 adds HP, MP and equipment
  inventory: Record<ItemId, number>;           // only items the party has
  gold: number;
  flags: Record<string, true>;                 // only flags that are set
  vars: Record<string, number>;                // only vars that aren't 0
  location: { map: MapId; x: number; y: number; facing: Direction };
  playTimeMs: number;
}
```

- `GameState` is plain JSON, owned by `src/core/state.ts`, and never changes in place: its fields are read-only and every operation returns a new state, so scenes read it and change it only through core functions: `createGameState`, `hasFlag`/`setFlag`, `getVar`/`setVar`, `itemCount`/`hasItem`/`addItem`/`removeItem`, `addGold`/`removeGold`, `inParty`/`joinParty`, `setLocation` and `addPlayTime`. M3 adds `equip`, `gainExp` and the stats behind HP and MP; battles add `knownWeaknesses: Record<EnemyId, Element[]>`.
- The operations check what they're given and throw a `RangeError` rather than break the state: IDs must be kebab-case, and flag and var names namespaced (`isId` and `isNamespacedId` in `src/core/ids.ts`); counts and gold are whole numbers; nothing can take items or gold the party doesn't have; and the party can't grow past 4. Unit tests (`state.test.ts`) cover each operation, and check that none changes the state it was given.
- **The game being played** is `session.state` (`src/systems/session.ts`). Scenes swap in what an operation returns: `session.state = setFlag(session.state, 'story.beacon-out')`. New Game replaces it with `createGameState(NEW_GAME)`. The field keeps `location` in step with the player on every step, turn and arrival (except for the step into a way out, which can be off the map: until they arrive, the player is still where they last stood), and adds each frame's real time to `playTimeMs` (Phaser's `delta` is smoothed, and held to 1/60 s while the window isn't focused, so it uses `game.loop.rawDelta`, capped like every frame). Battles will count play time too; the title screen doesn't.
- Saves go in `localStorage` under `fifth-flame:save:{autosave,1,2,3}` as `{ version, savedAt, summary, state }`. Settings are stored separately under `fifth-flame:settings`.
- `SAVE_VERSION` comes with an ordered list of migrations. Tests load a fixture save from every past version.
- The debug menu can export a save to a file and import one, which helps when testing across devices.

## Content data

Content lives in `src/data/` as typed TypeScript modules rather than JSON: they're type-checked as they're written, can hold comments, and are easy to refactor. Each collection is also checked against its Zod schema.

```ts
// src/data/skills.ts
export const skills = defineSkills({
  'tide-edge': {
    name: 'Tide Edge',
    description: 'A water-charged slash.',
    kind: 'physical',
    element: 'water',
    power: 1.4,
    mp: 4,
    rank: 'normal',
    target: 'one-enemy',
  },
  'delay-strike': {
    name: 'Delay Strike',
    description: 'A quick jab that knocks the target back in line.',
    kind: 'physical',
    power: 0.8,
    mp: 3,
    rank: 'quick',
    target: 'one-enemy',
    effects: [{ type: 'delay', amount: 0.5 }], // +50% of the target's Normal delay
  },
});
```

`npm run validate` checks the asset manifest, the maps and the event scripts so far (see [Assets](#assets), [Maps](#maps) and [Event scripts](#event-scripts)). M3 makes it check:

- every collection against its schema, with unique IDs;
- that every reference resolves: skills in learnsets; items in shops, chests and drops; encounter tables on maps; sprite and audio keys in the asset manifest;
- that every map can be reached from the start, and that no chest flag is used twice.

## Maps

Maps are written as ASCII so Claude can author, read and diff them. Saltmere's are drafts of the real thing: `saltmere` itself, Tamsin's house (`saltmere-tamsin`), the fisher's cottage (`saltmere-cottage`), and the lighthouse (`saltmere-lighthouse`) with its lamp room (`saltmere-lighthouse-top`). The test maps (`test-shore` with a house to enter and a path east to `test-meadow`; inside, `test-house` and its `test-cellar`) are small working examples that the tests rely on. A map, trimmed:

```ts
// src/data/maps/saltmere.ts
export default defineMap({
  id: 'saltmere',
  name: 'Saltmere',
  terrain: `
    TTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTT
    TT..................................TTTTTTTT
    TT..........................................
    ...............................~~~~~~.......
    ~~~~~~......~~~~~~~~~~~~~~~~~~~~~~~~~.......
  `,
  legend: { T: 'sand-trees', '.': 'sand', '~': 'sea' },
  objects: [
    { type: 'prefab', prefab: 'house', at: [6, 3], to: { map: 'saltmere-tamsin', spawn: 'door' } },
    { type: 'spawn', id: 'tamsin', at: [7, 6], facing: 'down' },
    { type: 'prefab', prefab: 'dock', at: [15, 22] },
    { type: 'npc', id: 'fisher', sprite: 'old-man-3', at: [16, 24], facing: 'down', script: 'saltmere/fisher' },
  ],
});
```

Chests (`{ type: 'chest', at, item, flag }`) arrive with M2.

- **Terrains** live in `src/data/terrain.ts`, in three kinds:
  - **`fill`**: one tile everywhere, or weighted variants (plain grass with the odd tuft). A hash of the cell's position picks the variant, so it looks random but never changes.
  - **`blob`** (autotiled): a cell's tile depends on which of its 8 neighbours share its terrain, so water gets shorelines and paths get grassy edges. A corner only counts when both sides next to it do, which leaves 47 shapes; cells off the map count as the same terrain. The pack's grass-edged water, sand-edged sea and path blocks share one layout, `EDGED_BLOB`, worked out from the tiles' pixels. Water and paths have grass around their edges, so they belong on grass; the sea has sand around its edges, so it belongs on `sand`, which matches it exactly. There's no water tile for a lone cell, so ponds and channels need at least two.
  - **`trees`**: along each row, every two cells grow a 2-wide tree (picked from a list by position) and an odd cell out gets a 1-wide filler. A tree's trunk row stands on its cells, which are solid, and its canopy overhangs the row above, where characters can walk behind it.
- **Prefabs** are blocks of tiles drawn as one: trees, houses, doors and stairs, the lighthouse, the dock and the boat, lamps, furniture. Each character of a prefab's `layout` marks a tile: `#` solid, drawn under characters; `.` walkable, drawn under characters; `^` walkable, drawn over characters; `=` walkable whatever the terrain under it, drawn under characters (the dock out over the sea); `D` a doorway; a space for no tile. Tall furniture stands against a room's back wall, its top tile drawn over the wall. Maps place prefabs as `{ type: 'prefab', prefab, at, to?, script? }` objects, by their top-left cell. With `to`, the doorway is walkable and leads there, even when it's in a wall; without, it's solid. With `script`, facing any of its cells drawn under characters and pressing Confirm runs that event script (the test shore's `sign`).
- **Ways between maps** all lead to a named spawn: `to: { map, spawn }`. A map's objects include its spawns, `{ type: 'spawn', id, at, facing }`, where arrivals appear. Doors and stairs are prefabs with a doorway; `{ type: 'warp', at, to }` makes any walkable cell a way out; and a map's `edges` say where walking off each side leads (`edges: { east: { map: 'test-meadow', spawn: 'west' } }`). An edge with no entry is a wall, and every cell along an edge with one leads out, so give the map a gap in its border. Put spawns next to ways in, not on them, and clear of treetops so the player can be seen arriving.
- **People** are `{ type: 'npc', id, sprite, at, facing, wander?, script? }` objects: `sprite` names a character sheet (`sprite.<sprite>` in the manifest), `wander` is how many cells they may stray from `at`, and `script` is the event script talking to them runs. The compiler won't let one start on a solid cell, a way out, a spawn or another NPC.
- **Rooms** use the `house-wall` and `cellar-wall` terrains, from the pack's simple room frame. It has only the shapes a rectangle needs (four corners, four sides, solid wall), so their rooms must be rectangles with walls one cell thick; anything else won't compile. Saltmere's draft interiors use it, furnished with prefabs. The pack's fuller interior walls (`Interior/TilesetInterior.png`: walls drawn as lines, in four colours, with windows and arches) are still to be worked out.
- **The compiler** (`compileMap` in `src/core/map/compile.ts`, pure and unit-tested) turns a map into three layers, `ground`, `base` (trunks, walls) and `overhead` (treetops, roof tops), plus a `solid` grid. `isBlocked(map, x, y)` answers whether a cell can be walked into (off the map is blocked unless that edge leads somewhere), `isOutOfBounds(map, x, y)` whether it's off an edge that leads nowhere (the one wall noclip doesn't open), `exitAt(map, x, y)` where stepping into it leads, and `scriptAt(map, x, y)` the script examining it runs. Anything that doesn't fit throws an error naming the map and the cell: an unknown character, ragged rows, a shape with no tile, a prefab off the map or on top of another, a spawn or warp on a solid cell, two spawns with one ID.
- **The field scene** draws the layers as a Phaser tilemap (`src/systems/tilemap.ts`). Every tile sheet a map uses becomes a tileset with its own range of tile IDs, so any layer can mix sheets. Characters are drawn between `base` and `overhead` (see `DEPTH`), the debug collision view over everything, and the world camera is zoomed 2×.
- **`npm run validate`** compiles every map, checks that every tile a terrain or prefab names is inside a 16×16 sprite sheet from the asset manifest, that every way out leads to a spawn that exists, and that every NPC's sprite is a character sheet. `src/data/maps/maps.test.ts` also checks that the layout covers all 47 shapes.
- If the owner wants to hand-paint a map, add a Tiled (`.tmj`) importer and let that map opt out of ASCII. Each map keeps one source of truth.

## Event scripts

Cutscenes and interactions are **async TypeScript functions** run against a typed `EventContext`. There's no scripting language to build or learn:

```ts
// src/data/events/saltmere.ts
export const tamsin = defineEvent(async (ev) => {
  if (!ev.flag('story.beacon-out')) {
    await ev.say('tamsin', "Lamps won't light themselves, Rowan. Off you go!");
    return;
  }
  await ev.face('tamsin', 'player');
  await ev.say('tamsin', 'Sixty years, and I never once saw that Beacon dark.');
  const pick = await ev.choice(["I'll go and see.", 'What do we do?']);
  if (pick === 1) await ev.say('tamsin', 'You go and see. That is what we do.');
  await ev.giveItem('potion', 3);
  ev.setFlag('story.tamsin-gift');
});
```

- **Where they live:** a file per area in `src/data/events/` exports its scripts by name, and `src/data/events/index.ts` registers each as `<area>/<name>` in `EVENTS`, its name turned kebab-case (`lighthouseSign` in `saltmere.ts` is `saltmere/lighthouse-sign`; the test maps' are `test/tamsin`, `test/sign` and so on). Maps name them in an NPC's or prefab's `script`.
- **Speakers** (`src/data/speakers.ts`) are who `say` names: the name in the box's tab, and a portrait if they have one. A speaker with an empty name, `sign`, is for signs and narration.
- **So far** (M1) `EventContext` has one verb, `say(speaker, text)`, and the only trigger is `interact`; the field runs scripts (see [Scenes](#scenes)). `npm run validate` (`tools/event-checks.ts`) checks that every script a map names exists, that every speaker's portrait is an image in the manifest, and runs every script against a stand-in context that answers at once, to check it finishes and only names speakers that exist.
- **The first `EventContext` API:** `say`, `choice`, `wait`, `move`, `face`, `emote`, `fadeOut`/`fadeIn`, `cameraPan`, `flag`/`setFlag`, `var`/`setVar`, `hasItem`/`giveItem`/`takeItem`, `gold`/`giveGold`/`takeGold`, `joinParty`, `heal`, `battle(encounterId, { canFlee, canLose })`, `shop`, `inn`, `bgm`/`sfx`, `teleport`, `savePrompt`. Add verbs as content needs them, keep each one small, and test them against a fake context.
- **Triggers:** `interact` (NPCs, objects), `touch` (stepping on a tile), `enter` (when a map loads), `auto` (runs once when a flag condition becomes true).
- While a script runs, the player can't move, open menus or save, and NPCs stand still.

## Battle engine

Pure, synchronous and deterministic, in `src/core/battle/`:

```ts
startBattle(setup, state, db, rng): BattleState
nextActor(battle): CombatantId
previewTurnOrder(battle, pending?: Action, count = 10): CombatantId[]
applyAction(battle, action, rng): { battle: BattleState; events: BattleEvent[] }
chooseEnemyAction(battle, enemyId, rng): Action
battleResult(battle): 'ongoing' | 'victory' | 'defeat' | 'fled'
```

`BattleEvent`s (`action-start`, `damage`, `heal`, `miss`, `status-added`, `stagger`, `ko`, `turn-order`, …) are the only thing `BattleScene` reads to animate. The same engine runs headless for unit tests and for the simulator.

**The simulator** (`npm run sim`) runs N seeded battles for each encounter group and boss, with the party at that area's target level and gear (from `balance.ts`) and a simple party AI. It prints win rate, average rounds and HP left, and flags anything outside the targets in DESIGN.md. Run it after every balance or content change.

## Input

- Logical actions: `up`, `down`, `left`, `right`, `confirm`, `cancel`, `menu`, `run`. Keyboard, gamepad and touch all map to these, and game code never reads raw keys.
- Holding a direction in a menu repeats after 300 ms, then every 80 ms.
- Code lives in `src/systems/input/`: `actions.ts` (actions, key bindings, gamepad mapping), `action-state.ts` (held / pressed / pressedOrRepeated; pure and unit-tested), the touch controls (below) and `game-input.ts` (the `input` singleton, which reads every device once per frame before scenes update). Scenes ask things like `input.pressedOrRepeated('down')`.
- **Touch controls** (`touch-controls.ts`, styled by `touch-controls.css`) are page elements laid over the game inside `#game`, not part of the canvas, so they can use the space beside the game and size themselves in CSS pixels. They show in *touch mode*, the `touch` class on `<html>`: on from the start where the main pointer is coarse (`prefersTouch()`), or from a laptop touchscreen's first touch. The d-pad follows the thumb that pressed it until it lifts (pointer capture, `dpadDirection()` with a dead zone in the middle and some hysteresis at the diagonals), and each button stays down until every finger on it lifts, so several fingers work at once. B holds both `cancel` and `run`, like a gamepad's B. Taps shorter than a frame are latched like key presses. Touching the game itself does nothing.
- **Layout** is `layoutTouchControls()` in `touch-layout.ts`, pure and unit-tested: whole-number art scales from the view's height, clear of the notch and rounded corners (`env(safe-area-inset-*)`, read through a probe element), in the bottom corners, all lifted to just above the dialogue box (`DIALOGUE_BOX_ON_SCREEN`) when any would cover it. It reruns whenever the game's container changes size, as the game itself refits. Turning the phone upright, or leaving the page, lets go of every control.
- **Held upright** in touch mode, CSS hides the controls and shows the "turn your phone sideways" hint (its text is in `src/data/ui-text.ts`) over everything.
- **Always run** is `settings.alwaysRun` (`src/systems/settings.ts`): the field runs when Run is held, or when it isn't with always run on. `main.ts` turns it on for touch-first devices. Settings live in memory until the Options screen (M5) keeps them.
- A press shorter than a frame still counts: key presses and touches are latched until the next frame reads them.
- Gamepads use the browser's "standard" button layout. Headless browsers have none, so `tests/e2e/input.spec.ts` swaps in a fake pad through `navigator.getGamepads`. E2E tests hold inputs for a couple of frames (see `nextFrames()` there) rather than polling, so auto-repeat can't race them. `tests/e2e/touch.spec.ts` plays a touchscreen phone (Playwright's `hasTouch` and `isMobile`) and puts fingers down and lifts them through Chromium's DevTools protocol (`Input.dispatchTouchEvent`), several at once.

## Audio

- `AudioManager`: `playBgm(key, { fade })` crossfades; battle music pauses the field track, which resumes afterwards; sound effects have a per-key cooldown so fast cursor movement doesn't stack sounds.
- Browsers block audio until the player interacts, so music starts after the first key press or tap on the title screen. Unlock it on `pointerdown`, `touchend` or `keydown`, not `click`, which touches no longer send (see Rendering).

## UI kit (`src/ui/`)

`Window` (9-slice frame), `Menu` (list or grid with cursor, scrolling, disabled items and help text), `TextBox` (typewriter text, name and portrait, ▼ prompt), `ChoiceBox`, `Gauge` (HP, MP, EXP), `Timeline` (the CTB strip), `NumberPop` (damage numbers) and `FocusStack` (which widget has input). Every menu in the game is built from these.

## Testing

| Layer | Tool | Covers |
|---|---|---|
| Rules | Vitest | Formulas, CTB order, statuses, inventory, equipment, EXP, saves and migrations, event scripts against a fake context |
| Content | `npm run validate` (also run as a test) | The asset manifest against the files, the maps, and the event scripts and speakers; from M3, schemas and cross-references |
| Balance | `npm run sim` | Win rates and battle length against the targets |
| Game | Playwright | Boots with no console errors; new game → walk → talk → battle → save → reload; screenshots of key screens |

`npm run test:e2e` builds the game with `vite build --mode e2e` into `dist-e2e/`, serves it with `vite preview` on port 4173 and runs `tests/e2e/` against it. The `e2e` mode is a production build with debug hooks switched on. Screenshots go to `test-results/screenshots/`. If the port is busy, a stray preview server from an earlier run is the usual cause.

**Randomness.** `src/core/rng.ts` is sfc32 (checked against a C translation of the PractRand reference), seeded through splitmix32. `state()` and `Rng.fromState()` snapshot it for saves and Retry battle, and a golden-value test pins the exact sequence so replays and simulator baselines can't drift by accident.

**Debug hooks.** Dev and test builds expose `window.__game`, which tests use to jump straight to what they're testing:

```ts
__game.warp('tide-caves-b2', 10, 4);
__game.setFlag('story.beacon-out');
__game.give('potion', 5);
__game.setLevel(10);
__game.battle('tide-caves-boss');
__game.state(); // the current GameState
```

So far it has `activeScenes()`, `startScene(key, data?)` (which first stops every scene that's running, paused or asleep), `inspect(sceneKey)`, `warp(map, x, y, facing?)`, `held()` (the actions the game read as held this frame), `noclip(on)` and `showCollision(on)`, the debug menu's switches, and for the game state `state()`, `setFlag(flag, on?)` and `give(item, count?)`; the rest arrive with the features they test. `installDebugHooks` also registers the debug-only scenes: `asset-gallery`, which shows every character sheet in all four directions and the portraits, at the world's scale (`__game.startScene('asset-gallery')`), and the debug menu. `src/main.ts` installs all of it only when `import.meta.env.DEV` is true or the build mode is `e2e`, so production builds drop it entirely, and `npm run build` runs `tools/check-bundle.mjs` afterwards, failing the build if `__game` or a debug scene ever leaks in. Tests get its types with `import type {} from '../../src/debug/api'`.

The **debug menu** opens with the backtick key, or three fingers on the game on a touchscreen (fingers on the touch controls don't count), and the same again closes it. It's an overlay scene, `debug-menu` (`src/debug/debug-menu-scene.ts`), added last so it draws over everything. Whatever was running pauses under it until it closes, and closing and warping wait for the next frame, so the scenes that carry on never see the press that did it. Up and Down move, Confirm chooses, and Cancel goes back a page, or closes the menu from the first. `DebugMenu` (`src/debug/debug-menu.ts`) keeps the open page and the cursor, and `src/debug/debug-pages.ts` builds the pages; both are pure and unit-tested. Version 1 has:

- **Warp to a map:** every map in `MAPS`, then one of its spawns. A map with no spawns is listed, but can't be chosen.
- **Noclip:** the player walks through walls, water and people. Ways out still work, and an edge that leads nowhere still stops them.
- **Show collision:** marks over the field, on every map until it's turned off: solid cells darkened and ringed in red, ways out in blue (with a blue bar along any edge that leads somewhere), spawns as green rings with a dot, and the cells people take up as orange rings (`src/systems/collision-view.ts`).

Noclip and Show collision are `debugSwitches` (`src/systems/debug-switches.ts`), which the field obeys. Only the debug menu and `__game` turn them on, and production builds have neither, so there they stay off. Later milestones add save export and import (M2), and starting any battle, levels and gear, encounters on or off, and 4× game speed (M4).

## CI/CD

- `.github/workflows/ci.yml` runs on every push to `main`, every PR, and on demand: `npm ci` → `npm run check` → build → Playwright smoke test. It uploads screenshots and reports as the `e2e-results` artifact.
- Its deploy job runs only for pushes to `main`, and only after the checks pass: build → GitHub Pages. One workflow, so a failing build can never deploy. Vite's `base` is `./`, so the same build works at `/game/` and anywhere else.
- Cloud sessions can't reach `tim39.github.io`, so confirm a deploy from the run's "Deploy to GitHub Pages" job instead.
- Later, optionally: preview builds for PRs, so the owner can play a branch before merging it.

## Assets

- **Raw packs live in this repo's GitHub Releases, one release per pack, never in git.** GitHub's web uploader stops at 25 MB and cloud sessions can't reach itch.io, but they can download release files. **`npm run fetch-assets`** downloads each pack listed in `tools/fetch-assets.ts`, checks its SHA-256 and unzips it to `assets-src/<pack>/` (gitignored), dropping the zip's top-level folder. Re-running it skips packs that are already there. It needs `curl` (which uses the cloud proxy) and `unzip`. To add a pack, attach it to a new release and add a line to that list with its hash.

- Files the game actually uses are copied to `public/assets/{tiles,sprites,portraits,monsters,ui,fonts,vfx,bgm,sfx}/` and registered under logical keys (`sprite.rowan`, `bgm.town-saltmere`) in **`src/systems/asset-manifest.ts`**. Game code only ever uses the keys.
- **Keys say what a file is for; file names say what it is.** `sprite.rowan` loads `sprites/hunter.png`, so giving a character a different look means copying in the new file, crediting it and changing one line of the manifest; no game code changes. Tilesets and character sheets are sprite sheets of 16×16 frames, and everything else is a plain image. The manifest is plain data with no imports, so tools can read it too. The Preload scene loads all of it at boot, which is fine while it's a few hundred KB.
- **`npm run validate` checks the manifest** (`tools/asset-checks.ts`, also run as a unit test): every key points at a PNG that exists, sprite sheets divide into whole frames, and no two keys share a file. Every file in `public/assets/` must be in the manifest, be credited in `CREDITS.md`, and have a kebab-case name. The `asset-gallery` debug scene (see [Testing](#testing)) shows the characters in the engine, and `tests/e2e/assets.spec.ts` checks that every key loads with the right number of frames.
- Every pack is listed in `CREDITS.md` with its source URL, author and license.
- Older Safari versions (including on iPhone) can't play Ogg, so ship each music track as both `.ogg` and `.m4a` (Phaser picks whichever the browser supports), and convert the pack's `.wav` sound effects the same way to keep downloads small.

### Ninja Adventure

| | |
|---|---|
| Release | [`ninja-adventure`](https://github.com/tim39/game/releases/tag/ninja-adventure), file `Ninja.Adventure.-.Asset.Pack.zip` (94 MB) |
| SHA-256 | `95a06f4fdcfd1882f061a45ff313b7c905dbe2de1e8512b281d7937df62a7b15` |
| Authors | Pixel-boy and AAA, https://pixel-boy.itch.io/ninja-adventure-asset-pack |
| License | CC0 1.0 (`LICENSE.txt`). Credit isn't required but is appreciated, so the game credits them anyway. |

What's inside, under `assets-src/ninja-adventure/` (the paths `CREDITS.md` uses):

- **Tilesets** (`Backgrounds/Tilesets/`), 16×16: field, nature, water, cliffs (`TilesetRelief`), houses, interiors, dungeon, desert, towers, and an abandoned village that suits the Gloam-covered world. Terrain comes as rounded 3×3 patches plus inner corners, which is what the autotiler targets. Animated water, waterfalls, flags and mills are in `Backgrounds/Animated/`; boats and fishing nets for Saltmere are in `Backgrounds/Vehicles/`.
- **Characters** (`Actor/Character/`, about 90): `SpriteSheet.png` is 64×112, a grid of 16×16 frames with one column per direction (down, up, left, right) and rows for walking (0–3), attack (4), jump (5) and a special pose (6). `SeparateAnim/` has Idle, Walk, Attack, Jump, Dead, Item, Special1 and Special2 strips, and `Faceset.png` is a 38×38 portrait. Fantasy-friendly picks include Knight, KnightGold, Princess, Noble, Monk, the Sorcerers, OldWoman and the Villagers; the ninjas suit Cass.
- **Monsters** (`Actor/Monster/`, 66): 64×64 sheets (4 directions × 4 frames), each with a faceset. **Bosses** (`Actor/Boss/`, 20): larger multi-frame strips, including dragons, a giant slime, squids, a giant spirit and a fire giant.
- **Effects** (`FX/`): slashes, elemental hits (fire, water, ice, rock, thunder, plant, explosion), magic (aura, shield, circle, spark), particles, projectiles and smoke.
- **UI** (`Ui/`): dialogue and choice boxes, a wooden window theme, HP/MP bars (`Receptacle`), 30 emotes, 121 skill icons, and keyboard and gamepad button glyphs. Item icons are in `Items/`.
- **Audio** (`Audio/`): 41 music tracks (`.ogg`), 15 jingles (victory, level up, game over, secret found) and 132 sound effects (`.wav`).
- **Fonts** (`Ui/Font/`): the `font8x8.png` and `font24x30.png` bitmap fonts.

Watch out for:

- **`Ui/Font/NormalFont.ttf`: don't use it.** Its embedded metadata says *FontStruct Non-Commercial License*, which contradicts the pack's CC0 notice. Use the bitmap fonts instead, or a separately licensed CC0 or OFL font.
- **The bitmap fonts' "i"** ended in a stray curl and read like ";". Our copies redraw its bottom row to match "l" and "t" (see CREDITS.md).
- **`Backgrounds/Tilesets/TilesetFloor.png` is 417 px tall**, one blank row more than its 26 rows of tiles. Our copy is cropped to 416.
- **`OldWoman` and `Child` have short sheets** (64×32): two walking rows, no attack or jump poses.
- **Gaps:** there's no mine cart sprite (for the Stone Deeps) and no dedicated wind effect (for Gale Spire). Build them from tiles and tinted effects, or adjust the gimmick. There was no lighthouse either: Saltmere's is the desert sheet's domed tower, its dome recoloured red and its windows lit (`tiles/lighthouse.png`).
- **Villages by the sea:** the pack's own examples build villages on sand, not grass. Its sand-edged sea (`TilesetWater.png` rows 0–4) and plain light sand (`TilesetFloor.png` column 1, row 1) meet without a seam; the grass-edged dirt path doesn't belong on sand, so Saltmere's streets are open sand.

## Performance budget

60 fps on a mid-range phone, and a first load under about 10 MB. Once the soundtrack grows, load music per area instead of all at boot.

## Cloud session notes

- Chromium for Playwright is preinstalled under `/opt/pw-browsers` (build 1194), which is why `@playwright/test` is pinned to 1.56.1. Don't run `playwright install` there. If the image's Chromium changes, pin the matching Playwright release, or set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`, which `playwright.config.ts` passes as `launchOptions.executablePath`.
- In CI, install the browser with `npx playwright install chromium`. GitHub's Ubuntu runners already have the libraries Chromium needs; `--with-deps` would only add fonts the game doesn't use, from an apt mirror that once stalled a run until it timed out. If Playwright ever reports missing host dependencies there, add `--with-deps` back.
- Chromium logs "Noise was added to a canvas readback" while Phaser runs its startup feature checks. It's a privacy notice, not an error, so the smoke test should fail only on `console.error` and uncaught page errors.
- For a quick screenshot without Playwright, run `/opt/pw-browsers/chromium --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot=out.png <url>`. Its `--window-size` includes about 87 px of invisible browser chrome, so the page viewport is shorter than the image.
