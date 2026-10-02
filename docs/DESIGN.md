# Game Design

How *The Fifth Flame* plays. This doc is the source of truth for mechanics: if the code and this doc disagree, one of them is a bug, so fix whichever is wrong in the same PR. Numbers are starting points. Tuning happens in `src/data/balance.ts`, checked with the battle simulator.

## Vision

A compact, complete, classic JRPG in the spirit of SNES-era Final Fantasy and Chrono Trigger, with modern courtesy. Four heroes, four Beacons, one memory-eating mist, and a battle system where *when* you act matters as much as *what* you do.

### Pillars

1. **Time is a resource.** The turn-order timeline is always on screen, and most interesting choices change it: hit a weakness to stagger an enemy back, haste an ally forward, delay a boss's big attack until after your heal.
2. **Classic, without the friction.** Encounters you can turn down or off, retry a lost battle, save anywhere on the field, fast text, fast battles.
3. **Small but finished.** A 4–6 hour game with a real ending beats a 40-hour game that never ships. Every feature has to earn its scope.
4. **Warm and earnest.** A sincere story, a likeable cast and some humor. Every NPC line is flavor, a hint or a joke.

## Scope for v1.0

| | Target |
|---|---|
| Play time | 4–6 hours |
| Party | 4 playable characters; all four fight, no swapping |
| Level cap | 30 |
| Towns | 3, plus 1 outpost |
| Dungeons | 5 (four Beacons and the final dungeon), 3–4 floors each, one gimmick each |
| World | 1 overworld, revisited in a Gloam-covered variant in Act 3 |
| Enemies | ~35 types (palette swaps count) and 8 bosses (5 story bosses, 3 mini-bosses) |
| Skills | ~14 per character by the end |
| Items | ~25 consumables and key items, ~45 pieces of equipment |
| Side quests | 5–8 small Memory Shard quests (see STORY.md) |
| Music | ~18 tracks from the asset pack (see [Draft soundtrack](#draft-soundtrack)) |

Anything beyond this goes in the [parking lot](#parking-lot) until v1.0 ships.

## Core loop

Town (story, shops, inn) → overworld → dungeon (explore, fight, treasure, a gimmick) → boss → story beat → next town. The party grows stronger through levels (from fighting), equipment (from gold and chests) and skills (from levels and story beats).

## Exploration

- **Grid movement** in 4 directions on 16×16 tiles, with smooth steps between tiles: about 4 tiles a second walking. Hold Run to go twice as fast; an *Always run* option flips this. A step always finishes, and taps during a step aren't lost. The camera follows the player and stops at the map's edges; a map smaller than the screen sits in the middle of it.
- **Trees, water and walls block the way**, but you can walk behind treetops and the tops of roofs, which are drawn over you.
- **People** stand still or wander a little way from home, and block the way too. Walk into one and they turn to look at you.
- **Interact** by facing something and pressing Confirm: NPCs, signs, chests, doors, switches. People turn to face you when you talk to them, and everyone waits while the conversation lasts, so nobody wanders off mid-sentence. Some events fire when you step on a tile or enter a map.
- **Map kinds:** town, interior, dungeon floor, overworld. Doors, stairs and paths off a map's edge lead to other maps; transitions fade through black (about 250 ms each way), and you arrive at a fixed spot just inside, facing into the new place.
- **Chests** open once and stay open (each has a flag).
- **HP and MP carry over between battles.** **Light Shrines** at each dungeon's entrance and before each boss fully heal the party, so a dungeon is about managing resources between shrines.
- **Saving:** from the menu, anywhere on the field (not in battle or cutscenes). Three manual slots, plus an autosave slot updated on every map change.
- **Overworld:** a walkable map linking towns and dungeons, with random encounters by terrain. No vehicles in v1; ferries and shortcuts are scripted events.
- **One gimmick per dungeon** (tides, wind currents, boulders, lava switches, darkness); see STORY.md. Each must be small enough to build in about one session.

## Encounters

- Random encounters happen on dungeon floors and dangerous overworld terrain. Steps until the next one: random 24–40, scaled by the **Encounter rate** option: Off, Low (half as often), Normal, High (twice as often). Off is a legitimate way to play for the story.
- Each area has an encounter table of weighted enemy groups. Bosses and mini-bosses are visible, fixed encounters.
- 8% chance of a **preemptive strike** (the party acts first) and 4% of an **ambush** (enemies act first).
- **Flee** is a command on any party member's turn. Chance = 50% + 2% × (average party SPD − average enemy SPD), clamped to 20–95%. A failed attempt uses up the turn. You can't flee from bosses.

## Battle system

Side view: enemies on the left, the party on the right, the timeline across the top, and the command window and party status along the bottom.

```
 NEXT ▸ Rowan · Wolf A · Liora · Wolf B · Rowan · Bram · Cass · Wolf A …
┌──────────────────────────────────────────────────────────────┐
│   Wolf A                                         Rowan       │
│              Wolf B                         Bram             │
│                                                Liora         │
│                                            Cass              │
├────────────────┬─────────────────────────────────────────────┤
│ ▶ Attack       │ Rowan   HP 112/130   MP 18/24               │
│   Skill        │ Bram    HP 201/201   MP  6/10               │
│   Item         │ Liora   HP  74/ 90   MP 31/40               │
│   Guard  Flee  │ Cass    HP  88/ 95   MP 12/20               │
└────────────────┴─────────────────────────────────────────────┘
```

### Turn order

Every combatant has a **CT**: the time until their next turn. The combatant with the lowest CT acts, and that much time passes for everyone. After acting, the actor's CT becomes the delay of the action they took:

```
delay = round(rank × K / (SPD + C))      starting constants: K = 1000, C = 10
```

| Rank | Multiplier | Used by |
|---|---|---|
| Quick | 0.7 | Items, Guard, a few quick skills |
| Normal | 1.0 | Attack, most skills |
| Slow | 1.4 | Big spells, heavy hits |
| Very slow | 2.0 | Ultimate skills, some boss attacks |

- **Ties** go to higher SPD, then the party before enemies, then left-to-right slot order. Turn order is fully deterministic.
- **At battle start,** each combatant's CT is their Normal delay × a seeded random number from 0.4 to 1.0. A preemptive strike sets the party's CT to 0; an ambush does the same for the enemies.
- **The preview is the point.** The timeline shows the next 10 turns. While the player browses commands and targets, it shows what the order *will be* after they confirm: slow actions push the actor back, Delay skills push the target back, Haste pulls an ally forward. Slots that change are highlighted.

### Commands

- **Attack:** physical, power 1.0, Normal rank, using the weapon's element if it has one.
- **Skill:** costs MP. Each character has their own list (see [The party](#the-party)).
- **Item:** Quick rank. Works on any party member, including KO'd ones for revival items.
- **Guard:** Quick rank. Halves damage taken until the guarder's next turn.
- **Flee:** see [Encounters](#encounters).

### Damage

```
physical = power × ATK² / (ATK + DEF)
magical  = power × MAG² / (MAG + RES)
healing  = power × MAG × 2
```

These never reach zero and give defense gentle diminishing returns. Then apply, in order:

1. element: weak ×1.5, normal ×1, resist ×0.5, immune ×0, absorb (heals instead)
2. critical hit ×1.5 (physical only, 5% base chance)
3. Guard ×0.5
4. buffs and debuffs: ×1.25 or ×0.75 to the stat involved
5. variance: a seeded random ×0.9 to ×1.1

Round the result. The minimum is 1 unless the target is immune, and the cap is 9,999. Physical attacks always hit unless the attacker is Blinded, and skills can set their own accuracy. There is no evasion stat.

### Elements and Stagger

Six elements: **Fire, Water, Wind** and **Earth** (one per Beacon), plus **Light** and **Gloam** (dark). Every enemy reacts to each one in one of five ways: weak, normal, resist, immune or absorb.

**Stagger** is the system's signature. Hitting a weakness also pushes the target back on the timeline by 25% of its Normal delay, with a "STAGGER" pop-up. A target can be staggered at most once between its own turns, so it can't be locked down, and bosses take half the push. Playing to elements *is* playing the timeline.

An enemy's weakness is revealed the first time you hit it with that element (or by Liora's *Insight*), and the game remembers it for every later fight.

### Status effects

Durations count the affected unit's own turns.

| Status | Effect | Lasts |
|---|---|---|
| KO | 0 HP; off the timeline until revived | until revived |
| Poison | Lose 8% of max HP at the start of each turn | until cured or the battle ends |
| Regen | Recover 8% of max HP at the start of each turn | 3 turns |
| Sleep | Skips turns; wakes up when damaged | 3 turns |
| Silence | Can't use magic skills | 3 turns |
| Blind | Physical attacks miss 50% of the time | 3 turns |
| Haste | Action delays ×0.6 | 3 turns |
| Slow | Action delays ×1.6 | 3 turns |
| ATK / DEF / MAG / RES Up | That stat ×1.25 | 3 turns |
| ATK / DEF / MAG / RES Down | That stat ×0.75 | 3 turns |
| Provoke | Must target the provoker when possible | 2 turns |
| Guard | Damage taken ×0.5 | until their next turn |

Re-applying a status refreshes its duration; nothing stacks. Bosses are immune to Sleep and take half duration from Slow.

### Enemy behavior

Enemies choose from a data-defined, weighted list of actions with simple conditions (`self.hp < 50%`, `every 3rd turn`, `once`, `allies < 2`) and targeting rules (random, lowest HP, highest ATK, the healer). Provoke overrides targeting.

**Bosses** add phases at HP thresholds and **telegraphs**: a big attack is announced one turn ahead and marked on the timeline, so the player can Guard, heal, or Delay the boss past it.

### Winning and losing

- **Victory:** every party member gets full EXP, KO'd members included. Gold and drops (from per-enemy drop tables) are awarded, level-ups show stat gains and new skills, and KO'd members get back up with 1 HP.
- **Defeat:** the Game Over screen offers **Retry battle** (restart the fight from its first turn), **Load save** or **Title**.

## Characters and progression

### Stats

| Stat | What it does |
|---|---|
| HP | Health; 0 means KO |
| MP | Pays for skills |
| ATK | Physical damage |
| DEF | Physical defense |
| MAG | Magic damage and healing |
| RES | Magic defense |
| SPD | How often you act (see [Turn order](#turn-order)) |

Critical-hit chance and elemental reactions come from equipment and skills, not extra stats.

### The party

Fixed characters with their own kits; no job system. Full skill lists live in `src/data/skills.ts`. These are their roles:

| | Role | On the timeline | Joins |
|---|---|---|---|
| **Rowan** | Sword, all-rounder | Gains an elemental strike from each Beacon (Tide, Gale, Stone and Ember Edge); the party's weakness hunter | Start |
| **Bram** | Knight, tank | Slow but tough. Provoke, party DEF buffs, Shield Bash (damage plus a small delay) | Start |
| **Liora** | Priestess, healer | Heals, Regen, buffs, Light magic, Insight; **Haste**, and **Quicken** (an ally acts next) | End of Act 1 |
| **Cass** | Thief, speed and debuffs | The fastest. Steal, Poison, **Delay Strike** (push an enemy back), Pocket Sand (blinds all enemies) | Act 2 |

### Levels

- Levels run from 1 to 30. The EXP curve lives in `balance.ts` and is tuned so that playing the main path at Normal encounter rate brings the party to the **target levels** below. The targets are the real spec; the curve and enemy stats bend to meet them.
- Each character has base stats and per-level growth. Skills are learned at set levels and at story beats.

| Area | Party level on arrival → at the boss |
|---|---|
| Tide Caves | 1 → 5 |
| Gale Spire | 7 → 10 |
| Stone Deeps | 11 → 15 |
| Ember Caldera | 16 → 20 |
| The Hollow Below | 23 → 28 |

**Simulator targets** (`npm run sim`): at an area's target level, a party run by simple AI should win that area's normal encounters more than 95% of the time in 3–6 rounds, and beat its boss 60–85% of the time.

## Items and economy

- **Equipment slots:** Weapon, Armor, Accessory. Weapon types are per character (Rowan swords, Bram axes, Liora staves, Cass daggers). Heavy armor is Bram's alone; robes are for Liora and Cass. Accessories fit anyone and are where builds come from: status immunity, element resistance, +SPD, starting battles Hasted, higher crit chance.
- **Consumables:** Potion and Hi-Potion (HP), Ether (MP), Ember Feather (revive), Antidote, Eye Drops, Remedy (cures everything), elemental bombs (so anyone can hit a weakness early on) and Smoke Pellets (a guaranteed escape, though not from bosses).
- **Key items:** story items and Memory Shards.
- **Gold** comes from battles and chests. Items sell for half their price.
- **Shops** in each new town sell gear about one tier above the last. Outfitting the whole party in a new tier should cost roughly what the previous dungeon paid out at Normal encounter rate. Chests sometimes hold gear a tier ahead.
- **Inns** cost 10–80 gold depending on the town.

## Screens

- **Title:** New Game, Continue, Options.
- **Field:** no permanent HUD; the area name shows in a banner on entry.
- **Dialogue:** a box at the bottom with the speaker's name and portrait (signs and narration have neither), typewriter text (Confirm shows it all at once), a ▼ prompt and up to 4 choices.
- **Menu:** Items, Skills, Equip, Status, Options, Save, with a party summary (HP, MP, level, EXP to next level), gold, play time and location.
- **Equip:** stat comparison with up and down arrows.
- **Shop:** Buy and Sell with quantities, showing who can equip each item and how it changes their stats.
- **Inn:** "Rest for N gold?" → fade out, heal, morning jingle.
- **Battle:** as shown above, plus a target cursor, damage numbers, status icons, the timeline preview and a victory panel.
- **Game Over:** Retry battle, Load save, Title.
- **Options:** text speed, battle speed (1×, 2×, 3×), encounter rate, always run, music and sound volume, screen shake on/off, reduce flashing.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / left stick | On-screen d-pad |
| Confirm / interact | Z, Space, Enter | A (Cross) | A button |
| Cancel / back | X, Esc, Backspace | B (Circle) | B button |
| Menu | C, Tab | Start / Y | START button |
| Run | Hold Shift | Hold B while walking | Always run is on by default, so hold B to walk |

The on-screen controls appear only on touch devices: phones and tablets from the start, and a laptop's touchscreen once it's touched. The d-pad sits bottom left, A and B bottom right and START top right, drawn with the pack's gamepad glyphs. Where the screen has room beside the game they sit in its bottom corners; where they'd cover the dialogue box they move up to sit just above it. Slide a thumb round the d-pad to change direction without lifting it. Held upright, a phone shows "Turn your phone sideways to play." over the game, which is landscape-only.

## Art and audio

- **Tiles:** 16×16 top-down tiles from the CC0 pack. The world is drawn at 2× in a 640×360 canvas, so 20×11 tiles are on screen.
- **UI:** the pack's dialogue boxes, wooden window theme, icons and pixel fonts, drawn at the same pixel scale as the world. Readable on a phone held sideways; the game is landscape-only.
- **Battles** reuse the field sprites at 2× scale, animated with tweens (step forward, lunge, flash, shake, KO fade), so no separate battle art is needed. Spells use particles and the pack's effects, colored by element. Bosses are drawn larger.
- **Portraits** (the pack's facesets) appear in dialogue and battle status.
- **Mood:** warm gold for Beacon light and towns; desaturated violet-grey for the Gloam. Act 3 reuses existing maps with a Gloam tint and a fog overlay.
- **Music:** title, town, overworld, two dungeon themes, battle, boss, final boss, victory fanfare, a sorrow theme and the ending. Field music crossfades between maps; battle music interrupts it, and the field track resumes where it left off.
- **Sound effects:** cursor, confirm, cancel, buzzer, hits for each element, critical hit, heal, status, KO, level up, chest, door.

### Draft soundtrack

Picked from the pack's 41 tracks by title only. Listen and swap freely.

| Where | Track |
|---|---|
| Title | 38 - Intro |
| Saltmere | 33 - Calm Village |
| Overworld | 35 - Adventure |
| Tide Caves | 18 - Aquatic |
| Wardenhold | 12 - Temple |
| Gale Spire | 19 - Ascension |
| Deepholm | 4 - Village |
| Stone Deeps | 30 - Ruins |
| Ember Caldera | 10 - Dark Castle |
| Battle | 17 - Fight |
| Boss battle | 28 - Tension |
| The midpoint twist | 3 - Revelation |
| Sad scenes | 7 - Sad Theme |
| The Gloam-covered world | 26 - Lost Village |
| The Hollow Below | 22 - Dream |
| Final boss | 24 - Final Area |
| Ending | 8 - End Theme |
| Credits | 15 - Credit Theme |
| Victory, level up | Jingles: Success1, LevelUp1 |

## Accessibility

Encounter rate (including Off), battle and text speed, Retry battle, a screen-shake toggle, reduced flashing, and never relying on color alone (elements have icons and names). Keep the font readable on a phone.

## Parking lot

Not in v1.0. Revisit after it ships.

- Vehicles (boat, airship) and a fast-travel network
- Party swapping, more than 4 party members, guest members (Vesh in Act 3)
- Limit breaks, Chrono Trigger-style combo techs
- Crafting, fishing, minigames
- New Game+, a bonus dungeon, superbosses
- A bestiary screen, achievements
- Key remapping, colorblind palettes
- Translations
- A desktop or Steam build (an Electron or Tauri wrapper around the web build)
