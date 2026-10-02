# Roadmap

The build order for v1.0. Every milestone ends with something you can play at https://tim39.github.io/game/. Each task is sized for about one Claude Code session and one PR, and its **Done when** line is the acceptance test.

`[ ]` to do · `[x]` done · 🧑 needs the owner (Claude can't do it from the cloud) · ★ playtest checkpoint

## How to use this

Start a session and say **"next task"**, or name one. Claude takes the first unchecked task in the current milestone, builds it on a branch, runs every check, ticks the box, merges it into `main` and tells you what to try in the live build. File anything you notice as a GitHub issue, one per thing. Open bugs get fixed before new roadmap work.

## Owner to-dos

- [ ] 🧑 **Turn on GitHub Pages:** repo Settings → Pages → Source: **GitHub Actions**. M0's deploy needs it.
- [x] 🧑 **Get the art pack.** Done: *Ninja Adventure* (CC0) is attached to the [`ninja-adventure` release](https://github.com/tim39/game/releases/tag/ninja-adventure). Add any future pack the same way, as its own release, since GitHub's web uploader stops at 25 MB.
- [ ] 🧑 **Read STORY.md** and change anything you don't love: names, Rowan's gender, the ending, the title.
- [ ] 🧑 **Play at every ★** and file what you notice.

## M0: Foundation

*Goal: an empty game that builds, tests and deploys itself.*

- [x] Scaffold Vite + TypeScript (strict) + Phaser 4 with every npm script listed in CLAUDE.md. **Done when** `npm run dev` shows a Phaser canvas.
- [x] ESLint + Prettier, including the rule that `src/core` can't import Phaser. **Done when** a deliberate bad import fails `npm run lint`.
- [x] Vitest and the seeded RNG (`src/core/rng.ts`). **Done when** a test proves the same seed gives the same sequence.
- [x] Playwright smoke test: the game boots with no console errors and saves a screenshot. **Done when** it passes locally and in CI.
- [x] CI workflow and GitHub Pages deploy. **Done when** a push to `main` is live at the Pages URL.
- [x] Pixel-perfect scaling (640×360, whole-number scale, letterbox, fit on phones), Boot and Preload scenes with a progress bar, a placeholder Title screen. **Done when** the title is crisp at 720p and 1080p and fits a phone screen.
- [ ] Input layer mapping keyboard and gamepad to logical actions. **Done when** both move a cursor on the title screen.
- [ ] Pixel font and UI scale: render the pack's 8×8 bitmap font crisply (not its TTF; see Assets in TECH.md) in a dialogue-sized sample. **Done when** the sample is readable on a phone, and the choice is recorded in TECH.md and CREDITS.md, with a screenshot.
- [x] `window.__game` debug hook skeleton, dev and test builds only. **Done when** the smoke test calls it and it's absent from the production bundle.

## M1: Walk around

*Goal: walk around Saltmere, on desktop and on a phone.*

- [ ] Import the art pack: `npm run fetch-assets` downloads it from its release into `assets-src/` and checks its hash; curate tiles and character sprites into `public/assets/`, build the asset manifest, fill in CREDITS.md. **Done when** validation confirms every manifest key points at a real file.
- [ ] ASCII map format and compiler: autotiling, prefabs, collision, overhead layer. **Done when** a test map renders with clean shorelines and the player walks behind treetops.
- [ ] Grid movement (walk and run, 4-direction animation) and a camera that follows the player but stays inside the map.
- [ ] Map transitions through doors, stairs and map edges, with fades and spawn points.
- [ ] NPCs that stand, wander and turn to face the player, and block movement.
- [ ] Interaction: face something, press Confirm, run its handler.
- [ ] Touch controls (d-pad, A, B, Menu) on touch devices, and a "turn your phone sideways" hint in portrait, where the game is tiny.
- [ ] Debug menu v1: warp to any map, noclip, show collision.
- [ ] Draft maps: Saltmere outdoors, two house interiors, the lighthouse.

★ **Checkpoint:** walk around Saltmere, go in and out of a house and bump into villagers, on desktop and on your phone.

## M2: Talk and remember

*Goal: the world can tell a story, and remembers what happened.*

- [ ] `GameState` in core (flags, vars, inventory, gold, party, location) with its operations and tests.
- [ ] Dialogue: text box with name and portrait, typewriter text, skip, choices. Measure the line width and record it in STORY.md.
- [ ] Event runner: async scripts, `EventContext` v1 and triggers (see TECH.md), tested against a fake context.
- [ ] Chests (one-time, flag-backed) and signs.
- [ ] Audio manager: music per map with crossfades, sound effects, audio unlock on first input.
- [ ] Save and load: three slots plus autosave on every map change, save versioning and migrations, Continue on the title screen, save export and import in the debug menu.

★ **Checkpoint:** the opening plays (festival, lamps, the Beacon going dark), villagers react to it, a chest gives a Potion exactly once, and after saving and reloading the page you're right back where you were.

## M3: Rules engine

*Goal: the whole battle system working headlessly, proven by tests and the simulator.*

- [ ] Zod schemas and `npm run validate` with cross-reference checks, also run as a test.
- [ ] Characters, growth and the EXP curve; stat calculation (base + growth + equipment + buffs), with tests.
- [ ] Act 1 data: Rowan's, Bram's and Liora's skills, items and equipment; inventory and equip operations, with tests.
- [ ] CTB engine: turn order, ranks, preview, damage, elements and Stagger, statuses, KO, victory and defeat, fleeing. Thoroughly tested.
- [ ] Enemy AI (weighted actions, conditions, targeting), boss phases and telegraphs.
- [ ] `balance.ts`, the party AI and `npm run sim`.

★ **Checkpoint:** `npm run sim` prints a balance report for the Tide Caves, and you can read a turn-by-turn log of Rowan and Bram fighting wolves.

## M4: Battle on screen

*Goal: a full battle, from the encounter to the victory screen.*

- [ ] BattleScene: layout, backdrop, sprites, command/skill/item/target menus, and animation of every `BattleEvent` (lunges, flashes, numbers, particles).
- [ ] The timeline strip, with a live preview as you browse commands and targets.
- [ ] Encounters: step counter, area tables, transition effect, preemptive strikes and ambushes, battle music, the Encounter rate option.
- [ ] Rewards: EXP, level-ups with stat gains and new skills, gold, drops.
- [ ] Game Over with Retry battle, Load save and Title.
- [ ] Debug: start any battle, set levels, give gear, 4× battle speed.

★ **Checkpoint:** fight wolves outside Saltmere as Rowan and Bram. The timeline preview reacts to every choice, and hitting a weakness visibly staggers the enemy back.

## M5: Menus, shops and inns

*Goal: everything between battles.*

- [ ] Main menu: Items, Skills (healing outside battle), Equip (with stat comparison), Status, Options, Save.
- [ ] Shops (buy and sell, quantities, who can equip it and how stats change), inns and Light Shrines.
- [ ] Options, remembered between sessions: text speed, battle speed, encounter rate, always run, volumes, screen shake, reduce flashing.
- [ ] Area name banner, and a sound pass on menus and cursors.

## M6: Vertical slice ★★

*Goal: the first 30 minutes, start to finish, polished enough to show someone.*

- [ ] Saltmere fully populated: NPCs whose lines change with story flags, a shop, an inn, chests, Tamsin's house.
- [ ] The Tide Caves: three floors, the tide-switch gimmick, 5–6 enemy types, treasure, Light Shrines.
- [ ] Boss: the Drowned Warden, with phases and one telegraphed attack.
- [ ] Cutscenes: the prologue, the Beacon going out, the Beacon chamber, Rowan gaining Tide Edge.
- [ ] Title screen art and a short intro.
- [ ] Balance pass with the simulator, then a playtest by you.
- [ ] Bug bash and juice: screen shake, hit-stop, transitions, sound everywhere.

★★ **Checkpoint:** play from the title screen through the Drowned Warden without debug tools. Then stop and ask: is this fun? Change DESIGN.md before building any more.

## M7: Finish Act 1

- [ ] Overworld map with encounter zones, and the road mini-boss.
- [ ] Wardenhold: shops, inn, Order HQ, NPCs; Liora joins.
- [ ] Liora's kit, including Haste and Quicken in battle.
- [ ] The Memory Shard system and the first two shard quests.
- [ ] Act 1 balance pass.

## M8: Act 2

- [ ] Gale Spire (wind currents) and the Ashen Knight; Cass joins with Steal, Delay Strike and Pocket Sand.
- [ ] Deepholm and the Stone Deeps (boulders, mine carts), the Vault Colossus and the murals.
- [ ] The confrontation at Wardenhold.
- [ ] Cinderwatch, the Ember Caldera (lava switches) and Vesh; the world falls to the Gloam.
- [ ] Shard quests 3–5, and an Act 2 balance pass.

## M9: Act 3

- [ ] The Gloam-covered world: tinted, fogged versions of existing maps, new dialogue, new encounter tables.
- [ ] The Hollow Below: darkness with a light radius, and the echoes of the forgotten.
- [ ] The Hollow: the multi-phase final battle.
- [ ] Ending, epilogue (which changes with the shards restored) and the credits roll.
- [ ] Shard quests 6–8.

## M10: Polish and ship v1.0

- [ ] Full-game balance pass: the simulator, then two complete playthroughs.
- [ ] Accessibility and options review, a mobile pass, a performance pass (load size, 60 fps on a phone).
- [ ] Credits screen built from CREDITS.md, and final title art.
- [ ] Bug bash, then tag v1.0.
