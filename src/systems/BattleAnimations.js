/**
 * BattleAnimations: покадровые боевые анимации героев (спрайт-листы).
 *
 * Листы делаются из assets/generated/<герой>/final/ скриптом tools/battle_sheet_pack.py
 * и лежат в public/sprites/battle/. Все кадры героя нарисованы лицом вправо.
 *
 * originX подобран так, чтобы ноги стояли в одной точке во всех анимациях
 * (иначе герой «прыгает» вбок при смене анимации). originY = линия подошв.
 *
 * hitFrame: кадр, на котором засчитывается удар/выстрел (урон, цифры, вспышка).
 * muzzle  : точка дула в кадре hitFrame (в пикселях кадра), для вспышки и дыма.
 *
 * Данные лежат в src/data/animations.json (манифест, собирается tools/night_manifest.py):
 * bodyHeight: высота фигуры в кадре (по стойке считается масштаб), actions: действие
 * (basic = обычная атака, иначе id скилла) → анимация. Реакции берутся по именам:
 * hit (урон), death (смерть, держит последний кадр), victory (победа), block (Защита).
 */
import animationsData from '../data/animations.json';

export const BATTLE_ANIMS = animationsData;

export function getBattleAnimConfig(unitId) {
  return BATTLE_ANIMS[unitId] ?? null;
}

/** Загрузка листов только для юнитов этого боя (BattleScene.preload). */
export function loadBattleAnimSheets(scene, unitIds) {
  unitIds.forEach(id => {
    const cfg = BATTLE_ANIMS[id];
    if (!cfg) return;
    Object.values(cfg.anims).forEach(a => {
      if (!scene.textures.exists(a.key)) {
        scene.load.spritesheet(a.key, a.file, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      }
    });
  });
}

/** Точка опоры кадра: у врагов спрайт отражён, поэтому originX зеркальный. */
export function animOrigin(cfg, a, flip) {
  const ox = a.originX ?? 0.5;
  const oy = a.originY ?? cfg.originY ?? 0.98;
  return [flip ? 1 - ox : ox, oy];
}

/** Создать анимации Phaser (один раз на игру). */
export function ensureBattleAnims(scene, cfg) {
  Object.values(cfg.anims).forEach(a => {
    if (scene.anims.exists(a.key) || !scene.textures.exists(a.key)) return;
    scene.anims.create({
      key: a.key,
      frames: scene.anims.generateFrameNumbers(a.key, { start: 0, end: a.frames - 1 }),
      frameRate: a.fps,
      repeat: a.loop ? -1 : 0,
    });
  });
}

/** Все листы героя загружены? Если нет, бой рисует старую статичную картинку. */
export function hasBattleAnims(scene, cfg) {
  return !!cfg && Object.values(cfg.anims).every(a => scene.textures.exists(a.key));
}
