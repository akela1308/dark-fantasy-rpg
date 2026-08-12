# Dark Fantasy RPG — CLAUDE.md

## What is this project?

A browser-based tactical turn-based RPG built with **Phaser 3** and **Vite**, inspired by
**Disciples II**. The player controls a 3-character party (Падший Дуэлянт / Fallen Duelist,
Боец / Brawler, Знахарка / Healer) exploring a dark-fantasy world map and fighting speed-ordered
tactical battles on a 2×3 grid per side.

- Repository: `https://github.com/akela1308/dark-fantasy-rpg`
- Local path: `/Users/maksimilin/Desktop/Dark Fantasy/dark-fantasy-rpg/`
- Camera: fixed 2D top-down/side-hybrid per scene — world map uses a zoomed-out camera
  (`Phaser.Scale.FIT`, base canvas 1280×720, world maps are 1672×941 with `zoom ≈ 0.765`);
  battle uses a fixed 1280×720 stage with Disciples-II-style diagonal unit placement.
- Session shape: explore a map by clicking to move → encounter a bandit → dialogue with
  branching choices (fight / pay / intimidate / retreat) → tactical battle → victory/defeat
  screen → optional level-up → back to map. There is no explicit "mission length" design doc
  value; a single bandit encounter + battle currently forms the whole vertical-slice loop.
- Single save slot, "ironman" style: dying deletes the save (see Database/Backend below).

## Vision & Core Concept

From `ПРОЕКТ_КОНТЕКСТ.md` and the GDD (`Dark_Fantasy_GDD.docx`, one directory up): a dark-fantasy
tactical RPG in the spirit of Disciples II — direct numeric stats (HP/damage/armor/speed/accuracy),
no abstract STR/DEX/INT system. Project rules stated in the docs:

1. **NO FEATURE BEFORE FUN** — get one working, satisfying battle before adding scope.
2. **NO REWRITE POLICY** — improve existing code, don't rewrite wholesale.
3. Every change should be minimal and targeted.

The `MORTIS_CLASS_AUDIT.md` (one directory up, 2026-07-01) explicitly recommends **not**
introducing an abstract stat layer (STR/DEX/INT) even as the class system grows — differentiation
should come from each class's HP/armor/speed/damage profile plus its resource and branch choices.

## Tech Stack

- **Phaser 3.80.1** (`phaser` npm package, imported as `phaser/dist/phaser.esm.js`)
- **Vite 5.2** — dev server + build, ES modules, native `import json from './file.json'`
- Plain JavaScript (ES2020+), no TypeScript, no framework beyond Phaser's Scene system
- `gh-pages` (devDependency) for one-command deployment to GitHub Pages
- No backend, no database — see "Database / Backend" below

## Project Structure

