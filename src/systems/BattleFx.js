/**
 * Эффекты боя из листов public/battle_fx (нарезаны из клипов Veo, tools/fx_sheets.py). Чёрный фон, режим ADD.
 *   preloadBattleFx(scene);  playFx(scene, 'blood_spray', x, y, { scale, depth });
 * Если лист не загружен, вызов просто ничего не делает: эффект не должен мешать ходу боя.
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';
import FX from '../data/battle_fx.json';

const key = n => `fx_${n}`;

export function preloadBattleFx(scene) {
  Object.entries(FX).forEach(([n, f]) => {
    if (!scene.textures.exists(key(n))) scene.load.spritesheet(key(n), f.file, { frameWidth: f.frameWidth, frameHeight: f.frameHeight });
  });
}

export function playFx(scene, name, x, y, { scale = 1, depth = 900, alpha = 0.9, flip = false } = {}) {
  const f = FX[name], k = key(name);
  if (!f || !scene.textures.exists(k)) return null;
  if (!scene.anims.exists(k)) {
    scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: f.frames - 1 }), frameRate: f.fps });
  }
  const s = scene.add.sprite(x, y, k, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha).setDepth(depth).setFlipX(flip);
  s.play(k);
  s.once('animationcomplete', () => s.destroy());
  return s;
}
