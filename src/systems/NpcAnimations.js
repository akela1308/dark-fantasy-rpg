/**
 * NpcAnimations: покадровые анимации NPC на карте (стойка по кругу + случайные бытовые движения).
 *
 * Данные: src/data/map_animations.json (собирается tools/night_map_manifest.py), ключ = spriteKey NPC
 * из maps.json. Листы лежат в public/maps/characters/anim/ и грузятся только для NPC текущей карты,
 * уже после создания сцены: пока лист не загрузился, NPC стоит старой статичной картинкой.
 *
 * Каждое бытовое движение начинается и заканчивается базовой позой, поэтому их можно
 * чередовать со стойкой в любом порядке.
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';
import mapAnimData from '../data/map_animations.json';
import { loadSheetOnce, whenTextures } from '../utils/loadOnce.js';

export function getNpcAnimConfig(spriteKey) {
  return mapAnimData[spriteKey] ?? null;
}

function ensureAnim(scene, a, loop) {
  if (scene.anims.exists(a.key) || !scene.textures.exists(a.key)) return;
  scene.anims.create({
    key: a.key,
    frames: scene.anims.generateFrameNumbers(a.key, { start: 0, end: a.frames - 1 }),
    frameRate: a.fps ?? 24,
    repeat: loop ? -1 : 0,
  });
}

/**
 * Подключить анимации к NPC-спрайту. h: высота NPC из maps.json, feetY: где стоят ноги.
 * Возвращает true, если у NPC есть анимации (тогда старые твины дыхания/покачивания не нужны).
 */
export function attachNpcAnimations(scene, sprite, npc, h, feetY) {
  const cfg = getNpcAnimConfig(npc.spriteKey);
  if (!cfg?.idle) return false;
  const all = [cfg.idle, ...(cfg.ambient || [])];

  const start = () => {
    if (!sprite.active) return;
    all.forEach((a, i) => ensureAnim(scene, a, i === 0));
    const flip = !!npc.flipX;
    const setFor = (a) => {
      sprite.setOrigin(flip ? 1 - a.originX : a.originX, a.originY);
      sprite.setScale((h * (cfg.bodyScale ?? 0.95)) / a.bodyHeight);
    };
    sprite.setPosition(npc.x, feetY);
    setFor(cfg.idle);
    sprite.play({ key: cfg.idle.key, startFrame: Phaser.Math.Between(0, cfg.idle.frames - 1) });

    const ambient = (cfg.ambient || []).filter(a => scene.textures.exists(a.key));
    if (!ambient.length) return;
    const [minD, maxD] = cfg.delay ?? [6000, 14000];
    const next = () => scene.time.delayedCall(Phaser.Math.Between(minD, maxD), () => {
      if (!sprite.active) return;
      const a = Phaser.Utils.Array.GetRandom(ambient);
      setFor(a);
      sprite.play(a.key);
      sprite.once(`animationcomplete-${a.key}`, () => {
        if (!sprite.active) return;
        setFor(cfg.idle);
        sprite.play({ key: cfg.idle.key, startFrame: 0 });
        next();
      });
    });
    next();
  };

  const missing = all.filter(a => !scene.textures.exists(a.key));
  if (!missing.length) { start(); return true; }
  let started = false;
  const once = () => { if (!started) { started = true; start(); } };
  const queued = missing.filter(a => loadSheetOnce(scene, a.key, a.file, { frameWidth: a.frameWidth, frameHeight: a.frameHeight }));
  // Листы могла уже качать прошлая сцена: ждём сами текстуры, а свою загрузку на случай ошибки файла
  whenTextures(scene, missing.map(a => a.key), once);
  if (queued.length) {
    scene.load.once('complete', once);
    if (!scene.load.isLoading()) scene.load.start();
  }
  return true;
}