```
dark-fantasy-rpg/
  index.html            — entry point, loads src/main.js as a module
  vite.config.js         — base: '/dark-fantasy-rpg/', publicDir: 'public', outDir: 'dist'
  package.json
  .github/workflows/deploy.yml   — GitHub Actions: build + deploy to gh-pages on push to main

  src/
    main.js               — Phaser.Game config; registers all 5 scenes

    scenes/
      BootScene.js        — title screen, fade-in logo + "НАЧАТЬ ИГРУ" button
      LoadingScene.js      — preloads all sprites/portraits/maps/audio/icons, shows progress bar,
                             starts background music once the first track is cached, then starts
                             the requested destination scene
      MapScene.js          — world map: click-to-move hero, two companions follow via a trail
                             system, NPC dialogues, bandit patrol + encounter, book pickups,
                             inventory/gold HUD, multi-map travel graph (see below)
      BattleScene.js       — tactical battle: grid, turns, skills, animations, victory/defeat
      LevelUpScene.js      — post-victory level-up choice UI (commander trait / class branch /
                             stat bonus fallback)

    entities/
      Unit.js              — base class: HP/damage/speed/armor/accuracy/regen/lifesteal, effects
                             array, cooldowns, class/origin/branch/resource fields, attack()/
                             takeDamage()/heal()
      PlayerUnit.js        — extends Unit: handleAttack/handleSkill/move/addXP/canLevelUp
                             (legacy levelUp() method still exists but is dead code, see below)
      EnemyUnit.js         — extends Unit: findTarget() (weakest reachable target) + decideAction()
                             (AI: boss roar at <50% HP, otherwise basic attack)
      MapUnit.js           — world-map character controller: click-to-move, paper-doll (split/
                             single leg) or spritesheet walk animation, idle breathing tween, dust
                             particles while walking

    systems/
      TurnManager.js       — speed-DESC turn queue, PHASE state machine, skip-dead-units logic
      BattleGrid.js        — 2×3 grid per side, front/back row melee-blocking logic
      SkillSystem.js       — registers skills from skills.json, applies damage/heal/effects,
                             resourceCost/resourceGain/appliesStatus, cooldowns
      ClassProgression.js  — reads classes.json, resolves level-up branch choices, applies
                             skill/passive/branch/resource progression choices
      CommanderTraits.js   — reads commanderTraits.json, resolves level-2 "commander trait"
                             choices (only for units with isCommander: true)
      WalkableZones.js     — per-map rectangle-based walkable-area data + clamp()/isWalkable()

    ui/
      UIManager.js         — HP bars, battle log (collapsible), skill action buttons with
                             icons/cooldowns/charges, defend/skip buttons, tooltips
      PortraitPanel.js     — Disciples-II-style portrait cards (player left, enemy right) with
                             HP bars and dim-on-death overlay
      MusicPlayer.js       — small corner music player, lazy-loads remaining tracks, prev/next/mute
      DialoguePanel.js     — bottom dialogue bar with portraits, branching choice buttons,
                             used by MapScene for NPC and bandit encounters

    data/
      units.json           — the 3 playable units + 6 test/debug units (see Known Issues)
      enemies.json         — bandit enemies + 3 test/debug clones
      skills.json           — all skills (active abilities), JSON-driven
      classes.json          — 3 classes: resource + branches + levelPlan
      commanderTraits.json  — 5 level-2 "commander" traits (hero-only)
      items.json            — inventory items (gold, healing potions, camp flask)
      books.json            — 5 collectible lore books with multi-page text
      maps.json             — per-map config: spawn points, exits, NPCs + their dialogue trees,
                             labels, fog/lantern/campfire decorations, tavern entry zone
      dialogue.json         — OLD placeholder dialogue data, NOT wired into the game (superseded
                             by the npcs[].dialogues structure inside maps.json)

    utils/
      constants.js          — GAME_WIDTH/HEIGHT, COLORS, GRID (2×3), PHASE enum, XP thresholds,
                             AI_DELAY
      eventBus.js           — singleton hand-rolled EventEmitter (not Phaser's own emitter)
      SaveSystem.js         — localStorage-based single-slot "ironman" save (see below)

  public/                  — static assets served as-is by Vite (sprites/, portraits/, maps/,
                             maps/characters/, ui/, audio/, items/)
```

## How to Run Locally

```bash
cd dark-fantasy-rpg
npm install
npm run dev       # → http://localhost:5173
```

`package.json` scripts (verified):

```json
"dev":     "vite",
"build":   "vite build",
"preview": "vite preview",
"deploy":  "gh-pages -d dist"
```

Dev keyboard shortcuts (active in BattleScene and/or MapScene):
- `B` — toggle battle-grid / inventory-grid debug overlay
- `G` — toggle coordinate grid overlay
- `H` — toggle fine/screen coordinate grid
- `J` — toggle labeled 100px coordinate grid
- `L` (MapScene only) — dev shortcut that force-grants enough XP to trigger a level-up for all
  3 party units immediately (`MapScene._launchDevLevelUp`, `MapScene.js:204`). Comment in the code
  explicitly flags this as temporary/production-enabled for testing class branches and says to
  remove it later — it is currently live in the shipped build.

