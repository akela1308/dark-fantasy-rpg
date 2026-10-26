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

// Бытовые движения (amb1, amb2...) в бою не играются, их листы не грузим
const inBattle = ([name]) => !name.startsWith('amb');
const battleAnims = cfg => Object.entries(cfg.anims).filter(inBattle).map(([, a]) => a);

export function getBattleAnimConfig(unitId) {
  return BATTLE_ANIMS[unitId] ?? null;
}

/**
 * Загрузка листов только для юнитов этого боя. first = true: стойка и урон (нужны сразу, BattleScene.preload),
 * first = false: остальное (удары, смерть, победа), догружается в фоне уже во время боя.
 */
const FIRST = ['idle', 'hit'];
export function loadBattleAnimSheets(scene, unitIds, first = true) {
  let queued = 0;
  unitIds.forEach(id => {
    const cfg = BATTLE_ANIMS[id];
    if (!cfg) return;
    Object.entries(cfg.anims).filter(inBattle).forEach(([name, a]) => {
      if (FIRST.includes(name) !== first || scene.textures.exists(a.key)) return;
      scene.load.spritesheet(a.key, a.file, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      queued++;
    });
  });
  return queued;
}

/** Анимация загружена и готова к проигрыванию (лист мог ещё не догрузиться). */
export function battleAnimReady(scene, cfg, name) {
  const a = cfg?.anims[name];
  if (!a || !scene.textures.exists(a.key)) return false;
  if (!scene.anims.exists(a.key)) ensureBattleAnims(scene, cfg);
  return true;
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

/** Стойка героя загружена? Если нет, бой рисует старую статичную картинку. Остальное догружается. */
export function hasBattleAnims(scene, cfg) {
  return !!cfg && !!cfg.anims.idle && scene.textures.exists(cfg.anims.idle.key);
}
