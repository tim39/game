# CLAUDE.md

Working rules for Claude Code sessions in this repo. Read this first, then the doc for whatever area you're about to touch.

## The project

**The Fifth Flame** (working title) is a classic high-fantasy JRPG that runs in the browser: TypeScript + Phaser 4, turn-order-timeline battles, 16×16 pixel art from a CC0 asset pack, deployed to GitHub Pages.

It's vibe coded. The owner directs and playtests; Claude writes nearly all of the code and content. Prefer changes that are small, easy to verify, and easy for the next session to pick up.

| Doc | Owns |
|---|---|
| `docs/ROADMAP.md` | Milestones and tasks. **Take work from here and tick the box in the same PR.** |
| `docs/DESIGN.md` | Game rules: battle, stats, progression, items, UI, controls. The source of truth for mechanics. |
| `docs/STORY.md` | World, cast, plot, locations, writing style. |
| `docs/TECH.md` | Architecture, file layout, data formats, testing, deploy. |
| `CREDITS.md` | Every third-party asset, with its source and license. |

## Session loop

1. Check open GitHub issues labeled `bug`; fix anything that blocks play first.
2. Otherwise take the next unchecked task in the current ROADMAP milestone, or the one the owner names.
3. Work on a branch, one task per branch. When every check passes, merge it into `main` yourself (fast-forward) and push; the owner chose this over PRs. Open a PR only if the owner asks for one. After pushing `main`, check that CI and the deploy went green.
4. Finish against the definition of done below, then tell the owner what changed and what to try in the build.

## Commands

Keep the names stable. Scripts whose tooling hasn't landed yet run `tools/not-yet.mjs`, which prints `SKIPPED` and exits 0: `sim`, until M3. When you build one of those tools, swap its script over and stop calling the stand-in.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/`, then a check that no debug code leaked in |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Prettier rewrite + ESLint autofix |
| `npm test` | Vitest unit tests |
| `npm run validate` | Checks game data: every collection against its Zod schema first; then that every asset manifest key points at a real, credited file, that every map compiles, its name fits the save menu and it can be reached from the start, that every event script runs and every line of dialogue fits its box, and that everything content names exists |
| `npm run sim` | Headless battle simulator; prints a balance report |
| `npm run test:e2e` | Playwright smoke tests + screenshots |
| `npm run fetch-assets` | Downloads the raw asset packs into `assets-src/` (see Assets in TECH.md) |
| `npm run check` | typecheck + lint + test + validate. Run it before every push |

## Golden rules

1. **`src/core/` is pure TypeScript.** No Phaser, no DOM, no `Math.random()`, no `Date.now()`. Every game rule (formulas, battle, inventory, state, saves) lives there and has unit tests. A lint rule enforces the no-Phaser part.
2. **Content is data.** Characters, skills, items, enemies, encounters, shops, maps and event scripts live in `src/data/`, typed and validated. Never hard-code content in scenes or UI code.
3. **All randomness goes through the seeded RNG** (`src/core/rng.ts`), so battles, sims and tests reproduce exactly.
4. **Core decides, scenes render.** The battle engine returns events (`damage`, `ko`, `turn-order`, …) and `BattleScene` animates them. Game logic never waits on an animation.
5. **`main` is always playable.** Put unfinished features behind a debug flag. No drive-by refactors.
6. **Saves are user data.** Any change to the shape of `GameState` bumps `SAVE_VERSION` and adds a migration with a test.
7. **Phaser 4 is not Phaser 3.** Most examples you remember are Phaser 3. If you're unsure an API exists, check `node_modules/phaser/types/phaser.d.ts` instead of guessing.
8. **Every asset needs a license.** Only add files with a known source and license, and add them to `CREDITS.md` in the same commit.
9. **Docs move with the code.** Mechanics changes update `docs/DESIGN.md`; architecture changes update `docs/TECH.md`; same PR.
10. **Creative direction belongs to the owner.** Propose story, character and tone changes; don't make them silently.

## Definition of done

A task is done when:

- its **Done when** line in ROADMAP.md is true, and its box is ticked;
- `npm run check` and `npm run test:e2e` pass;
- for anything visible, you've taken a Playwright screenshot and looked at it;
- it can be reached quickly. If a feature is buried mid-game, add a debug-menu entry or a `window.__game` hook so the owner and the tests can jump straight to it.

## Conventions

- TypeScript `strict`. No `any`; use `unknown` and narrow.
- IDs are kebab-case strings: `potion`, `tide-caves-b1`, `rowan`. Flags are namespaced: `story.beacon-out`, `chest.saltmere-01`.
- Filenames are kebab-case. Tests sit beside the code: `damage.ts` + `damage.test.ts`.
- Player-facing text lives in data and event scripts, never in UI code. Dialogue boxes hold at most 3 lines (STORY.md has the line width).
- Tuning numbers (formula constants, encounter rates, prices, the EXP curve) live in `src/data/balance.ts`, not scattered through code.

## Cloud session notes

- Outbound network is restricted. npm and GitHub release downloads work, but asset sites (kenney.nl, itch.io, opengameart.org) are blocked. Raw art packs are attached to this repo's GitHub Releases: `npm run fetch-assets` downloads them into `assets-src/` (see Assets in TECH.md). Never commit them. If you need an asset that isn't in a pack, ask the owner; never substitute something unlicensed.
- The live site (`tim39.github.io`) isn't reachable from cloud sessions. Confirm a deploy from the CI run's "Deploy to GitHub Pages" job.
- Chromium for Playwright is preinstalled under `/opt/pw-browsers`. Don't run `playwright install`. If the pinned `@playwright/test` expects a different Chromium build, see the note at the end of TECH.md.
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet. Revisit when it does.