## Architecture & Key Decisions

- **EventBus for cross-system communication.** `src/utils/eventBus.js` is a small hand-written
  `EventEmitter` (not `Phaser.Events.EventEmitter`, despite what older docs say), instantiated once
  as a module-level singleton and imported everywhere. Systems and entities emit events; scenes
  subscribe and translate them into rendering/animation. `eventBus.clear()` is called at the start
  of every `BattleScene.create()` — without it, listeners accumulate across battles/restarts.

- **Scenes orchestrate, systems don't know about scenes.** `BattleScene` owns `TurnManager`,
  `SkillSystem`, `BattleGrid`, `UIManager`, `PortraitPanel`; it calls into them and listens to their
  events, but the systems themselves have no reference back to the scene.

- **JSON is the single source of truth for balance/content.** Units, enemies, skills, classes,
  commander traits, items, books, and maps are all external JSON, imported directly as ES modules
  via Vite's native JSON import support. Designers/AI agents change numbers by editing JSON, not
  code.

- **No-rewrite policy on `MapScene.js` / `BattleScene.js`.** Per `MORTIS_NEXT_STEPS.md`, refactoring
  these two large scene files into smaller modules is explicitly disallowed without direct user
  request — new systems (reactions, NPC AI, Origins) should be added as new files under
  `src/systems/*.js` rather than by restructuring the monoliths.

- **Placeholder-to-sprite migration is done for battle**, but many map NPCs/props still rely on a
  mix of static images, spritesheet walk animations, and a custom "paper doll" system
  (`MapUnit._setupPaperdoll`) that splits a character into upper body + one or two leg pieces for
  more natural walk animation without full frame-by-frame art.

### The battle loop, step by step

1. **Scene entry** (`BattleScene.create()`, `src/scenes/BattleScene.js:91`): `eventBus.clear()` →
   `_initSystems()` creates `SkillSystem`/`TurnManager`/`BattleGrid` → `_initUnits()` builds
   `PlayerUnit`/`EnemyUnit` instances from `units.json`/`enemies.json` and applies any saved HP/XP/
   level/class state via `SaveSystem.applyToUnits()` → grid placement → background/field draw →
   `UIManager`/`PortraitPanel` built → `TurnManager.init([...playerUnits, ...enemyUnits])`.
2. **Turn queue built** (`TurnManager.init`, `src/systems/TurnManager.js:18`): all living units
   sorted by `speed` DESC into `this.queue`; `_advanceToNextAlive()` sets `active` to the first
   living unit and emits `turn_started`.
3. **Player turn** (`PHASE.PLAYER_INPUT`): `UIManager` renders that unit's skill buttons (from
   `unit.skills`, matched against `skills.json`) plus Defend/Skip. Clicking an enemy
   (`BattleScene._onEnemyClick`) triggers either a plain `actor.handleAttack(target)` or, if a
   skill was pre-selected via `skill_selected`, `actor.handleSkill(skillId, target, skillSystem)`.
   Ally clicks (`_onAllyClick`) resolve ally-targeted skills (e.g. Bandage, Shield Cover).
4. **Skill/attack resolution**: `Unit.attack()` (`src/entities/Unit.js:120`) computes hit chance
   from speed delta + accuracy, rolls crit chance from speed, applies damage via
   `target.takeDamage()`, handles lifesteal, and grows the caster's class resource on basic hits
   (`getClassDef(this).resource.gainOnBasicAttack`). `SkillSystem.use()`
   (`src/systems/SkillSystem.js:28`) checks/spends/gains resources, applies built-in effect types
   (damage multiplier, fixed damage, heal, dodge_boost, cover) or a JS-function effect (boss roar),
   applies any `appliesStatus` entries, and sets cooldowns.
