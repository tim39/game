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
- **Interact** by facing something and pressing Confirm: NPCs, signs, chests, doors, switches. People turn to face you when you talk to them, and everyone waits while the conversation lasts, so nobody wanders off mid-sentence. Some events fire when you step on a tile (your walk stops there), when you arrive on a map, or as soon as something has happened; cutscenes can walk people about, fade to black and take you somewhere else.
- **Map kinds:** town, interior, dungeon floor, overworld. Doors, stairs and paths off a map's edge lead to other maps; transitions fade through black (about 250 ms each way), and you arrive at a fixed spot just inside, facing into the new place.
- **Chests** hold an item or some gold. Face one from any side and press Confirm: it opens, and a line says what was inside ("Found Potion!"). It stays open for good (each has a flag), and after that it only says it's empty. Chests block the way, like furniture. **Signs** are read the same way, and say what they say in the plain box, with no name.
- **HP and MP carry over between battles.** **Light Shrines** at each dungeon's entrance and before each boss fully heal the party, so a dungeon is about managing resources between shrines: Confirm at one heals everyone, KO'd or not, at once and for nothing. Inns heal the party too, for a price, and so does Rowan's bed at Tamsin's house, for nothing. A night's rest fades to black, plays the morning jingle and fades back in.
- **Saving:** from the menu, anywhere on the field (not in battle or cutscenes). Three manual slots, plus an autosave slot updated on every map change: on arriving through a door, stairs or a map's edge, or, when a cutscene moved you, once it's over. Save is on the main menu; Menu pressed while walking lets the step finish and opens it there. A save keeps everything about the game (where you are, the party, items, gold, what's happened, play time), so loading one puts you back exactly where you saved, as if you'd just arrived there. Saves from older versions of the game still load.
- **Overworld:** a walkable map linking towns and dungeons, with random encounters by terrain. No vehicles in v1; ferries and shortcuts are scripted events.
- **One gimmick per dungeon** (tides, wind currents, boulders, lava switches, darkness); see STORY.md. Each must be small enough to build in about one session.

## Encounters

- Random encounters happen on dungeon floors and dangerous overworld terrain. Steps until the next one: random 24–40, scaled by the **Encounter rate** option: Off, Low (half as often), Normal, High (twice as often). Off is a legitimate way to play for the story. The count carries on across maps and battles (changing the rate keeps the steps already taken), and starts afresh after each battle; it isn't saved, so loading a game starts it afresh too. Stepping onto a way out or a cell that runs a script doesn't count.
- Each area has an encounter table of weighted enemy groups, and a backdrop its battles are fought in front of. Bosses and mini-bosses are visible, fixed encounters. So far there's the North Road out of Saltmere, where wolves prowl: one at a time twice as often as a pair.
- 8% chance of a **preemptive strike** (the party acts first) and 4% of an **ambush** (enemies act first); the battle says which as it starts.
- **Going into battle:** the walk stops on the step that brings it, the battle music starts, the screen flashes and breaks up into black, and the battle fades in. Won or fled, the field then fades back in where the player stood, and its music carries on from where it was. Lost, it's the Game Over screen (see [Winning and losing](#winning-and-losing)), and the field waits, its music paused, until the battle is fought again and won or fled.
- **Flee** is a command on any party member's turn. Chance = 50% + 2% × (average party SPD − average enemy SPD), clamped to 20–95%, counting only those still standing. A failed attempt uses up the turn, as a Normal action. You can't flee from bosses.

## Battle system

Side view: enemies on the left, the party on the right, the timeline across the top, and the command window and party status along the bottom. A battle has one to six enemies; several of a kind are lettered, Wolf A and Wolf B.

```
 [Rowan] ▸ [Wolf A] [Liora] [Wolf B] [Rowan] [Bram] [Cass] [Wolf A] [Liora] …
┌──────────────────────────────────────────────────────────────┐
│   Wolf A                                         Rowan       │
│              Wolf B                         Bram             │
│                                                Liora         │
│                                            Cass              │
├────────────────┬─────────────────────────────────────────────┤
│ ▶ Attack       │ Rowan   HP 112/130   MP 18   Atk+           │
│   Skill        │ Bram    HP 201/201   MP  6                  │
│   Item         │ Liora   HP  74/ 90   MP 31   Psn            │
│   Guard  Flee  │ Cass    HP  88/ 95   MP 12                  │
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

- CTs are whole numbers. A delay is at least 1, and Haste and Slow multiply it before it's rounded.
- **Ties** go to higher SPD, then the party before enemies, then left-to-right slot order. Turn order is fully deterministic.
- **At battle start,** each combatant's CT is their Normal delay × a seeded random number from 0.4 to 1.0, rounded. A preemptive strike sets the party's CT to 0; an ambush does the same for the enemies.
- **The preview is the point.** The timeline shows whose turn it is, then the next 10 turns. While the player browses commands and targets, it shows what the order *will be* after they confirm: slow actions push the actor back, Delay skills push the target back, Haste pulls an ally forward, Slow pushes an enemy back, a stagger pushes back an enemy hit on a weakness, and a revived ally gets back in line. Slots that change are highlighted. It shows the action landing in full (it can't know who'll miss, resist or fall), and everyone after taking Normal actions. It only shows a stagger on a weakness the party already knows, so it never gives one away.
- **What it previews:** on the command window, Attack at the first enemy, Guard and Flee (as if it fails); Skill and Item show nothing new until a skill or item is under the cursor, which is previewed aimed where the cursor will start (the first enemy, or the ally worst hurt), and then at whoever the cursor is on. Something that can't be used now previews nothing.
- **As an action plays out,** the timeline keeps up: a stagger the preview couldn't foresee pushes the enemy back as it lands, the KO'd leave the timeline, and each turn that goes by slides off it.

### Commands

- **Attack:** physical, power 1.0, Normal rank, using the weapon's element if it has one.
- **Skill:** costs MP. Each character has their own list (see [The party](#the-party)).
- **Item:** Quick rank. Works on any party member: revival items only on the KO'd, and everything else only on those standing.
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

- A target that **absorbs** the element heals by what the hit would have done to them.
- **Healing** gets the variance too, with the same minimum and cap, and never goes past the target's most HP.
- **Bombs** and other items that deal damage do exactly what they say, times the element's reaction, and Guard halves it; they're never critical and don't vary.

### Elements and Stagger

Six elements: **Fire, Water, Wind** and **Earth** (one per Beacon), plus **Light** and **Gloam** (dark). Every enemy reacts to each one in one of five ways: weak, normal, resist, immune or absorb.

**Stagger** is the system's signature. Hitting a weakness also pushes the target back on the timeline by 25% of its Normal delay, with a "STAGGER" pop-up. A target can be staggered at most once between its own turns, so it can't be locked down, and bosses take half the push. A hit that KOs doesn't stagger. Playing to elements *is* playing the timeline.

How an enemy takes an element is revealed the first time you hit that kind of enemy with it, whatever the reaction (or all at once by Liora's *Insight*), and the game remembers it for every later fight.

### Status effects

Durations count the affected unit's own turns, starting with their next one: a status given on the unit's own turn also lasts the rest of that turn. A status wears off at the end of its last turn.

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

Re-applying a status refreshes its duration; nothing stacks, so a stat is up, down or neither: Up replaces Down, and Haste replaces Slow, and the other way round. Bosses are immune to Sleep and take half duration from Slow, rounded up.

- **Haste and Slow** change the wait for the unit's next turn as soon as they're given (or cured), as well as the delays of their actions while they last.
- **Poison** can KO. Its damage doesn't wake a sleeper, though a hit does.
- **Silence** stops magical and healing skills; other skills, Attack and items still work.
- **Provoke** means an action aimed at one enemy must be aimed at the provoker, while they're standing. Actions aimed at everyone are unaffected.
- **A KO** takes every status away. A revived unit gets back in line after their Normal delay.

### Enemy behavior

Enemies choose from a data-defined, weighted list of actions (Attack, Guard or a skill) with simple conditions (`self.hp < 50%`, `every 3rd turn`, `once`, `allies < 2`) and targeting rules (random, lowest HP, highest ATK, the healer). Provoke overrides targeting.

- On its turn, an enemy picks at random, by weight, from the actions whose conditions hold and that it can take: it has the MP, isn't Silenced for a magic skill, and has someone to aim at. With none, it attacks.
- **Conditions:** its HP is below a share of its most; it's an Nth turn of its own (every 3rd is its 3rd, its 6th and so on); a skill kept for once a battle hasn't been used yet; fewer than so many of its side are standing, itself included (`allies < 2` is when it's alone). An action can have several, and they must all hold.
- **Targeting:** at random; lowest HP, meaning the least for their most, so it goes for whoever's worst hurt (with everyone unhurt, the one with least HP); highest ATK, buffs included; or the healer, someone who knows a healing skill (anyone, if nobody does). Ties go to whoever comes first in battle order.

**Bosses** add phases at HP thresholds and **telegraphs**: a big attack is announced one turn ahead and marked on the timeline, so the player can Guard, heal, or Delay the boss past it.

- A boss enters a phase the first time its HP falls below the phase's share (straight to the last one, if a big hit takes it below several), and from then on picks from that phase's actions. Phases never go back, even if it's healed.
- Telegraphing a skill takes the boss's turn, as a Normal action, and says whom it's aimed at. On its next turn the skill comes: at that target if it still can be, or at someone else at random if they've fallen. If it can't be used by then (Silence, say), the boss does something else instead. Pushing the boss back on the timeline puts it off, and Guard and healing blunt it. Telegraphs are for bosses, though any enemy could have one.

### Winning and losing

- **Victory:** every party member gets full EXP, KO'd members included. Gold and drops (from per-enemy drop tables) are awarded, level-ups show stat gains and new skills, and KO'd members get back up with 1 HP.
  - Each enemy gives its EXP and gold, and each item it can drop is rolled for on its own, by its chance (a boss's can be certain).
  - The battle music fades out for the victory jingle, and the **victory panel** takes the place of the command window and the party's status, a page at a time: the EXP, gold and items won ("Gained 12 EXP.", "Found 10 gold.", "Found Potion x2 and Eye Drops."), then a page for each member who levelled up, with the level jingle: the level they reached, what it raised each stat by, and any skills they learned. Confirm turns the pages.
  - Everyone keeps the HP and MP the battle left them, and what's been used is gone. A level-up raises the most HP and MP someone can have, not what they have, unless they were full.
- **Fleeing** keeps what the battle did (HP and MP lost, items used, weaknesses learned), but gives nothing, and anyone KO'd stays down until revived or rested. They come into the next battle down, off the timeline.
- **Defeat:** the banner says the party has fallen, the battle's music fades out for the Game Over jingle, and after Confirm the Game Over screen offers **Retry battle**, **Load save** or **Title**, the cursor on Retry battle.
  - **Retry battle** starts the fight again from its first turn, just as it began: the same enemies, who gets the jump, the same luck (so the same first turns), and the party as it went in. A battle lost changes nothing, so the HP, MP and items it used up are all back, and what it showed of the enemies' weaknesses is forgotten again. Won or fled, the game carries on as after any battle; lost, it's the Game Over screen again.
  - **Load save** opens the save menu, as Continue does on the title screen, and can be chosen once there's a save; Cancel goes back to the Game Over screen. **Title** goes back to the title screen.

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

A character's stats come from their level (see [Levels](#levels)), plus their equipment's bonuses. A bonus can be a penalty, but no stat goes below 0. In battle, ATK, DEF, MAG and RES Up and Down then multiply that stat by 1.25 or 0.75. Stats are whole numbers, rounded down at each step.

### The party

Fixed characters with their own kits; no job system. Full skill lists live in `src/data/skills.ts`. These are their roles:

| | Role | On the timeline | Joins |
|---|---|---|---|
| **Rowan** | Sword, all-rounder | Gains an elemental strike from each Beacon (Tide, Gale, Stone and Ember Edge); the party's weakness hunter | Start |
| **Bram** | Knight, tank | Slow but tough. Provoke, party DEF buffs, Shield Bash (damage plus a small delay) | Start |
| **Liora** | Priestess, healer | Heals, Regen, buffs, Light magic, Insight; **Haste**, and **Quicken** (an ally acts next) | End of Act 1 |
| **Cass** | Thief, speed and debuffs | The fastest. Steal, Poison, **Delay Strike** (push an enemy back), Pocket Sand (blinds all enemies) | Act 2 |

Their stats follow their roles at every level: Bram has the most HP and DEF and the least SPD, Cass the most SPD, Liora the most MP, MAG and RES, and Rowan the most ATK. The numbers are in `src/data/characters.ts`, and a test holds them to this.

### Levels

- Levels run from 1 to 30. The EXP curve lives in `balance.ts` and is tuned so that playing the main path at Normal encounter rate brings the party to the **target levels** below. The targets are the real spec; the curve and enemy stats bend to meet them.
- Each character's stats are set at level 1 and at level 30, and grow evenly in between, rounded down: each level-up raises a stat by about the same amount.
- **The EXP curve:** reaching level L takes 12 × (L − 1)^2.5 EXP in all, rounded: 12 for level 2, 384 for level 5, 2,916 for level 10 and 54,347 for level 30. Each level takes more than the last, so enemies in later areas give more EXP. A big win can raise several levels at once. Levels stop at 30, though EXP still counts.
- Skills are learned at set levels and at story beats.

| Area | Party level on arrival → at the boss |
|---|---|
| Tide Caves | 1 → 5 |
| Gale Spire | 7 → 10 |
| Stone Deeps | 11 → 15 |
| Ember Caldera | 16 → 20 |
| The Hollow Below | 23 → 28 |

**Simulator targets** (`npm run sim`): at an area's target level, a party run by simple AI should win that area's normal encounters more than 95% of the time in 3–6 rounds, and beat its boss 60–85% of the time. A round is a turn for each party member, so with two in the party six rounds is twelve of their turns. The normal encounters are played with the party as it arrives in the area and the boss with the party as it reaches it, each time at the level, in the gear and with the items `balance.ts` expects it to have by then.

The simulator's party plays as a sensible but unadventurous player would. It gets a fallen ally back up; heals an ally below half their HP; Guards when it's below 70% HP and an enemy has telegraphed an attack at it, or at the whole party; hits a weakness the party knows of with a skill; uses a skill that hits every enemy when there are three or more; and otherwise attacks the enemy with the least HP. It keeps back the MP its healing takes, never flees, and leaves bombs, buffs and statuses alone, so a player who uses them has an easier time of it.

## Items and economy

- **Equipment slots:** Weapon, Armor, Accessory. Weapon types are per character (Rowan swords, Bram axes, Liora staves, Cass daggers). Light armor fits anyone; heavy armor is Bram's alone, and robes are for Liora and Cass. Accessories fit anyone and are where builds come from: status immunity, element resistance, +SPD, starting battles Hasted, higher crit chance. Equipment adds to stats, and can take away (heavy armor costs a point of SPD).
- **Equipping** takes the piece from the inventory and puts back whatever was in its slot. Everyone joins the party already wearing a weapon and armor of their own, such as Rowan's Bronze Sword and Travel Clothes.
- **Consumables:** Potion and Hi-Potion (HP), Ether (MP), Ember Feather (revive), Antidote, Eye Drops, Remedy (cures everything), elemental bombs (so anyone can hit a weakness early on) and Smoke Pellets (a guaranteed escape, though not from bosses).
- **Key items:** story items and Memory Shards.
- **Gold** comes from battles and chests. Items sell for half their price, rounded down. Shops buy back anything but key items, though not gear someone is wearing, and sell no more of a thing than makes 99.
- **Shops** in each new town sell gear about one tier above the last. Outfitting the whole party in a new tier should cost roughly what the previous dungeon paid out at Normal encounter rate. Chests sometimes hold gear a tier ahead.
- **Inns** cost 10–80 gold depending on the town.

## Screens

- **Title:** New Game, Continue, Options. Continue can be chosen once there's a save, and the cursor starts on it; it opens the save menu to pick one, on the latest.
- **Save menu:** the autosave and the three slots, each showing the party, where the game was saved, the leader's level, the play time and when it was saved. The slot under the cursor stands out; the others are dimmed. Saving in an empty slot happens at once and says so; saving over a save asks first (Yes or No, on Yes). The autosave can't be saved in by hand. A save that can't be loaded (damaged, or made by a newer version) says so, and can be saved over. Cancel or Menu goes back.
- **Field:** no permanent HUD; the area name shows in a banner on entry.
- **Dialogue:** a box at the bottom with the speaker's name and portrait (signs and narration have neither). Text types out at about 50 characters a second; Confirm shows the rest at once, and once it's all out a ▼ shows and Confirm goes on. **Choices**, up to 4, come up in a box above it, with the line they answer still showing: Up and Down move the cursor (round from the last to the first), and Confirm picks. Cancel does nothing in a conversation, so nobody skips one by accident.
- **Menu:** Menu opens it on the field whenever the player can act (not in a conversation or a cutscene). The party fills the left: each member's portrait, level, HP with a gauge, MP and the EXP to their next level. The commands are top right: Items, Skills, Equip, Status, Options, Save. The panel under them shows the gold, play time and where you are; on the other pages it says what the line under the cursor does, or asks who. Pages open on top of each other: Cancel goes back one, and Menu closes the menu from any of them. Options is greyed out until the Options screen arrives.
  - **Items** lists everything the party carries, with how many. Outside battle an item does what it does in battle to HP and MP, so Potions, Ethers and Ember Feathers work. Statuses end with the battle, and bombs and Smoke Pellets are for battles alone, so those are greyed out. Choosing one asks whom on (anyone it wouldn't help is greyed out, and the KO'd can only be got back up); one used on the whole party picks out everyone it helps at once. After a use, the cursor stays where it was, so another goes on the same ally, until there are none left or it would help nobody.
  - **Skills** asks whose, then lists their skills with the MP each costs. Healing skills can be cast outside battle the same way, as long as the caster is standing and has the MP; the rest are greyed out, with what they do still shown. Healing outside battle has no variance: it comes to what it does in battle on average.
  - **Equip** asks who, then shows their Weapon, Armor and Accessory. Choosing a slot lists the gear carried that fits it, then Remove. Beside the list, each stat shows as it is and as it would be with the line under the cursor, with a green ▲ or a red ▼ by any that would change. Choosing puts it on (what was there goes back in the bag) and goes back to the slots.
  - **Status** shows a member's level, EXP, stats and gear, and the skills they know: four at most, the last line saying how many more there are when there isn't room, as Skills lists them all.
  - On Skills, Equip and Status, Left and Right go round the party. **Save** opens the save menu; Cancel there comes back to the main menu.
- **Shop:** opened by talking to a shopkeeper; Buy, Sell and Leave. Buy lists what the shop sells, at its price, greyed out where the gold won't stretch; Sell lists what the party carries that a shop would buy, for half. Choosing one asks how many: Left and Right change it by one and Up and Down by ten, from 1 to as many as there's gold for (or the party has), and Confirm buys or sells that many and goes back to the list. Beside the list are the gold, how many of the item the party has and wears, and what it does; while choosing how many, the count and what it comes to sit at the bottom, where the touch controls leave them clear. Along the bottom of the list is the party: for a piece of gear, those who could wear it walk on the spot with how it would change their stats under them (green for better, red for worse, or Worn, or Same), and the rest are greyed out. Cancel or Menu goes back; on the commands it leaves, as Leave does, and the shopkeeper says goodbye. Sell is greyed out with nothing to sell.
- **Inn:** "A room for the night is N gold. Will you stay?" Stay the night pays, fades out, heals the party, plays the morning jingle and fades back in; short of the gold, the innkeeper says so, and Not now does nothing.
- **Battle:** as shown above: the party's HP with a gauge, the MP they have left and up to two status tags; the command window only on a party member's turn, as they step forward. Skill and Item open their lists in the status panel's place. A banner under the timeline says what the skill or item under the cursor does, whom an action is aimed at (a ▼ marks them too), and what's being done. Numbers and words rise over whoever's hit (Miss, Critical!, Weak, Stagger!, a status's name), and a ! hangs over an enemy that has telegraphed. Winning or losing says so and waits for Confirm; winning brings up the victory panel (see [Winning and losing](#winning-and-losing)).
- **Battle timeline:** along the top of the battle screen, whose turn it is, then a ▸ and the next 10 turns, each a little picture of the fighter in a frame, blue for the party and red for enemies (enemies of a kind are lettered, as in Wolf A and Wolf B). Turns the preview changes light up in gold, and a ! marks the turn a telegraphed attack comes on. Turns slide along to their new places as the order changes, and the timeline clears once the battle is over.
- **Game Over:** "Game Over" in the Gloam's violet-grey over Retry battle, Load save and Title, laid out like the title screen. It fades in from the battle's black, and takes no choice until it has, so a press meant for the battle's last words can't pick one. Load save is greyed out until there's a save. Retry battle and Title fade it back out.
- **Options:** text speed, battle speed (1×, 2×, 3×), encounter rate, always run, music and sound volume, screen shake on/off, reduce flashing.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / left stick | On-screen d-pad |
| Confirm / interact | Z, Space, Enter | A (Cross) | A button |
| Cancel / back | X, Esc, Backspace | B (Circle) | B button |
| Menu | C, Tab | Start / Y | START button |
| Run | Hold Shift | Hold B while walking | Always run is on by default, so hold B to walk |

The on-screen controls appear only on touch devices: phones and tablets from the start, and a laptop's touchscreen once it's touched. The d-pad sits bottom left, A and B bottom right and START top right, drawn with the pack's gamepad glyphs. Where the screen has room beside the game they sit in its bottom corners; where they'd cover the dialogue box they move up to sit just above it. Slide a thumb round the d-pad to change direction without lifting it. Held upright, a phone shows "Turn your phone sideways to play." over the game, which is landscape-only. The browser never zooms or magnifies the page: pinches, quick double taps and long presses only do what the game does with them, so it always fits the screen.

## Art and audio

- **Tiles:** 16×16 top-down tiles from the CC0 pack. The world is drawn at 2× in a 640×360 canvas, so 20×11 tiles are on screen.
- **UI:** the pack's dialogue boxes, wooden window theme, icons and pixel fonts, drawn at the same pixel scale as the world. Readable on a phone held sideways; the game is landscape-only.
- **Battles** reuse the field sprites at 2× scale, animated with tweens (step forward, lunge, flash, shake, KO fade), so no separate battle art is needed. Spells use particles and the pack's effects, colored by element. Bosses are drawn larger.
- **Portraits** (the pack's facesets) appear in dialogue and battle status.
- **Mood:** warm gold for Beacon light and towns; desaturated violet-grey for the Gloam. Act 3 reuses existing maps with a Gloam tint and a fog overlay.
- **Music:** title, town, overworld, two dungeon themes, battle, boss, final boss, victory fanfare, a sorrow theme and the ending. Each map has its own music, and field music crossfades between maps (about a second); a town's houses share its music, which plays on as you go in and out. Cutscenes can change the music until you next arrive somewhere. Battle music interrupts it, and the field track resumes where it left off; so does a night's rest, for the morning jingle. A battle won fades its music out for the victory jingle, and one lost for the Game Over jingle; the field's music stays paused through the Game Over screen and a retry, until the battle is won or fled, and gives way to the title's or the save's if the player leaves. Browsers stay silent until the first key press or touch, so the title music starts then.
- **Sound effects:** cursor, confirm, cancel, buzzer, hits for each element, critical hit, heal, status, KO, level up, chest, door. They play over the music; the same sound asked for twice at once plays once.

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
| Victory, level up | Jingles: Success3 (picked from its spectrogram, unheard: notes rising to a held one; Success1 is three short beeps), LevelUp1 |
| Game Over | Jingles: GameOver3 (picked from its spectrogram, unheard: three falling chords, then a long low one; GameOver4 slides down a semitone at a time, which can sound comic) |
| Opening a chest | Jingles: Secret2 (picked from its spectrogram, unheard) |

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
