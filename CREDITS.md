# Credits

Every third-party asset in the game: what it is, who made it, where it came from and its license. Add it here in the same commit as the asset. `npm run validate` fails if a file in `public/assets/` is missing from this list.

## Ninja Adventure

By **Pixel-boy** and **AAA**: https://pixel-boy.itch.io/ninja-adventure-asset-pack. License: CC0 1.0. Credit isn't required, but they ask for it, and they'll get it in the game's credits screen too. The raw pack is attached to this repo's [`ninja-adventure` release](https://github.com/tim39/game/releases/tag/ninja-adventure).

| Asset | Used for | Pack file | Changes |
|---|---|---|---|
| `public/assets/fonts/font-8x8.png` | Body text | `Ui/Font/font8x8.png` | Recolored white so it can be tinted; bottom row of "i" redrawn to match "l" and "t" |
| `public/assets/fonts/font-8x10.png` | Titles | `Ui/Font/font24x30.png` | Shrunk 3× to its native 8×10 grid; recolored white; bottom row of "i" redrawn |
| `public/assets/ui/dialog-box-portrait.png` | Dialogue box with a portrait | `Ui/Dialog/DialogBoxFaceset.png` | None |
| `public/assets/ui/dialog-box.png` | Dialogue box | `Ui/Dialog/DialogBox.png` | None |
| `public/assets/ui/dialog-box-plain.png` | Dialogue box with no name tab, for signs and narration | `Ui/Dialog/DialogueBoxSimple.png` | None |
| `public/assets/ui/choice-box.png` | Choice box, stretched to fit the choices | `Ui/Dialog/ChoiceBox.png` | None |
| `public/assets/ui/touch-dpad.png` | Touch d-pad | `Ui/Input/Gamepad/DPad.png`, `DPadUp.png`, `DPadDown.png`, `DPadLeft.png`, `DPadRight.png` | Put side by side in one strip of 17×17 frames, each padded so the pad sits in the same place |
| `public/assets/ui/touch-buttons.png` | Touch A and B buttons | `Ui/Input/Gamepad/ButtonA/Idle.png`, `ButtonA/Pressed.png`, `ButtonB/Idle.png`, `ButtonB/Pressed.png` | Put side by side in one strip |
| `public/assets/ui/touch-menu.png` | Touch Menu button | `Ui/Input/Gamepad/Start.png` | None |
| `public/assets/portraits/old-woman.png` | Tamsin's portrait | `Actor/Character/OldWoman/Faceset.png` | None |
| `public/assets/portraits/hunter.png` | Rowan's portrait (a placeholder look) | `Actor/Character/Hunter/Faceset.png` | None |
| `public/assets/portraits/knight.png` | Bram's portrait | `Actor/Character/Knight/Faceset.png` | None |
| `public/assets/portraits/old-man-3.png` | Hob's portrait | `Actor/Character/OldMan3/Faceset.png` | None |
| `public/assets/portraits/woman.png` | Nell's portrait | `Actor/Character/Woman/Faceset.png` | None |
| `public/assets/portraits/villager-3.png` | Corin's portrait | `Actor/Character/Villager3/Faceset.png` | None |
| `public/assets/portraits/child.png` | Pip's portrait | `Actor/Character/Child/Faceset.png` | None |
| `public/assets/portraits/villager-4.png` | Gwen's portrait | `Actor/Character/Villager4/Faceset.png` | None |
| `public/assets/portraits/monk.png` | Aled's portrait | `Actor/Character/Monk/Faceset.png` | None |
| `public/assets/portraits/monk-2.png` | Hal's portrait | `Actor/Character/Monk2/Faceset.png` | None |
| `public/assets/portraits/old-man-2.png` | Ewan's portrait | `Actor/Character/OldMan2/Faceset.png` | None |
| `public/assets/portraits/princess.png` | Rhona's portrait | `Actor/Character/Princess/Faceset.png` | None |
| `public/assets/portraits/villager-5.png` | Jory's portrait | `Actor/Character/Villager5/Faceset.png` | None |
| `public/assets/portraits/villager-2.png` | Dai's portrait | `Actor/Character/Villager2/Faceset.png` | None |
| `public/assets/portraits/giant-blue-samurai.png` | The Drowned Warden's portrait | `Actor/Boss/GiantBlueSamurai/Faceset.png` | None |
| `public/assets/sprites/hunter.png` | Rowan (a placeholder look) | `Actor/Character/Hunter/SpriteSheet.png` | None |
| `public/assets/sprites/knight.png` | Bram | `Actor/Character/Knight/SpriteSheet.png` | None |
| `public/assets/sprites/old-woman.png` | Tamsin | `Actor/Character/OldWoman/SpriteSheet.png` | None |
| `public/assets/sprites/villager.png` | Villagers | `Actor/Character/Villager/SpriteSheet.png` | None |
| `public/assets/sprites/villager-2.png` | Villagers | `Actor/Character/Villager2/SpriteSheet.png` | None |
| `public/assets/sprites/villager-3.png` | Villagers | `Actor/Character/Villager3/SpriteSheet.png` | None |
| `public/assets/sprites/villager-4.png` | Villagers | `Actor/Character/Villager4/SpriteSheet.png` | None |
| `public/assets/sprites/villager-5.png` | Villagers | `Actor/Character/Villager5/SpriteSheet.png` | None |
| `public/assets/sprites/woman.png` | Villagers | `Actor/Character/Woman/SpriteSheet.png` | None |
| `public/assets/sprites/old-man.png` | Villagers | `Actor/Character/OldMan/SpriteSheet.png` | None |
| `public/assets/sprites/old-man-3.png` | Villagers | `Actor/Character/OldMan3/SpriteSheet.png` | None |
| `public/assets/sprites/old-man-2.png` | Villagers | `Actor/Character/OldMan2/SpriteSheet.png` | None |
| `public/assets/sprites/monk.png` | Villagers | `Actor/Character/Monk/SpriteSheet.png` | None |
| `public/assets/sprites/monk-2.png` | Villagers | `Actor/Character/Monk2/SpriteSheet.png` | None |
| `public/assets/sprites/princess.png` | Villagers | `Actor/Character/Princess/SpriteSheet.png` | None |
| `public/assets/sprites/child.png` | Villagers | `Actor/Character/Child/SpriteSheet.png` | None |
| `public/assets/sprites/shadow.png` | Shadow under characters | `Actor/Character/Shadow.png` | None |
| `public/assets/sprites/treasure-chest.png` | Treasure chests, shut and open | `Items/Treasure/BigTreasureChest.png` | None |
| `public/assets/monsters/dog-black.png` | The Wolf in battle (the pack has no wolf) | `Actor/Animal/DogBlack/SpriteSheet.png` | None |
| `public/assets/monsters/blue-bat.png` | The Cave Bat in battle | `Actor/Monster/BlueBat/SpriteSheet.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/mollusc.png` | The Reef Snail in battle | `Actor/Monster/Mollusc/Mollusc.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/octopus-2.png` | The Grotto Octopus in battle | `Actor/Monster/Octopus2/SpriteSheet.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/spirit.png` | The Drowned Wisp in battle | `Actor/Monster/Spirit/SpriteSheet.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/slime.png` | The Tide Jelly in battle | `Actor/Monster/Slime/Slime.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/snake-3.png` | The Sea Snake in battle | `Actor/Monster/Snake3/Snake3.png` | Just the column facing right, its four frames put side by side in one strip |
| `public/assets/monsters/giant-blue-samurai.png` | The Drowned Warden in battle | `Actor/Boss/GiantBlueSamurai/Idle.png` | None |
| `public/assets/vfx/cut.png` | The party's physical hits | `FX/Attack/Cut/SpriteSheet.png` | None |
| `public/assets/vfx/claw.png` | Enemies' physical hits | `FX/Attack/Claw/SpriteSheet.png` | None |
| `public/assets/vfx/flam.png` | Fire hits | `FX/Elemental/Flam/SpriteSheet.png` | None |
| `public/assets/vfx/water.png` | Water hits | `FX/Elemental/Water/SpriteSheet.png` | None |
| `public/assets/vfx/spirit.png` | Wind hits, tinted green (the pack has no wind effect) | `FX/Magic/Spirit/SpriteSheet.png` | None |
| `public/assets/vfx/rock.png` | Earth hits | `FX/Elemental/Rock/SpriteSheet.png` | None |
| `public/assets/vfx/circle-spark.png` | Light hits | `FX/Magic/Circle/SpriteSheetSpark.png` | None |
| `public/assets/vfx/smoke.png` | Gloam hits, tinted violet; the party fleeing | `FX/Smoke/Smoke/SpriteSheet.png` | None |
| `public/assets/vfx/spark.png` | Healing, reviving and helpful statuses | `FX/Magic/Spark/SpriteSheet.png` | None |
| `public/assets/vfx/aura.png` | Harmful statuses | `FX/Magic/Aura/SpriteSheet.png` | None |
| `public/assets/vfx/shield-blue.png` | Guard | `FX/Magic/Shield/SpriteSheetBlue.png` | None |
| `public/assets/tiles/floor.png` | Ground: grass, sand, dirt paths | `Backgrounds/Tilesets/TilesetFloor.png` | Cropped a blank 1 px row off the bottom (417 to 416 px tall), so it divides into 16 px tiles |
| `public/assets/tiles/water.png` | Sea, shorelines, docks | `Backgrounds/Tilesets/TilesetWater.png` | None |
| `public/assets/tiles/nature.png` | Trees, bushes, rocks, flowers | `Backgrounds/Tilesets/TilesetNature.png` | None |
| `public/assets/tiles/relief.png` | Cliffs | `Backgrounds/Tilesets/TilesetRelief.png` | None |
| `public/assets/tiles/house.png` | House fronts, roofs, fences, stalls | `Backgrounds/Tilesets/TilesetHouse.png` | None |
| `public/assets/tiles/element.png` | Props and furniture | `Backgrounds/Tilesets/TilesetElement.png` | None |
| `public/assets/tiles/floor-detail.png` | Grass tufts, flowers, leaves | `Backgrounds/Tilesets/TilesetFloorDetail.png` | None |
| `public/assets/tiles/interior-wall.png` | Interior walls | `Backgrounds/Tilesets/Interior/TilesetInterior.png` | None |
| `public/assets/tiles/interior-floor.png` | Interior floors | `Backgrounds/Tilesets/Interior/TilesetInteriorFloor.png` | None |
| `public/assets/tiles/room-wall.png` | Walls of simple rectangular rooms | `Backgrounds/Tilesets/Interior/TilesetWallSimple.png` | None |
| `public/assets/tiles/desert.png` | Beach plants (and desert buildings, later) | `Backgrounds/Tilesets/TilesetDesert.png` | None |
| `public/assets/tiles/camp.png` | Fire pits, logs, barrels, crates | `Backgrounds/Tilesets/tileset_camp.png` | None |
| `public/assets/tiles/bed.png` | Beds and rugs | `Backgrounds/Tilesets/tileset_bed.png` | None |
| `public/assets/tiles/dungeon.png` | The Tide Beacon and the Light Shrines (orbs on pedestals) | `Backgrounds/Tilesets/TilesetDungeon.png` | None |
| `public/assets/tiles/boat.png` | A fishing boat | `Backgrounds/Vehicles/Boat.png` | None |
| `public/assets/bgm/intro.ogg`, `public/assets/bgm/intro.m4a` | Title music | `Audio/Musics/38 - Intro.ogg` | Turned up 1.1 dB, to −20 LUFS like the other tracks; re-encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/bgm/calm-village.ogg`, `public/assets/bgm/calm-village.m4a` | Saltmere's music | `Audio/Musics/33 - Calm Village.ogg` | Turned down 1.3 dB, to −20 LUFS; re-encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/bgm/fight.ogg`, `public/assets/bgm/fight.m4a` | Battle music | `Audio/Musics/17 - Fight.ogg` | Turned up 2.5 dB, to −20 LUFS; re-encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/bgm/aquatic.ogg`, `public/assets/bgm/aquatic.m4a` | The Tide Caves' music | `Audio/Musics/18 - Aquatic.ogg` | Turned up 4 dB, to −20 LUFS; re-encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/bgm/tension.ogg`, `public/assets/bgm/tension.m4a` | Boss battle music | `Audio/Musics/28 - Tension.ogg` | Turned down 0.4 dB, to −20 LUFS; re-encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/secret-2.ogg`, `public/assets/sfx/secret-2.m4a` | A chest opening | `Audio/Jingles/Secret2.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/success-3.ogg`, `public/assets/sfx/success-3.m4a` | Winning a battle | `Audio/Jingles/Success3.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/level-up-1.ogg`, `public/assets/sfx/level-up-1.m4a` | A level-up | `Audio/Jingles/LevelUp1.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/game-over-3.ogg`, `public/assets/sfx/game-over-3.m4a` | Losing a battle | `Audio/Jingles/GameOver3.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/secret-4.ogg`, `public/assets/sfx/secret-4.m4a` | Morning, after a night's rest | `Audio/Jingles/Secret4.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/heal-2.ogg`, `public/assets/sfx/heal-2.m4a` | A Light Shrine's healing, and healing from the menu | `Audio/Sounds/Magic & Skill/Heal2.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/impact.ogg`, `public/assets/sfx/impact.m4a` | A tide lever cranking, in the Tide Caves | `Audio/Sounds/Hit & Impact/Impact.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/wave.ogg`, `public/assets/sfx/wave.m4a` | The sea rushing in or out as the tide turns, in the Tide Caves | `Audio/Sounds/Ambient/Wave.wav` | Just its first wave, the first 3.4 seconds, faded out over the last 0.4; turned up 8 dB, to −22 LUFS like the other sound effects; encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/move-3.ogg`, `public/assets/sfx/move-3.m4a` | A menu's cursor moving | `Audio/Sounds/Menu/Move3.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/accept-5.ogg`, `public/assets/sfx/accept-5.m4a` | Choosing something in a menu | `Audio/Sounds/Menu/Accept5.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/move-4.ogg`, `public/assets/sfx/move-4.m4a` | Going back in a menu | `Audio/Sounds/Menu/Move4.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/menu-11.ogg`, `public/assets/sfx/menu-11.m4a` | Choosing something that can't be chosen now | `Audio/Sounds/Menu/Menu11.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/sfx/gold-1.ogg`, `public/assets/sfx/gold-1.m4a` | Buying or selling in a shop | `Audio/Sounds/Bonus/Gold1.wav` | Encoded as Ogg Vorbis (quality 4) and AAC (128 kbps) |
| `public/assets/tiles/drowned-warden.png` | The Drowned Warden, standing guard in the Beacon chamber | `Actor/Boss/GiantBlueSamurai/Idle.png`, its first frame | Cut down to the 80×48 middle of the 96×48 frame, from one blade's tip to the other's, so it divides into 16 px tiles |
| `public/assets/tiles/lighthouse.png` | Saltmere's lighthouse | `Backgrounds/Tilesets/TilesetDesert.png`, the domed tower (columns 3–5, rows 0–4) | Cut out; the dome recoloured from greens to the pack's reds, and the two windows lit in its yellows |