5. **Damage/effect pipeline** (`Unit.takeDamage`, `src/entities/Unit.js:48`): cover redirection →
   dodge check → `defending` (-50%) → `marked` (amplify incoming) → `guarded` (reduce incoming) →
   armor % reduction → emits `unit_damaged`/`unit_died`.
6. **Post-action cleanup** (`BattleScene._afterPlayerAction` / `_finishTurn`): checks win/lose
   (`_checkEnd`), advances `TurnManager.nextTurn()` (which calls `endTurn()` on the unit that just
   acted — ticking cooldowns/effects and applying regen), synchronously removes dead units from
   `BattleGrid`, re-renders all sprites/HP bars/portraits (`_renderAll`), and if it's now an enemy's
   turn, schedules `_runAITurn()` after `AI_DELAY` (900ms).
7. **AI turn** (`EnemyUnit.decideAction`, `src/entities/EnemyUnit.js:34`): picks a target via
   `findTarget()` (ranged/ignoreRows units target the weakest unit anywhere; melee units prefer the
   front row), casts `commanders_roar` if it's a boss under 50% HP and off cooldown, otherwise does
   a basic `attack()`.
8. **End of battle** (`BattleScene._endBattle`): victory grants XP to hero/companions, sets
   `bandit_0_defeated` in the registry, saves via `SaveSystem.save()`, and — if any unit crossed the
   XP threshold — launches `LevelUpScene` before returning to the map; defeat deletes the save
   entirely (ironman mode) and offers only a "start over" button back to `BootScene`.

### Class system (current state — see MORTIS_*.md for full detail)

Three playable classes, each tied to one `unitId` via `src/data/classes.json`:

| Class (id) | Unit | Role | Resource (max, start) | Level-3 branches |
|---|---|---|---|---|
| `fallen_duelist` | hero_duelist / Дуэлянт | striker | `tempo` (Темп, 3, starts 0) | `honor_code` (Кодекс Чести) / `last_argument` (Последний Аргумент) |
| `brawler` | companion_brawler / Боец | defender_bruiser | `might` (Мощь, 3, starts 0, +1 per basic attack) | `living_wall` (Живая Стена) / `bonebreaker` (Костолом) |
| `healer` | companion_healer / Знахарка | support | `supplies` (Сборы, 3, starts 3) | `healers_hand` (Рука Лекаря) / `bitter_tinctures` (Горькие Настои) |

Level-up flow (`LevelUpScene._showForUnits`, priority order): commander trait (level 2, hero only,
from `commanderTraits.json`) → class branch choice (level 3, from `classes.json.levelPlan`) →
hardcoded `CLASS_BONUSES` fallback (flat stat bonuses) → generic 3-bonus fallback. **Levels 4+ have
no `levelPlan` entries in `classes.json`**, so progression silently falls back to flat stat bonuses
past level 3 — `MORTIS_NEXT_STEPS.md` calls this "the most serious conceptual gap in the system"
and recommends authoring `levelPlan["4"]`/`["5"]` branching off the level-3 `branchId` choice.

**Resources are now wired to combat**, contrary to the older `MORTIS_CLASS_AUDIT.md` claim that
"no skill references tempo/might/supplies": `skills.json` currently gives `rapier_strike`
`resourceGain: { tempo: 1 }`, `pistol_shot` costs 1 `tempo`, `shield_cover` gains 1 `might` and
`heavy_strike` costs 2 `might`, and `bandage` costs 1 `supplies`. Treat the audit's "resources
exist but are unused" finding as **stale/superseded** by this later data change — verify against
`src/data/skills.json` directly if in doubt.

Five Commander Traits (`commanderTraits.json`), all unlock at level 2, gated to units with
`isCommander: true` (currently only `hero_duelist`): `commander`, `second_strike`,
`shooting_knack`, `secret_literacy`, `first_signs`.

