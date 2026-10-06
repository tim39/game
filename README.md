# The Fifth Flame *(working title)*

A classic high-fantasy JRPG for the browser, with turn-order-timeline battles, 16-bit-style pixel art, and a story about the lights that keep the dark away and what they cost.

Built with TypeScript and Phaser 4, and vibe coded with Claude Code.

> **Status:** milestones M0 to M5 are done: you can walk around a draft of Saltmere, on desktop or a phone, talk to the villagers, open chests, save and load, and fight wolves on the road north in turn-order battles, with rewards, level-ups and a Game Over screen. Between battles there's the menu (items, skills, gear, status), shops, inns, Light Shrines and an Options screen, all with sounds. See the roadmap for what's next.

## Run it locally

You need Node 22 or newer. Then:

```sh
npm install
npm run dev
```

Open the address it prints. In that dev build, the backtick key (`` ` ``), or three fingers on the game on a touchscreen, opens a debug menu: warp to any map, walk through walls, show what blocks the way, and export or import saves.

## Docs

- [Roadmap](docs/ROADMAP.md): milestones and what's next
- [Game design](docs/DESIGN.md): how the game plays
- [Story](docs/STORY.md): world, cast and plot (draft)
- [Tech](docs/TECH.md): architecture and tooling
- [CLAUDE.md](CLAUDE.md): working rules for Claude Code sessions

## Play

**https://tim39.github.io/game/**: every push to `main` deploys there once the checks pass.

**https://tim39.github.io/game/debug/** is the same game with the debug menu, for playtesting: the backtick key (`` ` ``), or three fingers on the game on a touchscreen, opens it. It shares saves with the game above.

On a keyboard: arrows or WASD to move, Z, Space or Enter to talk and choose, X, Esc or Backspace to go back, C or Tab for the menu (the START button on a phone), and hold Shift to run.
