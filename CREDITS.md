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
| `public/assets/ui/touch-dpad.png` | Touch d-pad | `Ui/Input/Gamepad/DPad.png`, `DPadUp.png`, `DPadDown.png`, `DPadLeft.png`, `DPadRight.png` | Put side by side in one strip of 17×17 frames, each padded so the pad sits in the same place |
| `public/assets/ui/touch-buttons.png` | Touch A and B buttons | `Ui/Input/Gamepad/ButtonA/Idle.png`, `ButtonA/Pressed.png`, `ButtonB/Idle.png`, `ButtonB/Pressed.png` | Put side by side in one strip |
| `public/assets/ui/touch-menu.png` | Touch Menu button | `Ui/Input/Gamepad/Start.png` | None |
| `public/assets/portraits/old-woman.png` | Tamsin's portrait | `Actor/Character/OldWoman/Faceset.png` | None |
| `public/assets/portraits/hunter.png` | Rowan's portrait (a placeholder look) | `Actor/Character/Hunter/Faceset.png` | None |
| `public/assets/portraits/knight.png` | Bram's portrait | `Actor/Character/Knight/Faceset.png` | None |
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
| `public/assets/sprites/child.png` | Villagers | `Actor/Character/Child/SpriteSheet.png` | None |
| `public/assets/sprites/shadow.png` | Shadow under characters | `Actor/Character/Shadow.png` | None |
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