Per `MORTIS_NPC_CLASSES.md`, **no enemy currently has a class** — `enemies.json` has zero
`classId`/`resource`/`branchId` fields; that document proposes (not yet implemented) three
repeatable NPC classes — Клинок (Blade), Дозорный (Watcher), Страж (Warden) — with bosses
differentiated via an `originId` layer rather than one-off unique classes.

## Database / Backend

**There is no backend and no database.** This is a fully client-side, static-hosted game.

- **Persistence is `localStorage` only**, via `src/utils/SaveSystem.js`, under the single key
  `darkfantasy_ironman_v1`.
- **"Ironman" design**: one save slot, `schemaVersion: 2`. Victory saves full player-unit state
  (class/origin/branch, commander traits/tags/choices, hp/maxHp/damage/armor/xp/level, skills,
  passives, classTags/classChoices, resources, `_cdReduction`), current map + spawn point, gold,
  and a fixed whitelist of registry flags (bandit defeated, NPC-talked, book collected/read flags).
  Defeat calls `SaveSystem.deleteSave()` — the run ends and next launch starts fresh.
- **`_cdReduction` gap is fixed.** `MORTIS_CLASS_AUDIT.md` flagged `_cdReduction` (Знахарка's
  Concentration level-up bonus, -1 skill cooldown) as missing from `SaveSystem.save()`'s
  serialization. Verified directly against `src/utils/SaveSystem.js`: `save()` (line 51) now writes
  `_cdReduction: u._cdReduction || 0` and `applyToUnits()` (line 181) reads it back — this matches
  the "one-line fix" `MORTIS_NEXT_STEPS.md` Stage 1 called for, and it has already landed. Treat the
  audit's framing of this as a currently-open gap as stale.
- No accounts, no server sync, no analytics backend of any kind.

## Key Features Implemented

- Full Boot → Loading → Map → Battle → LevelUp → Map scene loop, all wired through
  `scene.start()`/`scene.launch()`.
- World map with **7 distinct maps** (`map1`/руины, `tavern_map`, `tavern_inside`, `forest1`,
  `mountains_map`, `road_boloto`, `elf_boloto`, `elf_boloto1`) connected by an exit-zone graph
  defined in `maps.json`, each with its own walkable zones (`WalkableZones.js`).
- Click-to-move hero with two companions following via a recorded trail (`_followTrail`) plus
  separation logic so party members don't overlap.
- Paper-doll and spritesheet walk animations for map characters, ambient dust particles, idle
  "breathing" tweens, fog/lantern/campfire particle/tween decorations per map.
- NPC dialogue system (branching choices, portraits, `setFlag`/`close`/`next`/`altRoot` conditional
  branches) driven entirely by `maps.json`, used for tavern patrons, a swamp elf, and the bandit
  encounter negotiation (fight / pay / intimidate / retreat).
- Collectible lore books (5, each with 2 pages of text) and a small inventory (gold, healing potion,
  camp flask) synced with the save system.
- Tactical battle: speed-based turn order, 2×3 grid with front/back row melee blocking, ranged
  units that ignore row-blocking, JSON-driven skills with cooldowns/resource costs/status effects,
  attack/heal/death/miss/crit animations, camera shake on crits/deaths/boss roar.
- Class system MVP: 3 classes with named resources, level-3 branch choice, level-2 commander trait
  (hero only), resource costs/gains wired into 5 of the current skills.
- Music player with 7 tracks, lazy-loaded after the first, autoplay-unlock handling for browser
  audio policies.
- Single-slot ironman save/load via `localStorage`.

## Known Issues / Not Yet Implemented

Pulled from `MORTIS_CLASS_AUDIT.md` and `MORTIS_NEXT_STEPS.md` (2026-07-01, most authoritative
source on class-system state) plus direct code reading:

