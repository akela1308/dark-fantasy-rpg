#!/bin/zsh
# Коммит только файлов потока анимаций. Использование: tools/night_commit.sh "сообщение"
cd "$(dirname "$0")/.."
git add tools/night_*.py tools/night_commit.sh tools/battle_sheet_pack.py src/data/animations.json src/data/map_animations.json \
  src/data/ambience.json src/systems/BattleAnimations.js src/systems/NpcAnimations.js src/systems/MapAmbience.js \
  public/sprites/battle public/maps/characters/anim assets/generated/_night assets/generated/ЖУРНАЛ.md assets/generated/КАНОН_ОРУЖИЯ.md \
  assets/generated/РАСХОД.md 2>/dev/null
for d in assets/generated/*/; do case "$d" in *_maps_raw*|*_night*|*_check*|*_maps_review*|*_review_morning*) ;; *) git add "$d" 2>/dev/null;; esac; done
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
