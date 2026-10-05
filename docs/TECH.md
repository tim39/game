# Tech

Architecture and tooling. Until the code exists, this is the plan; once it does, keep this doc in step with it.

## Stack

| | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict` | Pinned to 6.0.x: TS 7 is out, but typescript-eslint only supports up to 6.0 |
| Engine | Phaser 4 (4.2.x) | Tilemaps, cameras, tweens, particles, input, audio, scenes |
| Build | Vite 8 | Dev server and static build |
| Unit tests | Vitest 5 | Runs `src/core` and the data checks in Node |
| Data validation | Zod 4 | A schema for every kind of content. Only the tools and the tests run them, so the game doesn't ship Zod |
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
│   │   ├── battle/       the battle engine (battle.ts): turn order, damage, statuses, events;
│   │   │                 the enemy AI (ai.ts) and the party's, for the simulator (party-ai.ts);
│   │   │                 terms.ts: elements, reactions, statuses, ranks, targets and target
│   │   │                 rules; fixtures.ts: the tests' content
│   │   ├── map/          map format, autotiler, compiler, collision; battle backdrops
│   │   ├── walker.ts     grid movement
│   │   ├── encounters.ts random battles: the step countdown, groups, who gets the jump
│   │   ├── npc.ts        how NPCs stand, wander and look at the player
│   │   ├── ids.ts        what IDs and flag names look like
│   │   ├── state.ts      GameState and the operations on it
│   │   ├── stats.ts      stats at each level, with equipment and buffs
│   │   ├── levels.ts     the EXP curve: how much EXP each level takes
│   │   ├── equipment.ts  slots, and who can equip what
│   │   ├── party.ts      the party with the content: starting gear, members' stats and skills
│   │   ├── db.ts         GameDb: the content core functions take as an argument
│   │   ├── save.ts       serialization, versions, migrations
│   │   ├── save-fixtures/  a real save from every version, which the tests load
│   │   ├── events.ts     EventContext types for scripts
│   │   ├── script-context.ts  a script's context: the game state verbs, over a stage
│   │   ├── conditions.ts flag conditions, for triggers
│   │   ├── chest.ts      treasure chests: the script opening one runs
│   │   ├── route.ts      walking someone along a route, for scripts
│   │   ├── schema.ts     Zod schemas for every kind of content, and types derived from them
│   │   └── rng.ts        seeded RNG
│   ├── data/             content: characters, skills, items, enemies, encounters,
│   │                     shops, balance.ts, terrain.ts, maps/, backdrops.ts, events/,
│   │                     speakers.ts, ui-text.ts
│   ├── systems/          Phaser-side services: the game being played (session), input (keys,
│   │                     gamepads, touch controls), settings, debug switches, audio, the save
│   │                     slots, assets, event runner
│   ├── scenes/           boot, preload, title, field, battle, menu, dialogue, save menu, shop,
│   │                     game-over
│   ├── ui/               the UI kit
│   └── debug/            debug menu and window.__game (dev and test builds only)
├── tools/                fetch-assets.ts, validate.ts, sim.ts (with simulate.ts and
│                         battle-log.ts) and other scripts
├── tests/e2e/            Playwright specs
└── .github/workflows/    ci.yml (checks, then deploy)
```

## Dependency rules