- **Progression beyond level 3 is unspecified.** `classes.json.levelPlan` only defines level 3;
  levels 4+ fall back to flat stat bonuses (`CLASS_BONUSES` in `LevelUpScene.js:7-23`) regardless
  of the branch chosen at level 3. `ClassProgression.applyProgressionChoice()` already supports
  `skill` and `passive` choice types in code — they're simply never used in the JSON yet.
- **Only 1 of 6 planned MVP status effects is implemented**: `weakened` (partially — it reduces
  outgoing, not incoming, damage; needs a semantics check against design intent). `marked` and
  `guarded` *are* now implemented in `Unit.js` (lines 71–80) via `appliesStatus` in `skills.json` —
  this is ahead of what `MORTIS_CLASS_AUDIT.md` describes, so treat that audit's "0/6 implemented"
  framing as partially outdated. Still missing entirely: `rooted`, `staggered`, `bleed`/`cursed`.
- **`accuracy` field is defined but unused in the hit-chance formula.** `Unit.attack()`
  (`Unit.js:122`) computes hit chance from speed delta and `(accuracy - 75) * 0.3` — so it actually
  IS read here; earlier audit language calling this "not connected" should be re-verified against
  the live formula before acting on it.
- **No NPC/enemy classes.** `enemies.json` has zero `classId`/`branchId`/`resource` fields; all
  enemies fight with a flat basic-attack AI plus one hardcoded boss exception
  (`isBoss` → `commanders_roar` at <50% HP in `EnemyUnit.js:39`). `MORTIS_NPC_CLASSES.md` proposes
  Клинок/Дозорный/Страж as repeatable NPC classes with Origins for boss uniqueness — none of this
  is implemented.
- **No "reactions" system** (Ответный выпад / Кара непрошенных / Пиявочный отклик) — there is no
  concept of an out-of-turn triggered ability anywhere in `SkillSystem` or `Unit`.
- **Origins are not implemented.** `originId` is reserved in `Unit.js`/`SaveSystem.js` and always
  `null`; no `origins.json`, no `applyOrigin()` function exists yet.
- **Test/debug units are still shipped in data.** `units.json` contains `test_brawler_2/3/4` and
  `enemies.json` contains `test_commander_2/3/4` — 6v6 filler used for visual layout testing,
  flagged as a pending cleanup item in both `MORTIS_NEXT_STEPS.md` and an older
  `ДОПОЛНЕНИЕ_ДЛЯ_КОДЕКСА.md` (referenced but not included in this read) — not yet removed.
- **Dead code**: `PlayerUnit.levelUp()` (`PlayerUnit.js:63-85`) is an old switch-based level-up
  implementation that is never called; the real level-up path is entirely
  `LevelUpScene._applyBonus()`.
- **`dialogue.json` is unused placeholder data** — the actual NPC dialogue system lives in
  `maps.json`'s `npcs[].dialogues` structure instead.
- **Dev-only level-up shortcut (`L` key) is live in the shipped build** (`MapScene.js:140`), with
  a `// TEMP` comment saying to remove it after branch-choice testing is done.
- **HUD does not show class resources or most status effects.** `UIManager.js` only visualizes
  `pistol_charges` (a non-class resource) and a text "Защита ✓" indicator for `defending`; Темп/
  Мощь/Сборы and other active effects (`dodge_boost`, `enraged`, `weakened`, `marked`, `guarded`)
  have no on-screen indicator.
- **No sound effects in battle** — only background music; no SFX for hits/skills/deaths.
- **No mobile/touch-specific input handling** — click-based only.
- **Only 6 monetizable/level-4+ content items exist as design intent, not code** — future classes
  (Печатник, Дорожный Командир, Следопыт, Кузнец-Изгнанник, Носитель Запрета) are explicitly listed
  as "not now" in `MORTIS_NEXT_STEPS.md`.
