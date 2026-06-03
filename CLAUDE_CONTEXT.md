# DARK FANTASY TACTICAL RPG — Контекст проекта

## Стек
- Phaser 3 + Vite + JavaScript ES2020
- Хостинг: GitHub Pages
- IDE: VS Code + Claude Code

## Структура
```
src/
  scenes/     — BootScene, BattleScene
  entities/   — Unit, PlayerUnit, EnemyUnit
  systems/    — TurnManager, SkillSystem, BattleGrid
  ui/         — UIManager
  data/       — units.json, skills.json, enemies.json, dialogue.json
  utils/      — constants.js, eventBus.js
```

## Правила проекта
1. NO FEATURE BEFORE FUN — сначала работающий бой
2. NO REWRITE POLICY — улучшаем, не переписываем
3. Каждое изменение — минимально необходимое

## Текущий этап: Phase 1 — Vertical Slice

### Сделано
- [x] Структура проекта создана
- [x] Данные юнитов, врагов, скиллов (JSON)
- [x] Unit, PlayerUnit, EnemyUnit
- [x] TurnManager (очередь по speed)
- [x] SkillSystem (регистрация + применение)
- [x] BattleGrid (позиционирование 2×3)
- [x] EventBus (шина событий)
- [x] BootScene (заставка)
- [x] BattleScene (основной геймплей)
- [x] UIManager (лог, кнопки, подсветка)

### В работе
- [ ] Запустить npm install + npm run dev — проверить что работает
- [ ] TavernScene с диалогами
- [ ] Анимации атак
- [ ] HP-бары (визуальные полоски)
- [ ] LevelUpScene
- [ ] Звуки и музыка
- [ ] GameOver / Victory screens (расширенные)

## Как давать задачи Claude Code
Пример хорошего запроса:
"В @src/scenes/BattleScene.js добавь анимацию атаки — юнит должен
кратко сдвинуться в сторону цели и вернуться назад (tween)"

## Архитектурные решения
- EventBus используется для связи между системами (не прямые вызовы)
- BattleScene оркестрирует всё — системы сами не знают о сцене
- JSON-данные — единственный источник правды для баланса
- Placeholder-прямоугольники вместо спрайтов до готового арта

## Ключевые события EventBus
- `log` — добавить строку в боевой лог
- `turn_started` (unit) — начался ход юнита
- `unit_damaged` ({unit, amount}) — юнит получил урон
- `unit_healed` ({unit, amount}) — юнит вылечен
- `unit_died` (unit) — юнит умер
- `unit_moved` (unit) — юнит переместился
- `skill_used` ({caster, skillId, target}) — использован скилл
- `skill_selected` (skillId) — игрок выбрал скилл в UI
- `skip_turn` — игрок пропускает ход
- `phase_changed` (phase) — сменилась фаза боя
- `battle_end` (result) — конец боя ('victory'|'defeat')
- `xp_gained` ({unit, amount}) — получен XP
- `level_up` ({unit, choice}) — повышение уровня