- `core` imports nothing from the rest of `src`, and never `phaser`. Content is passed in (a `GameDb`, `src/core/db.ts`; the game's is `DB` in `src/data/db.ts`), so tests can use small fixtures.
- `data` imports only from `core` (schemas, `define*` helpers, types).
- `systems`, `scenes` and `ui` may import `core`, `data` and each other.
- Only `main.ts` imports `debug`, and only in dev and test builds.
- The game takes only types from `src/core/schema.ts`, and never imports `zod`: only the tools and the tests run the schemas (see [Content data](#content-data)).

`eslint.config.js` enforces the first two with `no-restricted-imports`, and the last with its TypeScript version, which allows `import type`; it also bans `Math.random`, `Date.now` and browser globals (`window`, `document`, `localStorage`, `performance`) inside `src/core`.

TypeScript is split in two: `tsconfig.app.json` covers `src/` (browser code, DOM types), and `tsconfig.node.json` covers the config files, `tests/` and `tools/` (Node types). `tsconfig.json` only references the two, which is what editors and ESLint pick up.

## Rendering

- Canvas **640×360** with `pixelArt: true` and `roundPixels: true`.
- The world camera uses zoom 2, so the world is effectively 320×180 pixels: 20×11 tiles of 16 px.
- **The UI is drawn at world scale too (2×)**, because the pack's UI art is (the dialogue box is 300×58). Decided in M0 from screenshots: text is clearly readable on a phone held sideways. Held upright, the whole 640×360 game shrinks to about 0.6× and nothing is comfortable, so M1 asks players to turn the phone.
- **Fonts** (`src/ui/fonts.ts`): two pixel fonts from the pack, registered as RetroFonts. `FONT.body` is the 8×8 sheet, drawn at 2×, for text, menus and dialogue. `FONT.display` is the 24×30 sheet shrunk back to its native 8×10 grid, drawn at 4×, for titles. Both are recolored white and tinted per use. RetroFont spaces glyphs in fixed cells, so at load time `measureGlyphColumns()` measures each glyph's real width and the font becomes proportional (1 px between letters, 4 px spaces).
- **Text layout:** `textMeasurer(scene, font)` gives a string's width in font pixels, and `wrapText(text, maxWidth, widthOf)` wraps by width. The dialogue box's measured layout lives in `src/ui/dialogue-layout.ts`: 3 lines of up to 236 px with a portrait (about 43 characters of real text, once wrapped) or 280 px without (about 53), and the choice box's, below. How glyphs are measured (`FONT_CHARS`, the letter gap, `measureFont`, `textWidth`) lives in `src/ui/glyph-metrics.ts`, which has no Phaser in it, so the tools measure text exactly as the game does (see [Event scripts](#event-scripts)).
- Scaling uses whole-number multiples of 640×360 where the window allows (720p, 1080p, 1440p and 4K are all exact), letterboxed. Smaller screens such as phones fall back to fit-to-screen. `pickZoom()` in `src/systems/display.ts` decides, and `main.ts` applies it with `game.scale.setZoom()` whenever the game's container changes size. A `ResizeObserver` watches it, because on phones browser toolbars coming and going can change it without a window resize event. `tests/e2e/scaling.spec.ts` checks five screen sizes, and a refit with no window resize.
- **The page never zooms**, and the browser's other touch gestures (the magnifying glass and text selection on a long press, scrolling) stay out of the game, which handles every touch itself and fits the screen; a zoomed page only crops it. The viewport tag (`maximum-scale=1, user-scalable=no`) and `touch-action: none` on the page are meant to stop them, and do in most browsers, but iOS Safari still zoomed while the touch controls were used. Phaser cancels the default handling of touches on its canvas, and the controls are page elements over it, so `preventBrowserGestures()` (`src/systems/browser-gestures.ts`) cancels it for every touch on the page (non-passive `touchstart`, `touchmove` and `touchend` listeners), and for Safari's own `gesturestart` and `gesturechange`. The touch controls run on pointer events, which come before touch events and don't depend on them, so they still see every touch. Touches no longer make `click` events, though: listen for pointer, touch or key events instead.

## Scenes

```
Boot → Preload → Title ──▶ Field ◀──▶ Battle ──▶ GameOver
                   │          │
                   │          ├── Dialogue   (overlay)
                   │          ├── Menu       (overlay)
                   │          ├── Shop       (overlay)
                   └──────────┴── Save menu  (overlay: loading over the title, saving over the field)
```

- **Field** owns the current map, the actors and the event runner. Until the real opening exists, New Game starts a fresh game state, shows the M0 dialogue preview and then puts the player where the state says: in Saltmere, at Tamsin's door (`NEW_GAME` in `src/data/new-game.ts`). Continue starts it where a save was made. It starts at a cell or at one of a map's spawns (`FieldStart`), and with `autosave` when the start is a map change (see [Game state and saves](#game-state-and-saves)).
- **Going between maps:** when a step heads into a way out (a doorway, a warp or an edge exit), the controls stop and the camera fades to black while the step finishes; then the field scene restarts on the target map at its spawn, and fades back in. Both fades take `MAP_FADE_MS` (250 ms, in `balance.ts`). The fade out is forced, so a way out taken while the fade in is still running can't get stuck. The walker always stops on an exit cell, so it can't walk through one in a long frame.
- **Grid movement** is `updateWalker` in `src/core/walker.ts`, pure and unit-tested. A step claims its cell as it starts, so nothing else can move in, then slides there; it always finishes. Holding a direction chains steps with the leftover time carried over, so walking never stutters, and a tap during a step is buffered for when it ends. A direction towards a blocked cell turns the player without moving them. Speeds are `FIELD_SPEEDS` in `src/data/balance.ts`. The scene caps a frame at 100 ms so the player can't jump after the tab was hidden.
- **NPCs** come from a map's `npc` objects and move by the rules in `src/core/npc.ts`, on the same walker as the player, with `NPC_TUNING` from `balance.ts`. Without `wander` they stand still; with it, they wait a random 1.5–4 s, then step a random way if the cell is free and within `wander` cells of home, or else just turn to look. Their randomness comes from an `Rng` seeded with `field:<map id>` each time the map loads. A walker takes up its cell, and mid-step the cell it's leaving too, so nobody overlaps: the player can't walk into an NPC, and NPCs keep out of walls, ways out, the player and each other. Walking into an NPC makes them turn and look at the player for `lookMs` (3 s); one that stands still then turns back the way it was placed. Characters are sorted by height on screen, so a lower one is drawn in front, still under the overhead layer.
- **Talking and examining:** Confirm, pressed while standing still, looks at the cell the player faces. An NPC there turns to look at the player (as when bumped) and runs their `script`, if they have one; one partway through a step is ignored. A chest there opens: it runs the script that `chestScript` (`src/core/chest.ts`) makes for it, which the field's debug info names after the chest's flag. The first time, it sets the flag, so the sprite shows the chest open from then on, gives the party what's inside and says so ("Found Potion!", "Found 25 gold!"); after that, it says "The chest is empty." Its words are `CHEST_TEXT` in `src/data/ui-text.ts`, said by `sign`. Otherwise the map's script for that cell runs, if any: a prefab's `script` covers its cells under characters. Signs are just that: the `sign` prefab with a script that reads it out. While a script runs (`running` in the field's debug info) the player can't move and NPCs stand still, with their look timers paused, so a conversation never ends with someone walking off.
- **The dialogue box** is an overlay scene, `DialogueScene` (`src/scenes/dialogue.ts`), registered after Field so it draws on top. A script's `say` launches it with a `DialogueRequest`: a line, maybe choices, and a callback. What it does is `src/ui/dialogue-flow.ts`, pure and unit-tested: the text types out at `TEXT_SPEED` (50 characters a second, in `balance.ts`), Confirm shows the rest at once, and then, with the ▼ showing, Confirm closes it and calls back, which resumes the script. The Confirm that finishes the typing does nothing else. Scene operations are queued until the next frame, and the script resumes after the frame's updates, so the Confirm that closes a box never opens the next one or talks to someone again, and the next line replaces the last without a blank frame between. `drawDialogueBox` (`src/ui/dialogue-box.ts`) draws it: the portrait box for a speaker with a portrait, the plain one with a name tab otherwise, and for a speaker with no name (a sign) the pack's tab-less box, nine-sliced to the same size and place. A line too long for three lines logs an error.
- **Choices:** a script's `choice(options)` launches the dialogue scene again with the last line said, shown all at once, and the choices: `drawChoiceBox` nine-slices the pack's `ChoiceBox.png` to fit them, one to a line with a ▶ before the one under the cursor, centred just above the dialogue box (`choiceBoxOnScreen`). It's centred because on phones the touch controls sit just above the dialogue box at both sides; choices are at most `CHOICE_BOX.maxTextWidth` (140 font pixels) wide, which a unit test checks keeps the box clear of them on common phones. Up and Down move the cursor, wrapping round, and Confirm resolves the script's promise with the index picked. The New Game preview (`dialogue-sample`) shows its pages through the same scene.
- **The save menu** is an overlay scene too, `SaveMenuScene` (`src/scenes/save-menu.ts`), registered after the dialogue box. It opens over the field to save (Menu, while the player can act) and over the title screen to load (Continue); either pauses until it closes, and gets its answer through the callbacks it was started with (`SaveMenuStart`). What it does is `src/ui/save-menu-flow.ts`, pure and unit-tested: which slots can be chosen (any but the autosave, to save; one holding a save, to load), where the cursor starts (the latest save, to load; the slot saved in last, to save), and the Yes/No asked before saving over a slot, which reuses the choice box, beside the slot. It draws each slot as a panel nine-sliced from the pack's `ChoiceBox.png` (`src/ui/save-menu-layout.ts`): the slot's name, the party's sprites, the map's name and the leader's level, the play time and when it was saved (`src/ui/save-slot-text.ts`), in the player's own time zone. Slots not under the cursor are dimmed, so the one picked shows even under a thumb or the touch controls, which on a 16:9 phone sit over the middle slots (the touch layout lifts them above the dialogue box). The line at the bottom says what Confirm and Cancel do, asks the question, or says what just happened. Scene changes in Phaser wait for the next frame, so the scene underneath never sees the press that closed it.
- **The walk cycle** is rows 0–3 of a character sheet (feet together, stride, feet together, other stride), two rows per step, starting on a stride; short sheets use rows 0–1 (`src/systems/character-frames.ts`).
- **The camera** follows the player in whole pixels and stops at the map's edges. On a map smaller than the view it centres the map instead (`cameraBounds` in `src/systems/camera.ts`), since Phaser alone would pin it to the top-left.
- **Battle** is `BattleScene` (`src/scenes/battle.ts`; see [Battle screen](#battle-screen)). It's started with a `BattleStart`: the enemies and who gets the jump (a `BattleSetup`), a backdrop, a seed, and `onEnd`, which it calls once it's over and the screen has faded out, with how it ended (victory, defeat or fled) and the battle as it was then. Random battles start it on top of Field, which sleeps until it ends (below); the debug menu and `__game.battle` start one over nothing, and go to the field afterwards.
- **Random battles** (see Encounters in DESIGN.md) come on maps with `encounters` (see [Maps](#maps)). The rules are `src/core/encounters.ts`, pure and unit-tested: `encounterCountdown` draws the steps to the next battle, at the Normal rate, from `ENCOUNTER_TUNING.steps` (24 to 40, in `balance.ts`); `countStep` takes a step off it, as much as the rate says (`settings.encounterRate`: Off 0, Low 0.5, Normal 1, High 2), so the steps already taken count at any rate; `battleDue` says whether the next step brings the battle; and `rollEncounter` picks one of the table's groups by weight, then a preemptive strike (8%) or an ambush (4%). The countdown and the `Rng` it's drawn from are `encounters` in `src/systems/encounters.ts`, seeded from the clock when the page opens: they carry on across maps and battles, and aren't saved. The field counts each step finished onto a cell of such a map, except a way out or a touch, and its walk world's `stopsAt` stops the walk on the step that brings the battle. Then the battle is rolled, with a fresh countdown and a seed for the battle, all from that `Rng`; the battle music starts (see [Audio](#audio)); `playBattleTransition` (`src/ui/battle-transition.ts`) flashes the screen and sweeps bands of black across it, over everything (`DEPTH.transition`), and leaves it black; and the battle is launched, in front of the map's backdrop, while the field sleeps. Once it's over the field wakes where it was, takes the black away and fades back in; a lost battle goes to the title screen instead, until the Game Over screen (M4). The field's debug info reports the map's `encounters`, the `countdown` and whether it's `encountering`.
- **Overlays** run above Field. A focus stack decides which one gets input.

## Game state and saves

```ts
interface GameState {
  party: CharacterId[];                        // in battle order, 4 at most
  members: Record<CharacterId, MemberState>;   // level, EXP and equipment; M4 adds HP and MP
  inventory: Record<ItemId, number>;           // only items the party has
  gold: number;
  flags: Record<string, true>;                 // only flags that are set
  vars: Record<string, number>;                // only vars that aren't 0
  location: { map: MapId; x: number; y: number; facing: Direction };
  playTimeMs: number;
}
```

- `GameState` is plain JSON, owned by `src/core/state.ts`, and never changes in place: its fields are read-only and every operation returns a new state, so scenes read it and change it only through core functions: `createGameState`, `hasFlag`/`setFlag`, `getVar`/`setVar`, `itemCount`/`hasItem`/`addItem`/`removeItem`, `addGold`/`removeGold`, `inParty`/`joinParty`, `gainExp` and `equip`/`unequip` (see [Characters and stats](#characters-and-stats)), `setLocation` and `addPlayTime`. M4, which brings battles into the game, adds HP and MP, which carry over between battles, and `knownWeaknesses: Record<EnemyId, Element[]>`, what the party has learned of each kind of enemy.
- The operations check what they're given and throw a `RangeError` rather than break the state: IDs must be kebab-case, and flag and var names namespaced (`isId` and `isNamespacedId` in `src/core/ids.ts`); counts and gold are whole numbers; nothing can take items or gold the party doesn't have; and the party can't grow past 4. Unit tests (`state.test.ts`) cover each operation, and check that none changes the state it was given.
- **The game being played** is `session.state` (`src/systems/session.ts`). Scenes swap in what an operation returns: `session.state = setFlag(session.state, 'story.beacon-out')`. New Game replaces it with `startGame(NEW_GAME, DB)` (`src/core/party.ts`), which starts the party in their starting gear. The field keeps `location` in step with the player on every step, turn and arrival (except for the step into a way out, which can be off the map: until they arrive, the player is still where they last stood), and adds each frame's real time to `playTimeMs` (Phaser's `delta` is smoothed, and held to 1/60 s while the window isn't focused, so it uses `game.loop.rawDelta`, capped like every frame). Battles will count play time too; the title screen doesn't.
- **A save** (`src/core/save.ts`) is `{ version, savedAt, state }` as JSON: the version of the save format, when it was saved (ISO 8601; core can't read the clock, so it's passed in) and the game state. `parseSave` reads one back and trusts none of it: it must be JSON, with a version from 1 up that this game can read, a real time, and a state that `checkedGameState` (`state.ts`) accepts, which holds it to the rules the operations keep, field by field, and copies just the fields a state has. Anything else throws a `SaveError` saying what's wrong, and whether the save is `damaged` (or not a save at all) or `newer`, made by a newer version of the game.
- **Versions and migrations:** `MIGRATIONS` is a list of functions, oldest first, each bringing a save's state up a version, as plain JSON; `SAVE_VERSION` is one more than their count, so adding one bumps it. Any change to GameState's shape adds a migration, with a test (CLAUDE.md, rule 6). `src/core/save-fixtures/` holds a real save from every version, exported from the game's debug menu: each is a new game, saved in Tamsin's house after opening the chest. Version 2 gave party members equipment; its migration gives a version 1 Rowan (the only one who could be in the party) a Bronze Sword and Travel Clothes, what they now start with. `save.test.ts` loads each through the migrations, and fails until there's one for every version up to `SAVE_VERSION`. Prettier leaves them alone, so they stay exactly as exported.
- **The slots** (`src/systems/saves.ts`): the autosave and slots 1 to 3, in `localStorage` under `fifth-flame:save:{autosave,1,2,3}`. `saveSlots.read(slot)` never throws: a slot is empty, holds a save, or holds something that can't be loaded (damaged, newer, or somewhere this version of the game doesn't have: a map it lacks, or a cell off the map). `write` throws if the browser won't keep a save (storage full, or not allowed, which `localStorage` itself can throw for), except `autosave`, which only warns, as the game carries on regardless. `saves.test.ts` stands in for `localStorage`. Settings will be stored separately, under `fifth-flame:settings`.
- **Autosave:** every map change by a way out (a door, stairs, a warp or a map's edge) saves the game as the player arrives, before the map's enter script runs. A script's teleport waits for the script to end, so a cutscene is never saved halfway through. Debug warps, New Game and loading a save don't autosave.
- **Saving:** Menu on the field opens the save menu once the player is standing still with nothing running: pressed mid-step, it lets the step finish and stops the walk there (as if the direction had been let go), and it waits for a fade in. A script that starts first, from a touch or an auto trigger, wins. Until M5's main menu, Menu opens the save menu itself.
- **Loading:** the title's Continue opens the save menu to load, which swaps the saved state in (`loadGame` in `session.ts`) and starts the field where it was saved. That counts as arriving there, so the map's enter script runs, as it would have on arrival (scripts that should run once set a flag). Continue can be chosen once any slot holds anything, even a save it can't load, so the menu can say why.
- The debug menu can export a save to a file and import one, which helps when testing across devices, and lets a bug report come with its save (see [Debug hooks](#testing)).

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

**Schemas** (`src/core/schema.ts`) say what types can't: IDs are kebab-case (event scripts' are `area/name`), cells and counts are whole numbers in range, names aren't empty or padded with spaces, a chest holds an item or some gold but not both, a prefab has one doorway at most, a blob layout's neighbours read right, and nothing has a field it shouldn't. `CONTENT_SCHEMAS` lists the collections, each a record by ID (characters, skills, items, enemies, encounter tables, speakers, terrains, prefabs, maps, battle backdrops and event scripts), and the new game.

- **A new kind of content** adds its schema and its collection there, and takes its TypeScript type from the schema, read-only all the way down (`type ItemDef = ContentOf<typeof ItemSchema>`), so the two can't drift apart. `CharacterDef`, `SkillDef`, `ItemDef`, `EnemyDef`, `BackdropDef` and `Speaker` work this way. The map format's types came first, and the compiler is built on them, so they stay in `src/core/map/types.ts` and the map schemas are written to match them, as the new game's is to match `NewGame` in `state.ts`. Change such a type and its schema together: the schemas are strict, so content with a field its schema doesn't know fails validation.
- **Schemas only check.** They never fill in defaults or change what they check, as the game reads content just as it's written. Only the tools and the tests run them, so the game takes just the types from `schema.ts` and doesn't ship Zod (an ESLint rule keeps it so).
- **IDs are unique** by construction: TypeScript won't let an object literal name a key twice, and `MAPS` and `EVENTS`, which are built from lists, use `recordById` (`src/core/ids.ts`), which throws on a repeat. The game, the tests and `npm run validate` then all stop at once, naming the ID.

**`npm run validate`** (`tools/validate.ts`) checks, in order:

1. Every collection, and the new game, against its schema (`tools/content-checks.ts`). Each problem is a line saying whose it is, where and what's wrong: `Map saltmere: objects[3].wander should be at least 0, not -1`. The checks after this take the content's shape on trust, so they wait until it all matches; the asset checks run regardless.
2. The asset manifest against the files (see [Assets](#assets)), the maps (see [Maps](#maps)) and battle backdrops, which must compile and fill the screen (see [Battle screen](#battle-screen)), and the event scripts (see [Event scripts](#event-scripts)).
3. That everything content names exists: the terrains, prefabs and sheets the maps use, the scripts, speakers, portraits, people, spawns, items, characters, music and sounds the maps and scripts name (the characters a script's `joinParty` adds, say), the new game's map, characters and items, and that it starts on a cell the player can stand on (`checkNewGame`), and each character's starting gear and skills: the gear exists, is for the slot it's in and is something they can equip, and the skills they learn exist, at levels there are (`checkCharacters`); each enemy has a sprite sheet to fight as, `monster.<id>` in the asset manifest, and the skills enemies use exist, with target rules only on those aimed at one fighter (`checkEnemies`); the enemies in encounter tables exist (`checkEncounters`), and so do the encounter tables and backdrops maps name (`checkMapEncounters`); and the areas the simulator plays (`AREAS` in `balance.ts`) name a party, an encounter table, a boss, items and gear that exist, gear that fits whoever it's given to, and levels there are, no lower at the boss than on arrival (`checkAreas`). Each new kind of content adds its own: items in shops and drops.
4. That every map can be reached from where a new game starts (`checkReachable` in `tools/map-checks.ts`), through doorways, warps and map edges, or by a script a map runs teleporting the player, as the event checks find it can. The test maps (`test-*`), which only the tests and the debug menu go to, are left out.
5. That every name and description the menus, battles and the dialogue box show (characters', skills', items', enemies' and speakers') is in characters the body font has, and that the battle screen has room for its text: each character's name in the status panel, and the names of skills and of items that can be used up in their lists, with what they do in the help line (`checkBattleText` in `tools/text-checks.ts`, against `BATTLE_LAYOUT.room`). The other menus will say how wide their text may be when they come.

Each check also runs as a unit test on the real content, beside its tests on small fixtures.

**Skills** (`src/data/skills.ts`) have a name, a description, an MP cost, a rank and a target, and a kind. Physical and magical skills (ATK against DEF, MAG against RES) have a power and maybe an element, and target enemies; healing skills have a power, going by MAG, and target allies; support skills have only effects. Any skill can have **effects**, which items share: `delay` (push the target back in line by that much of its Normal delay), `status` (give one, maybe by chance), `cure`, `reveal` (Insight), `restore` (so much HP or MP), `revive` (with that share of HP), `damage` (so much, maybe of an element: bombs) and `escape`. The statuses, elements, reactions, ranks and targets are `src/core/battle/terms.ts`; what each does is the battle engine's to say (see [Battle engine](#battle-engine)).

**Items** (`src/data/items.ts`) have a name, a description and a kind: a `consumable` has a price, a target and effects, and using one is Quick; a `weapon` (of a kind: sword, axe, staff or dagger, maybe with an element for Attack), `armor` (light, heavy or robe) or `accessory` has a price and stat bonuses; and a `key` item has neither, so it can't be sold or used up. Prices are what shops charge; items sell for half. Messages name items with `itemName`.

**Enemies** (`src/data/enemies.ts`) have a name, stats that don't grow, as each kind is met at one strength, how they take each element they don't take normally (`weak`, `resist`, `immune` or `absorb`), whether they're a boss, and what they do (see Enemy behavior in DESIGN.md). Their `actions` are each Attack, Guard or a skill, with a `weight` (1 if not given), conditions (`when: { hpBelow: 0.5, every: 3, alliesBelow: 2, once: true }`, `once` for skills only), a `target` rule (`random`, `lowest-hp`, `highest-atk` or `healer`) for those aimed at one fighter, and `telegraph: true` for a skill announced a turn ahead. A boss's `phases` each start `below` a share of its HP, lower each time, with actions of their own. Enemies' skills are in `src/data/skills.ts`, with the party's. So far there's a wolf, which bites whoever's worst hurt and howls when left alone, and a draft of the Tide Caves' enemies, tuned with the simulator: the Cave Bat, Reef Snail, Grotto Octopus and Drowned Wisp, and their boss, the Drowned Warden. Each fights as `monster.<id>` in the asset manifest (see [Assets](#assets)); M4's rewards add their EXP, gold and drops.

**Encounter tables** (`src/data/encounters.ts`) list the groups of enemies an area's random battles are drawn from, each up to 6 enemies (left to right) with a `weight` (1 if not given). Maps name theirs (see [Maps](#maps)). So far there are the North Road's wolves, and the Tide Caves', which the simulator plays.

## Maps

Maps are written as ASCII so Claude can author, read and diff them. Saltmere's are drafts of the real thing: `saltmere` itself, Tamsin's house (`saltmere-tamsin`), the fisher's cottage (`saltmere-cottage`), and the lighthouse (`saltmere-lighthouse`) with its lamp room (`saltmere-lighthouse-top`); and out of the village to the north, the North Road (`north-road`), with wolves. The test maps (`test-shore` with a house to enter and a path east to `test-meadow`; inside, `test-house` and its `test-cellar`; and `test-square`, for trying out event scripts and their triggers) are small working examples that the tests rely on. A map, trimmed:

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

Event triggers (`touch`, `enter` and `auto` objects) are described under [Event scripts](#event-scripts). A map's `music` is the `bgm.*` track arriving there plays (see [Audio](#audio)); a map without one is silent. Saltmere's houses and lighthouse share the village's, which plays on as the player goes in and out, and so does the North Road for now; the test maps have none, so they're quiet. A map's `encounters`, `{ table, backdrop }`, give it random battles (see [Scenes](#scenes)): drawn from an encounter table in `src/data/encounters.ts`, and fought in front of a backdrop in `src/data/backdrops.ts`. Without them, there are none.

- **Terrains** live in `src/data/terrain.ts`, in three kinds:
  - **`fill`**: one tile everywhere, or weighted variants (plain grass with the odd tuft). A hash of the cell's position picks the variant, so it looks random but never changes.
  - **`blob`** (autotiled): a cell's tile depends on which of its 8 neighbours share its terrain, so water gets shorelines and paths get grassy edges. A corner only counts when both sides next to it do, which leaves 47 shapes; cells off the map count as the same terrain. The pack's grass-edged water, sand-edged sea and path blocks share one layout, `EDGED_BLOB`, worked out from the tiles' pixels. Water and paths have grass around their edges, so they belong on grass; the sea has sand around its edges, so it belongs on `sand`, which matches it exactly. There's no water tile for a lone cell, so ponds and channels need at least two.
  - **`trees`**: along each row, every two cells grow a 2-wide tree (picked from a list by position) and an odd cell out gets a 1-wide filler. A tree's trunk row stands on its cells, which are solid, and its canopy overhangs the row above, where characters can walk behind it.
- **Prefabs** are blocks of tiles drawn as one: trees, houses, doors and stairs, the lighthouse, the dock and the boat, lamps, furniture. Each character of a prefab's `layout` marks a tile: `#` solid, drawn under characters; `.` walkable, drawn under characters; `^` walkable, drawn over characters; `=` walkable whatever the terrain under it, drawn under characters (the dock out over the sea); `D` a doorway; a space for no tile. Tall furniture stands against a room's back wall, its top tile drawn over the wall. Maps place prefabs as `{ type: 'prefab', prefab, at, to?, script? }` objects, by their top-left cell. With `to`, the doorway is walkable and leads there, even when it's in a wall; without, it's solid. With `script`, facing any of its cells drawn under characters and pressing Confirm runs that event script (the test shore's `sign`).
- **Ways between maps** all lead to a named spawn: `to: { map, spawn }`. A map's objects include its spawns, `{ type: 'spawn', id, at, facing }`, where arrivals appear. Doors and stairs are prefabs with a doorway; `{ type: 'warp', at, to }` makes any walkable cell a way out; and a map's `edges` say where walking off each side leads (`edges: { east: { map: 'test-meadow', spawn: 'west' } }`). An edge with no entry is a wall, and every cell along an edge with one leads out, so give the map a gap in its border. Put spawns next to ways in, not on them, and clear of treetops so the player can be seen arriving.
- **Chests** are `{ type: 'chest', at, flag, item }` objects, or with `gold: 30` instead of an item. A chest blocks the way like a wall, and facing it from any side and pressing Confirm opens it (see [Scenes](#scenes)). Its `flag` is set once it's open, and keeps it open for good; each chest has its own, in the `chest.` namespace, named after its map and numbered (`chest.saltmere-tamsin-01`). Chests aren't renumbered when others are added, as saves keep their flags. The field draws them as sprites (`object.chest`, shut or open as the flag says) on the bottom of their cell, sorted with the characters.
- **People** are `{ type: 'npc', id, sprite, at, facing, wander?, script? }` objects: `sprite` names a character sheet (`sprite.<sprite>` in the manifest), `wander` is how many cells they may stray from `at`, and `script` is the event script talking to them runs. The compiler won't let one start on a solid cell, a way out, a spawn or another NPC.
- **Rooms** use the `house-wall` and `cellar-wall` terrains, from the pack's simple room frame. It has only the shapes a rectangle needs (four corners, four sides, solid wall), so their rooms must be rectangles with walls one cell thick; anything else won't compile. Saltmere's draft interiors use it, furnished with prefabs. The pack's fuller interior walls (`Interior/TilesetInterior.png`: walls drawn as lines, in four colours, with windows and arches) are still to be worked out.
- **The compiler** (`compileMap` in `src/core/map/compile.ts`, pure and unit-tested) turns a map into three layers, `ground`, `base` (trunks, walls) and `overhead` (treetops, roof tops), plus a `solid` grid. `isBlocked(map, x, y)` answers whether a cell can be walked into (off the map is blocked unless that edge leads somewhere), `isOutOfBounds(map, x, y)` whether it's off an edge that leads nowhere (the one wall noclip doesn't open), `exitAt(map, x, y)` where stepping into it leads, `scriptAt(map, x, y)` the script examining it runs, and `chestAt(map, x, y)` the chest standing there. Anything that doesn't fit throws an error naming the map and the cell: an unknown character, ragged rows, a shape with no tile, a prefab off the map or on top of another, a spawn or warp on a solid cell, two spawns with one ID; a chest whose flag isn't like `chest.saltmere-01` or is another chest's on the map, that holds an item and gold both or gold that isn't a whole number from 1 up, or that isn't on open ground clear of ways out, spawns, people, touches, scripts and other chests.
- **The field scene** draws the layers as a Phaser tilemap (`src/systems/tilemap.ts`). Every tile sheet a map uses becomes a tileset with its own range of tile IDs, so any layer can mix sheets. Characters are drawn between `base` and `overhead` (see `DEPTH`), the debug collision view over everything, and the world camera is zoomed 2×.
- **`npm run validate`** compiles every map, checks that every tile a terrain or prefab names is inside a 16×16 sprite sheet from the asset manifest, that every way out leads to a spawn that exists, that every NPC's sprite is a character sheet, that every map's music is a `bgm.*` sound in the manifest, that no two chests share a flag, on any map, that every map's name fits where the save menu shows it (measured with the body font, as event lines are), and that every map but the test maps can be reached from where a new game starts (see [Content data](#content-data)). `src/data/maps/maps.test.ts` also checks that the layout covers all 47 shapes.
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
  ev.giveItem('potion', 3);
  ev.setFlag('story.tamsin-gift');
});
```

- **Where they live:** a file per area in `src/data/events/` exports its scripts by name, and `src/data/events/index.ts` registers each as `<area>/<name>` in `EVENTS`, its name turned kebab-case (`lighthouseSign` in `saltmere.ts` is `saltmere/lighthouse-sign`; the test maps' are `test/tamsin`, `test/sign` and so on). Maps name them in an NPC's or prefab's `script`, or in a trigger (below).
- **Speakers** (`src/data/speakers.ts`) are who `say` names: the name in the box's tab, and a portrait if they have one. A speaker with an empty name, `sign`, is for signs and narration.
- **`EventContext` v1** (`src/core/events.ts`). Verbs that happen on screen return promises that resolve once they're done; verbs that read or change the game state are immediate.
  - On screen: `say(speaker, text)`; `choice(options)` (one to four, under the last line said; it resolves with the index picked); `wait(ms)`; `face(actor, toward)`, where an actor is `player` or an NPC on the map by its ID, and `toward` is a direction or another actor; `move(actor, route)`, a list of directions walked a step at a time (NPCs at their wandering pace, the player walking), which fails the script if a step is into a wall, someone else or off the map; `fadeOut(ms?)` and `fadeIn(ms?)`, to black and back (the map fade's 250 ms by default); and `teleport(map, spawn)`, which goes through black like a door, or if the screen is black already, stays black for the script to fade back in. Two don't wait: `bgm(track)` crossfades to a `bgm.*` track, or with null fades out, until the player next arrives on a map, which plays its own; and `sfx(sound)` plays an `sfx.*` sound effect.
  - The game state: `flag`/`setFlag`, `var`/`setVar`, `hasItem`/`giveItem`/`takeItem`, `gold`/`giveGold`/`takeGold` and `joinParty` (in their starting gear), done with the operations in `state.ts`, so they check what they're given just as those do. They're silent: a script that gives an item says so itself.
  - Still to come, as content needs them: `emote`, `cameraPan`, `heal` (M3, with HP), `battle` (M4), `shop` and `inn` (M5), and `savePrompt`, should content ever offer to save (the menu saves for now). Keep each one small, and test it against a fake stage.
- **How they run:** `createScriptContext(stage, store, db)` (`src/core/script-context.ts`) makes a script's context from a `Stage`, the on-screen verbs, a `StateStore`, where the game state lives, and the content. The field is the stage, and `session.state` the store; unit tests use a fake stage that answers at once and writes down what it was asked (`script-context.test.ts`). The field runs one script at a time, and while it runs, the player can't move or open the save menu, and NPCs stand still, except as the script walks them (`walkRoute` in `src/core/route.ts`, unit-tested). A script that fails logs an error and ends, and the game carries on. A teleport starts the field over on the new map with the script still running, so the map's NPCs are back where they started. If a script ends with the screen black, it fades back in. `__game.run(id)` runs any script on the field, in dev and test builds.
- **Triggers** set scripts off: `interact` (an NPC's or a prefab's `script`, by facing it and pressing Confirm), and three map objects. `{ type: 'touch', at, script, when? }` runs when the player stops on its cell: a walk stops there, as at a way out, and arriving by a door or teleport doesn't count. It must be on a walkable cell that isn't a way out. `{ type: 'enter', script, when? }` runs on arriving on the map; when a script's teleport brought the player, it waits for that script to end. `{ type: 'auto', script, when }` runs as soon as `when` holds, with nothing else running and the player standing still; it runs at most once a visit, so its script should set a flag that makes `when` false, or it runs again the next time the player comes back. Where a map has several of a kind that could run, the first in its list whose condition holds does.
- **Conditions** (`src/core/conditions.ts`) are flags: `'story.beacon-out'` holds when that flag is set, `'!story.beacon-out'` when it isn't, and a list holds when all of it does. The map compiler rejects one that names something that isn't a flag.
- **Checked by `npm run validate`** (`tools/event-checks.ts`): every script a map's NPC, prefab or trigger names exists, and every speaker's portrait is an image in the manifest. Every script runs against a stand-in context that answers at once, once for each map that runs it, down every path it can take: a path is an answer to each question it asks, which choice the player picks, whether a flag it hasn't set itself is set, whether the party has an item or has gold (lots, so a checked purchase works). A run that asks more than 10 questions stops there, so a script that asks in a loop still finishes. Each chest's script runs the same way, on its map, so what it says opened and empty is measured like any line, and an item that doesn't exist (one `itemName` doesn't know) fails it. Each run must finish, only name speakers that exist, only check for, give and take items that exist, only move and turn people who are on the map it's on (a teleport changes which), only teleport to spawns that exist, only offer 1 to 4 choices, only wait and fade for real lengths of time, and only play music and sound effects that are in the asset manifest. It also measures the text with the real body font: every line must fit its box in three lines (narrower beside a portrait), every choice must fit the choice box, and the font must have every character (no curly quotes). In Node there's no canvas, so `tools/png.ts` decodes the font image and `tools/font-metrics.ts` measures it with the same rules as the game. The checks also report where each map's scripts can teleport the player, for the check that every map can be reached.

## Characters and stats

- **Characters** (`src/data/characters.ts`): who can be in the party, Rowan, Bram, Liora and Cass, each with a name, every stat at level 1 and at level 30, the kind of weapon they fight with and the kinds of armor they wear, the gear they join in, and the skills they learn: at a level, or once a story flag is set (Rowan's Tide Edge, `story.tide-spark`). `characters.test.ts` holds their stats to their roles in DESIGN.md at every level: Bram has the most HP and DEF and the least SPD, and so on.
- **Equipment** (`src/core/equipment.ts`): each member has a weapon, an armor and an accessory slot. `slotOf(item)` says which an item goes in, and `canEquip(character, item)` whether a character can wear it: a weapon of their kind, armor of a kind they wear, or any accessory. `equip(state, id, item, db)` (`state.ts`) takes the item from the inventory and puts what was in its slot back, and `unequip(state, id, slot)` puts it back too. Someone joining wears their starting gear without it coming out of the inventory: `joinParty(state, id, equipment)` takes it, and `recruit(state, id, db)` and `startGame(start, db)` (`src/core/party.ts`) give each character theirs. A script's `joinParty` recruits.
- **A member's stats and skills** (`party.ts`): `memberStats(state, id, db)` is their level's stats with their equipment's bonuses, and `knownSkills(state, id, db)` the skills they've reached the level for or whose flag is set, in their menu's order.
- **Stats** (`src/core/stats.ts`, pure and unit-tested) are whole numbers, rounded down. `statsAtLevel(growth, level)` grows each stat evenly from its level 1 value to its level 30 one. `withEquipment(stats, bonuses)` adds each piece's bonuses (or penalties), none below 0, and `withBuffs(stats, buffs, BUFF_MULTIPLIERS)` multiplies the stats that are up or down, of ATK, DEF, MAG and RES. A fighter's stats in battle are `withBuffs(withEquipment(statsAtLevel(…), …), …)`; the menus show them without buffs.
- **Levels** (`src/core/levels.ts`): `expToReach(level, curve)` is the EXP it takes in all to reach a level, and `levelForExp(exp, curve)` the level that much EXP brings. The curve's constants are tuning, `EXP_CURVE` in `balance.ts`, and `balance.test.ts` checks that each level takes more EXP than the last. `gainExp(state, id, amount, curve)` (`state.ts`) adds EXP to a member and levels them up as far as it reaches, several levels at once if need be, and never down.

## Battle engine

Pure, synchronous and deterministic, in `src/core/battle/` (the rules are Battle system in DESIGN.md):

```ts
startBattle(setup, state, db, tuning, rng): BattleState  // the party, from the game state, against setup.enemies
applyAction(battle, action, rng): { battle: BattleState; events: BattleEvent[] }
previewTurnOrder(battle, pending?: Action, count = 10): FighterId[]
checkCommand(battle, command), checkAction(battle, action): string | undefined  // why not, if not
targetChoices(battle, command): FighterId[]
aimOf(battle, command): Target  // its user, or one or all on either side
targetsOf(battle, action): FighterId[]  // whom it would work on, for menus to show
fleeChance(battle): number
chooseEnemyAction(battle, rng): Action  // what the enemy whose turn it is does (ai.ts)
choosePartyAction(battle): Action  // what the simulator's party member whose turn it is does (party-ai.ts)
```

- **A battle** is a `BattleState` (`battle.ts`): plain data that never changes in place, like the game state. It holds the fighters (the party in battle order, then the enemies left to right); whose turn it is (`active`, null once it's over); the `outcome` (`ongoing`, `victory`, `defeat` or `fled`); the party's inventory, which items are used up from; the elements the party knows each kind of enemy's reaction to (`known`); whether there's a boss; how many turns have started; and the rules it runs by, the tuning and the skills, items and enemies, so nothing after `startBattle` needs the content.
- **Fighters** (`fighter.ts`) carry their stats with equipment (buffs apply as the stats are used), HP, MP, CT, statuses with the turns they have left, whether they've been staggered since their last turn, their reactions to elements, their Attack's element, their skills (an enemy's are those its actions use), the skills they've used (for `once`), a boss's phase, and a skill they've telegraphed. A party member is their character's ID; an enemy is its ID and a letter, `wolf-a`, named Wolf A when there's more than one of its kind. HP and MP start full until M4 carries them over from the game state.
- **Turns:** `startBattle` starts the first turn. `applyAction` plays the action of whoever's turn it is, ends their turn (their CT becomes the action's delay, and statuses on their last turn wear off), and carries on to the next turn that needs an action. As each turn starts, that fighter's CT passes for everyone, Guard ends, statuses count down, Poison and Regen tick, and a sleeping fighter's turn passes them by. So the battle scene and the simulator only ever deal with decisions. An action the fighter can't take throws a `RangeError` saying why; `checkCommand` and `checkAction` say the same without throwing, for menus to grey things out, and `targetChoices` lists who a command can be aimed at (Provoke narrows it).
- **Events** (`events.ts`) say what happened, in order: `turn`, `action`, `miss`, `damage`, `heal`, `mp`, `status-added`, `status-removed`, `status-resisted`, `stagger`, `delay`, `reveal`, `ko`, `revive`, `phase`, `asleep` and `flee`. A telegraph is an `action` of its own (`{ type: 'telegraph', skill, target }`), which does nothing yet; the skill comes as the enemy's next action. They're the only thing `BattleScene` reads to animate, and all a log needs.
- **The preview** plays out only the timeline: the pending action's delay and what it does to CTs (Delay, Haste, Slow, staggers on weaknesses the party knows, revivals), then everyone taking Normal actions, except that a telegraphed skill takes its own rank.
- **The enemy AI** (`ai.ts`) picks, by weight, from the enemy's actions (its phase's, for a boss) whose conditions hold and that `checkCommand` and `targetChoices` say it can take, or attacks; then picks a target by the action's rule from `targetChoices`, so Provoke wins. A telegraphed skill comes back as the enemy's next action. It draws on the battle's Rng: once for the action, and once more for a target picked at random. `damage` moves a boss into a phase as its HP falls, with a `phase` event.
- **The party AI** (`party-ai.ts`) is the simulator's player, as Levels in DESIGN.md describes it: it tries reviving, healing, guarding, a known weakness and a skill on every enemy in turn, and otherwise attacks the enemy with the least HP. It takes only what `checkAction` allows, aims only where `targetChoices` says, and draws nothing from the Rng, so it always does the same in the same battle.
- **The rules' pieces** are pure functions with their own tests: `turn-order.ts` (delays and tie-breaks), `damage.ts` (the formulas and multipliers) and `statuses.ts` (durations, opposites, ticks, and the start and end of a turn).
- **Tuning** is `BATTLE_TUNING` in `balance.ts`: the delay constants and ranks, first turns, Haste and Slow, the element multipliers, critical hits, Guard, buffs, the variance, the damage cap, Stagger, Poison, Regen, Blind, how long each status lasts, and the flee chance.
- **Randomness** is drawn in a fixed order, so a seed replays a battle exactly: one roll per fighter for their first turn, party first; the enemy AI's rolls, before its action; then, for each target of an action in turn, Blind's roll, the critical hit roll (physical hits) and the variance; a status's chance; and Flee's roll.
- **Tests** use the small content in `fixtures.ts`, with tuning that leaves nothing to chance (no variance or critical hits, and first turns after exactly a Normal delay), so damage and turn orders can be worked out by hand. `battle.test.ts` covers each rule and `ai.test.ts` the AI; `play.test.ts` plays 250 battles at random, 250 more with the enemies following their AI and 250 with both sides following theirs, checking after every action that the rules still hold, that the AI only did what it could, and that the preview foretold the turns that came; and `src/data/battle.test.ts` fights with the real content and tuning.

**The simulator** (`npm run sim`, `tools/sim.ts`) plays battles to their end with both sides following their AI. For each area in `AREAS` (`balance.ts`) it plays every group in the area's encounter table 200 times with the party as it arrives (`arrival`: its level, gear and items), and the boss 200 times with the party as it reaches it (`atBoss`). For each it prints how likely the group is, the share of battles won, how many rounds the wins took on average (a round is a turn for each party member) and the share of the party's HP left after them. Then it lists anything outside `SIM_TARGETS` (`balance.ts`, the targets in Levels in DESIGN.md) and exits 1 if there's any. Every battle is played from a seed of its own, so a report only changes when the content, the tuning or the rules do. Run it after every balance or content change; it takes a couple of seconds.

- **One battle, turn by turn:** `npm run sim -- --log wolf,wolf` plays the first area's party as it arrives against those enemies and prints what happens, a line to a turn. `--boss` plays the area's boss with the party as it reaches it, and `--area`, `--level` and `--seed` choose the area, the party's level and the seed (1 if not given). `--battles 500` plays more of each in the report, and `--help` lists the options.
- **The pieces:** `tools/simulate.ts` plays and sums up battles (`partyAt` makes the game state for a checkpoint, `playBattle` plays a battle, `simulate` a number of them and `simulateArea` an area), and `formatArea` lays the report out; `tools/battle-log.ts` tells a battle from its events. Both have tests on the fixtures' content.

## Battle screen

`BattleScene` (`src/scenes/battle.ts`) shows a battle the engine plays; everything about what happens is the engine's to decide (see [Battle engine](#battle-engine)). Its camera is zoomed 2×, like the world's, so the scene is laid out on a 320×180 screen of its own pixels.

- **Layout** (`BATTLE_LAYOUT` in `src/ui/battle-layout.ts`, pure and unit-tested): the backdrop fills the screen; the timeline goes across the top, the banner just under it; the enemies stand spread across the left, closer together the more there are and every other one further forward, and the party in a column on the right, every other one a step forward. The command window and the party's status sit along the bottom, together where the dialogue box goes, so the touch controls keep clear of them. `BATTLE_LAYOUT.room` is how wide its text may be, which `npm run validate` checks (see [Content data](#content-data)).
- **Backdrops** (`src/data/backdrops.ts`): small maps of the field's terrains and prefabs, written like any map, 20 cells across and 12 down so they fill the screen. `compileBackdrop` (`src/core/map/backdrop.ts`) compiles one with the map compiler, and the scene draws it as a tilemap. So far there's a meadow by a wood, and a beach.
- **Fighters:** party members are their field sprites, facing left at the enemies, in poses from their sheets (`BATTLE_POSES` in `src/systems/character-frames.ts`): standing, walking, striking, using something, leaping for joy and down. Enemies are `monster.<id>`, a strip of frames facing right that loops. Everyone stands on their feet, with the pack's shadow under them, and those lower on screen in front.
- **A turn:** whoever's turn it is chooses through the command menu, or follows their AI (`chooseEnemyAction`), and the action goes to `applyAction` at once. The events it hands back then play out one at a time: a party member steps forward as their turn starts, and lunges at what they hit or holds up what they use; an enemy springs forward or glows; the banner names a skill or item, or says a telegraph is coming; an effect plays over each target (`src/ui/battle-effects.ts`: a slash from the party and claws from enemies for plain hits, each element's own, sparkles for healing and helpful statuses, an aura for harmful ones, a shield for Guard); hits flash and shake their target, numbers and words rise over them (Miss, Critical!, Weak, Stagger!, Delay, a status's name), staggers and delays knock them back, and the KO'd drop or fade away. A boss changing phase flashes red and shakes the screen. Then the next turn's choice comes.
- **The screen lags behind the battle**, which the engine has already moved on, so it shows a `BattleView` (`src/ui/battle-view.ts`, pure), which `applyEvent` brings up to each event as it plays, so HP drops as the number appears. A unit test plays 150 battles at random and checks, after every action, that its events bring the view up to the engine's state.
- **The command menu** (`src/ui/battle-menu.ts`, pure and unit-tested): Attack, Skill, Item, and Guard and Flee side by side. Skill and Item open lists in the status panel's place, two to a row, scrolling, with each skill's MP cost or each item's count, and what it does in the banner; what can't be used now is greyed out (`checkCommand`, `targetChoices`, `targetsOf`). Attack, and a skill or item aimed at one fighter, go on to choosing a target among those it can be aimed at, with a ▼ over them and their name in the banner: the first enemy, or the ally worst hurt. One that works on a whole side, or its user, shows everyone it will reach, to confirm. Guard and Flee are taken at once; Cancel steps back. Every way the cursor moves wraps round.
- **The timeline** (see Turn order in DESIGN.md) is two parts. `src/ui/battle-timeline.ts`, pure and unit-tested, says what it shows: `timelineOf(battle, pending?)` is whose turn it is and the next `TIMELINE_TURNS` (10), from the engine's `previewTurnOrder`, with a `telegraph` mark on the turn a readied skill comes on; `changedSlots` compares a preview with the order before it, turn by turn, for the highlights; and `playTimeline(before, action, result)` says what the timeline becomes at each event of an action as it plays out: the action as the preview foresaw it, a stagger it couldn't foresee (from the preview again, with the weaknesses the action revealed known), the KO'd taken off, and a turn gone at each `turn` event, until the last brings the battle as it stands. A random-battle test checks it keeps up with every turn. `previewAction(menu, battle)` (`battle-menu.ts`) is the action the menu previews: what Confirm leads to, aimed where the cursor is or will start. `src/ui/timeline-strip.ts` draws it: a tile per turn, the fighter's icon in a frame (orange for whoever's turn it is, then blue or red by side, cream or gold where the preview changed it, white-edged then), a letter badge for enemies of a kind and a red ! badge for a telegraph. When it changes, `slotOrigins` follows each fighter's turns in order, so tiles slide to their new places (`BATTLE_PACING.slide`), new ones fade in and those gone fade out; the turn that's just gone slides off to the left. Icons are cut from the first frame of each fighter's sheet as a frame of its own (`timeline-icon`): `iconWindow` takes a 16×16 square across the middle and at the bottom of a bigger frame, or where the sheet's `icon` says its face is (see [Assets](#assets)).
- **The panels** (`src/ui/battle-panels.ts`) are the pack's choice box, nine-sliced, in ink on cream like the save menu: the banner; the command window; and the party's status, a line each: the name (brown for whoever's turn it is, faded for the KO'd), HP with a gauge under it that turns red at a quarter, the MP left, and up to two status tags (helpful in green, harmful in purple, `BATTLE_TEXT.statuses` in `src/data/ui-text.ts`). A red ! hangs over an enemy that has telegraphed.
- **The end:** a win or a loss says so in the banner and waits for Confirm (▼); a party that gets away runs off in a puff of smoke. Then the screen fades out and `onEnd` gets the result and the battle as it was.
- **Pacing** is `BATTLE_PACING` in `balance.ts`, sped up by `settings.battleSpeed` (1 to begin with), which scales the scene's tweens, timers and animations. The Options screen (M5) will offer 1×, 2× and 3×; `__game.battleSpeed(4)` is what the e2e tests play at.
- `__game.inspect('battle')` reports the menu's page and what's under the cursor, the banner, the timeline (each turn's fighter, and whether it's marked or highlighted), the status lines, the words and numbers that have popped up, and each fighter as shown, with where they stand. `tests/e2e/battle.spec.ts` plays battles with it.
- **Battle music:** a battle plays `BATTLE_MUSIC` (`bgm.battle`) from the start, pausing whatever was playing, and once it's over, after the fade out, that carries on (see [Audio](#audio)). A preemptive strike or an ambush says so in the banner as the battle starts.
- **Not yet:** rewards, carrying HP, MP and items used back to the game, Game Over, sounds, and the options for battle speed, screen shake and flashing (crits shake the screen, and hits flash).

## Input

- Logical actions: `up`, `down`, `left`, `right`, `confirm`, `cancel`, `menu`, `run`. Keyboard, gamepad and touch all map to these, and game code never reads raw keys.
- Holding a direction in a menu repeats after 300 ms, then every 80 ms.
- Code lives in `src/systems/input/`: `actions.ts` (actions, key bindings, gamepad mapping), `action-state.ts` (held / pressed / pressedOrRepeated; pure and unit-tested), the touch controls (below) and `game-input.ts` (the `input` singleton, which reads every device once per frame before scenes update). Scenes ask things like `input.pressedOrRepeated('down')`.
- **Touch controls** (`touch-controls.ts`, styled by `touch-controls.css`) are page elements laid over the game inside `#game`, not part of the canvas, so they can use the space beside the game and size themselves in CSS pixels. They show in *touch mode*, the `touch` class on `<html>`: on from the start where the main pointer is coarse (`prefersTouch()`), or from a laptop touchscreen's first touch. The d-pad follows the thumb that pressed it until it lifts (pointer capture, `dpadDirection()` with a dead zone in the middle and some hysteresis at the diagonals), and each button stays down until every finger on it lifts, so several fingers work at once. B holds both `cancel` and `run`, like a gamepad's B. Taps shorter than a frame are latched like key presses. Touching the game itself does nothing.
- **Layout** is `layoutTouchControls()` in `touch-layout.ts`, pure and unit-tested: whole-number art scales from the view's height, clear of the notch and rounded corners (`env(safe-area-inset-*)`, read through a probe element), in the bottom corners, all lifted to just above the dialogue box (`DIALOGUE_BOX_ON_SCREEN`) when any would cover it. It reruns whenever the game's container changes size, as the game itself refits. Turning the phone upright, or leaving the page, lets go of every control.
- **Held upright** in touch mode, CSS hides the controls and shows the "turn your phone sideways" hint (its text is in `src/data/ui-text.ts`) over everything.
- **Always run** is `settings.alwaysRun` (`src/systems/settings.ts`): the field runs when Run is held, or when it isn't with always run on. `main.ts` turns it on for touch-first devices. Settings live in memory until the Options screen (M5) keeps them.
- A press shorter than a frame still counts: key presses and touches are latched until the next frame reads them. A second press counts too, even when it comes so soon after the first that both frames saw the key down: the frame gets the actions pressed since the last one (`fresh` in `ActionState.update`), not counting the keyboard's own repeats. Dialogue needs this, as getting through a line can take two quick presses.
- Gamepads use the browser's "standard" button layout. Headless browsers have none, so `tests/e2e/input.spec.ts` swaps in a fake pad through `navigator.getGamepads`. E2E tests hold inputs for a couple of frames (see `nextFrames()` there) rather than polling, so auto-repeat can't race them. `tests/e2e/touch.spec.ts` plays a touchscreen phone (Playwright's `hasTouch` and `isMobile`) and puts fingers down and lifts them through Chromium's DevTools protocol (`Input.dispatchTouchEvent`), several at once.

## Audio

- **`audio`** (`src/systems/audio.ts`) plays the music and the sound effects, through Phaser's sound manager (Web Audio, where music loops without a gap). `main.ts` installs it on the game, and it keeps the music in step every frame, whatever scene is running, so a crossfade carries on through a map change.
- **Music:** `audio.playMusic(key | null)` crossfades to a `bgm.*` track, or with null fades out to silence, over `MUSIC_FADE_MS` (1 s, in `balance.ts`). Asking for the track already playing lets it play on, and one still fading out fades back in from where it is. Which tracks are heard and how loud is the music mix (`src/systems/music-mix.ts`), pure and unit-tested; the manager starts a track as it joins the mix and stops it once it has faded out of it.
- **Where music comes from:** the title screen plays `bgm.title`; a map plays its `music` on arrival, by any way in, a teleport included (see [Maps](#maps)); and a script's `bgm` changes it until the next arrival (see [Event scripts](#event-scripts)). A battle's music interrupts it: `audio.interruptMusic(key)` pauses every track playing where it is and plays the battle's at once, and `audio.resumeMusic()` stops it and brings back what it paused, from where it was, fading up from silence (`resumed` in `music-mix.ts`). Music asked for in between changes what comes back. `__game.audio()` reports the tracks `paused`.
- **Sound effects:** `audio.playSound(key)` plays an `sfx.*` sound over the music, at most once per `SOUND_REPEAT_MS` (50 ms) per sound, so a fast cursor doesn't stack its clicks. A chest plays `sfx.chest` as it opens, drawn open; one already open on arrival is quiet.
- **Volumes** are `settings.musicVolume` (0.6) and `settings.soundVolume` (0.8), read every frame, so the Options screen (M5) can change them live.
- **Unlocking:** browsers keep audio silent until the player first presses a key or touches the screen. Phaser's Web Audio sound manager listens for that on `document.body` (`touchstart`, `touchend`, `mousedown`, `mouseup`, `keydown`) and resumes the audio; nothing in the game stops those events on their way. Until then, music waits at the start of its fade, so the title music starts from the top and fades in on the first input, and sound effects are skipped rather than all going off at once. Phaser waits for that first input even where the browser wouldn't (headless Chromium, say), since it checks the moment its audio starts, before the browser has let it run; so the e2e tests see the lock too. A gamepad press doesn't count as an input in browsers, so someone playing only with a gamepad hears nothing until they touch a key or the screen. A sound that fails to load (a browser that plays neither file, a dropped connection) stays quiet, and the game carries on.
- `__game.audio()` reports the music asked for, every track heard with its level and volume, how many times a track has started from the top, and the latest sound effects. `tests/e2e/audio.spec.ts` checks that the title music waits for the first key press, a crossfade, music playing on indoors, silence, the chest's sound, a script's music and sound, and the game playing on with its sounds blocked.

## UI kit (`src/ui/`)

`Window` (9-slice frame), `Menu` (list or grid with cursor, scrolling, disabled items and help text), `TextBox` (typewriter text, name and portrait, ▼ prompt), `ChoiceBox`, `Gauge` (HP, MP, EXP), `Timeline` (the CTB strip), `NumberPop` (damage numbers) and `FocusStack` (which widget has input). Every menu in the game is built from these. So far there are the dialogue box and the choice box (`src/ui/dialogue-box.ts`, run by `src/ui/dialogue-flow.ts`), the save menu (`src/scenes/save-menu.ts`, run by `src/ui/save-menu-flow.ts`), whose slots are nine-sliced from the choice box's art, the battle's windows (`src/ui/battle-panels.ts`, run by `src/ui/battle-menu.ts`) and its timeline (`src/ui/timeline-strip.ts`, showing what `src/ui/battle-timeline.ts` works out; see [Battle screen](#battle-screen)).

## Testing

| Layer | Tool | Covers |
|---|---|---|
| Rules | Vitest | Formulas, CTB order, statuses, inventory, equipment, EXP, saves and migrations, event scripts against a fake context |
| Content | `npm run validate` (also run as a test) | Every collection against its schema; the asset manifest against the files; the maps, and the event scripts and speakers, with every line and choice measured to fit; that everything content names exists; and that every map can be reached |
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

So far it has `activeScenes()`, `startScene(key, data?)` (which first stops every scene that's running, paused or asleep), `inspect(sceneKey)` (the field, a battle, the dialogue box, the save menu and the debug menu all report what they show), `warp(map, x, y, facing?)`, `held()` (the actions the game read as held this frame), `noclip(on)` and `showCollision(on)`, the debug menu's switches, for the game state `state()`, `setFlag(flag, on?)` and `give(item, count?)`, `run(script)`, which runs an event script on the field, `audio()` (see [Audio](#audio)), `join(character)`, which has someone join the party, `battle(enemies, options?)`, which starts a battle over nothing, with the party as it is, in front of a backdrop (`meadow` unless it says), from a seed (the clock's, unless it gives one), and goes to the field once it's over, `battleSpeed(speed)`, and `encounters({ rate?, countdown?, seed? })`, which sets the Encounter rate, the countdown to the next random battle and the seed they're drawn from, and says how they stand; the rest arrive with the features they test. `installDebugHooks` also registers the debug-only scenes: `asset-gallery`, which shows every character sheet in all four directions and the portraits, at the world's scale (`__game.startScene('asset-gallery')`), and the debug menu. `src/main.ts` installs all of it only when `import.meta.env.DEV` is true or the build mode is `e2e`, so production builds drop it entirely, and `npm run build` runs `tools/check-bundle.mjs` afterwards, failing the build if `__game` or a debug scene ever leaks in. Tests get its types with `import type {} from '../../src/debug/api'`.

The **debug menu** opens with the backtick key, or three fingers on the game on a touchscreen (fingers on the touch controls don't count), and the same again closes it. It's an overlay scene, `debug-menu` (`src/debug/debug-menu-scene.ts`), added last so it draws over everything. Whatever was running pauses under it until it closes, and closing and warping wait for the next frame, so the scenes that carry on never see the press that did it. Up and Down move, Confirm chooses, and Cancel goes back a page, or closes the menu from the first. `DebugMenu` (`src/debug/debug-menu.ts`) keeps the open page and the cursor, and `src/debug/debug-pages.ts` builds the pages; both are pure and unit-tested. It has:

- **Warp to a map:** every map in `MAPS`, then one of its spawns. A map with no spawns is listed, but can't be chosen.
- **Start a battle:** every group in every encounter table, each area's boss, and each other enemy in a pair, as wolves come (`debugBattles` in `src/debug/debug-pages.ts`), in front of the area's backdrop: the Tide Caves' battles are on the beach until the caves have one of their own.
- **Join the party:** anyone with a sprite to fight as who isn't in the party yet (so far, Bram), at level 1 in their starting gear.
- **Noclip:** the player walks through walls, water and people. Ways out still work, and an edge that leads nowhere still stops them.
- **Show collision:** marks over the field, on every map until it's turned off: solid cells darkened and ringed in red, ways out in blue (with a blue bar along any edge that leads somewhere), spawns as green rings with a dot, and the cells people take up as orange rings (`src/systems/collision-view.ts`).
- **Encounter rate:** Off, Low, Normal or High, the next each time it's chosen; the Options screen will offer it in M5.
- **Export a save:** every slot, with where and how long it's been played; choosing one that holds anything (even a damaged save) downloads it as `fifth-flame-slot-1.json` (or `fifth-flame-autosave.json`), indented for reading.
- **Import a save:** choosing a slot opens the browser's file picker, and the file picked replaces what's in the slot, brought up to date, once it's checked like any save; a file that isn't one, or can't be loaded here, leaves the slot as it was. Browsers only open a file picker just after a key press or a touch, so a gamepad can't import (`src/debug/save-files.ts`, `src/debug/debug-saves.ts`).

What just happened, like "Exported Slot 1." or why an import failed, shows at the bottom in place of the controls' hint, until the cursor next moves (`notify` in `DebugMenu`); an import's arrives once the file has been picked. Noclip and Show collision are `debugSwitches` (`src/systems/debug-switches.ts`), which the field obeys. Only the debug menu and `__game` turn them on, and production builds have neither, so there they stay off. **Encounter rate** goes round Off, Low, Normal and High, which `settings.encounterRate` keeps until the Options screen (M5) offers it. Later milestones add levels and gear, and 4× battle speed (M4).

## CI/CD

- `.github/workflows/ci.yml` runs on every push to `main`, every PR, and on demand: `npm ci` → `npm run check` → build → Playwright smoke test. It uploads screenshots and reports as the `e2e-results` artifact.
- Its deploy job runs only for pushes to `main`, and only after the checks pass: build → GitHub Pages. One workflow, so a failing build can never deploy. Vite's `base` is `./`, so the same build works at `/game/` and anywhere else.
- Cloud sessions can't reach `tim39.github.io`, so confirm a deploy from the run's "Deploy to GitHub Pages" job instead.
- Later, optionally: preview builds for PRs, so the owner can play a branch before merging it.

## Assets

- **Raw packs live in this repo's GitHub Releases, one release per pack, never in git.** GitHub's web uploader stops at 25 MB and cloud sessions can't reach itch.io, but they can download release files. **`npm run fetch-assets`** downloads each pack listed in `tools/fetch-assets.ts`, checks its SHA-256 and unzips it to `assets-src/<pack>/` (gitignored), dropping the zip's top-level folder. Re-running it skips packs that are already there. It needs `curl` (which uses the cloud proxy) and `unzip`. To add a pack, attach it to a new release and add a line to that list with its hash.

- Files the game actually uses are copied to `public/assets/{tiles,sprites,portraits,monsters,ui,fonts,vfx,bgm,sfx}/` and registered under logical keys (`sprite.rowan`, `bgm.town-saltmere`) in **`src/systems/asset-manifest.ts`**. Game code only ever uses the keys.
- **Battle art:** each enemy is `monster.<enemy id>`, a strip of the frames it loops through, facing right: the pack's monster sheets have a column for each way they face, so our copies keep just the one facing right, side by side (see CREDITS.md). Each fighter's icon on the battle timeline is a 16×16 square (`ICON_SIZE`) cut from the first frame of their sheet, across the middle and at the bottom of a bigger frame; a sheet whose frames are much bigger says where the face is with `icon` (the Drowned Warden's, `frames(…, 96, 48, { x: 40, y: 8 })`). Effects are `vfx.*` sheets, each played once over a fighter; the pack has no wind effect, so wind is its white wisps tinted green, and gloam its smoke tinted violet.
- **Keys say what a file is for; file names say what it is.** `sprite.rowan` loads `sprites/hunter.png`, so giving a character a different look means copying in the new file, crediting it and changing one line of the manifest; no game code changes. Tilesets and character sheets are sprite sheets of 16×16 frames, the chest (`object.chest`) is a sheet of two 16×14 frames, shut and open, and everything else is a plain image. The manifest is plain data with no imports, so tools can read it too. The Preload scene loads all of it at boot, which is fine while it's a few hundred KB.
- **`npm run validate` checks the manifest** (`tools/asset-checks.ts`, also run as a unit test): every key points at a PNG that exists, sprite sheets divide into whole frames, a sheet's timeline `icon` is inside its frames, and no two keys share a file. Every file in `public/assets/` must be in the manifest, be credited in `CREDITS.md`, and have a kebab-case name. The `asset-gallery` debug scene (see [Testing](#testing)) shows the characters in the engine, and `tests/e2e/assets.spec.ts` checks that every key loads with the right number of frames.
- Every pack is listed in `CREDITS.md` with its source URL, author and license.
- **Sounds** are an `audio` entry with two files, an `.ogg` and an `.m4a` (AAC), because older Safari, iPhones included, can't play Ogg; Phaser loads the first the browser can play. The manifest's `sound('bgm/intro')` names both. `bgm.*` keys are music, which loops, and `sfx.*` keys sound effects. The checks want both files, really Ogg and MP4, and the asset gallery's debug info says whether each sound loaded. Music is levelled to −20 LUFS so tracks sit at the same loudness, then encoded the same way as the pack's `.wav` sound effects, which keeps downloads small:

  ```sh
  ffmpeg -i in.ogg -af volume=1.1dB -map_metadata -1 -c:a libvorbis -q:a 4 out.ogg
  ffmpeg -i in.ogg -af volume=1.1dB -map_metadata -1 -c:a aac -b:a 128k -movflags +faststart out.m4a
  ```

  Measure a track's loudness first with `ffmpeg -i in.ogg -af ebur128 -f null -` and set the `volume` to make up the difference (sound effects keep theirs). CREDITS.md records each file's gain and encoding.

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
- **Gaps:** there's no mine cart sprite (for the Stone Deeps) and no dedicated wind effect (for Gale Spire). Build them from tiles and tinted effects, or adjust the gimmick. There's no door or footstep sound, so doors are silent for now. There was no lighthouse either: Saltmere's is the desert sheet's domed tower, its dome recoloured red and its windows lit (`tiles/lighthouse.png`).
- **Villages by the sea:** the pack's own examples build villages on sand, not grass. Its sand-edged sea (`TilesetWater.png` rows 0–4) and plain light sand (`TilesetFloor.png` column 1, row 1) meet without a seam; the grass-edged dirt path doesn't belong on sand, so Saltmere's streets are open sand.

## Performance budget

60 fps on a mid-range phone, and a first load under about 10 MB. Music is most of it: the three tracks so far are about 2.4 MB as Ogg, and each is decoded into as much as 25 MB of memory to loop without a gap. Once the soundtrack grows, load music per area instead of all at boot.

## Cloud session notes

- Chromium for Playwright is preinstalled under `/opt/pw-browsers` (build 1194), which is why `@playwright/test` is pinned to 1.56.1. Don't run `playwright install` there. If the image's Chromium changes, pin the matching Playwright release, or set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`, which `playwright.config.ts` passes as `launchOptions.executablePath`.
- In CI, install the browser with `npx playwright install chromium`. GitHub's Ubuntu runners already have the libraries Chromium needs; `--with-deps` would only add fonts the game doesn't use, from an apt mirror that once stalled a run until it timed out. If Playwright ever reports missing host dependencies there, add `--with-deps` back.
- Chromium logs "Noise was added to a canvas readback" while Phaser runs its startup feature checks. It's a privacy notice, not an error, so the smoke test should fail only on `console.error` and uncaught page errors.
- For a quick screenshot without Playwright, run `/opt/pw-browsers/chromium --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot=out.png <url>`. Its `--window-size` includes about 87 px of invisible browser chrome, so the page viewport is shorter than the image.