- **GDD alignment**: a docx GDD (`Dark_Fantasy_GDD.docx`, one directory up) and older
  `ПРОЕКТ_КОНТЕКСТ.md`/`ОБЩЕЕ_ПОНИМАНИЕ_ПРОЕКТА_2026-06-26.md` exist alongside the MORTIS_*.md
  documents; per the task brief, MORTIS_CLASS_AUDIT/NPC_CLASSES/NEXT_STEPS (2026-07-01) are the most
  current and authoritative source on the class system specifically, since they were written after
  a class-system implementation pass that older docs (including the 2026-06-26 snapshot) don't know
  about at all.

## Business Context

No monetization, accounts, or analytics code exists in this repository — it is a free,
static-hosted browser game (single global save in `localStorage`, no purchases, no ads). Business/
monetization planning for this and other portfolio projects lives outside this repo (see the user's
cross-project portfolio strategy notes); nothing in the current codebase implements or references
payments, subscriptions, or user accounts.

## Environment Variables

None. There is no `.env` usage anywhere in `src/` — `vite.config.js` sets `base: '/dark-fantasy-rpg/'`
and `publicDir: 'public'` directly, with no environment-driven configuration. `.gitignore` reserves
`.env`/`.env.local`/`.env.production` paths defensively, but none currently exist or are read by the
code.

## Deployment

Two deployment paths coexist in the repo:

1. **CI (current, automatic)**: `.github/workflows/deploy.yml` runs on every push to `main` —
   `npm install` → `npm run build` → `peaceiris/actions-gh-pages@v4` publishes `./dist` to the
   `gh-pages` branch using the repo's built-in `GITHUB_TOKEN`.
2. **Manual**: `npm run build` (outputs to `dist/`, `emptyOutDir: false`) then `npm run deploy`
   (runs `gh-pages -d dist` via the `gh-pages` devDependency) to push `dist/` to the `gh-pages`
   branch directly from a local machine.

Both branches (`main` and `gh-pages`) exist on `origin`. GitHub Pages should be configured to serve
from the `gh-pages` branch. Live URL follows the pattern
`https://akela1308.github.io/dark-fantasy-rpg/` (matches `vite.config.js`'s `base` path).

Note: while inspecting the repository, `git remote -v` showed the origin URL contains an embedded
GitHub personal access token in plaintext (stored in local `.git/config`). This should be rotated
and the remote reconfigured without embedded credentials — this is a local machine/credential
hygiene issue, not something fixable by editing files in this repo.

## Important Files to Read First

For anyone (human or AI) picking this project up:

1. `src/main.js` — Phaser game config and scene registration; the whole app in ~25 lines.
2. `src/scenes/BattleScene.js` — the core gameplay loop; start with `create()` (line 91) and
   `_bindEvents()` (line 762) to see how everything connects via the event bus.
3. `src/entities/Unit.js` — the shared combat model (damage, effects, resources) all units build on.
4. `src/systems/SkillSystem.js` and `src/data/skills.json` — how JSON-driven abilities work end to
   end; read together to understand `resourceCost`/`resourceGain`/`appliesStatus`.
5. `src/data/classes.json` + `src/systems/ClassProgression.js` + `src/scenes/LevelUpScene.js` — the
   class/branch/level-up system, in that order (data → resolution logic → UI).
6. `src/scenes/MapScene.js` + `src/data/maps.json` — world exploration, NPC dialogue, and
   map-to-map transitions; large file, but `create()` (line 29) and `_checkEncounters`/
   `_checkExits`/`_transitionTo` (lines ~907-1107) cover the important flow.
7. `src/utils/SaveSystem.js` — the entire persistence model (single ironman save).
8. One directory up: `MORTIS_CLASS_AUDIT.md`, `MORTIS_NPC_CLASSES.md`, `MORTIS_NEXT_STEPS.md` — the
   most current design/implementation status for the class system; read before making any class,
   resource, or status-effect change, since they supersede older docs on this topic.
