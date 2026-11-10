/**
 * Тост (этап 6): узкая бронзовая плашка с иконкой вверху по центру, гаснет сама.
 * Несколько тостов подряд встают друг под другом. Иконка по смыслу текста или явно.
 */
import { FONT, COLOR } from './Theme.js';
import { plate } from './Plate.js';

const ICONS = [
  [/монет|золот|пошлин|плат/i, 'icon_gold'],
  [/отряд|спутник|человек|ждёт в таверне/i, 'map_menu_button'],
  [/отдохнул|лечен|здоровь/i, 'icon_heart'],
  [/засад|бой/i, 'icon_broken_sword'],
  [/книг|запис|журнал/i, 'icon_hand'],
];

const live = new WeakMap();   // scene -> активные тосты

export function showToast(scene, text, icon = null) {
  const z = scene.cameras.main.zoom || 1;
  const s = v => v / z;
  const list = (live.get(scene) || []).filter(t => t.active);
  const key = icon || ICONS.find(([re]) => re.test(text))?.[1] || 'icon_skull';
  // Первый свободный ряд: погасший верхний тост освобождает своё место, а нижние остаются
  const taken = new Set(list.map(l => l.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  const y = 96 + slot * 44;
  const t = scene.add.text(0, 0, text, {
    fontFamily: FONT, fontSize: `${s(15)}px`, color: COLOR.text, stroke: '#000', strokeThickness: s(2),
  }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
  const tw = t.width * z;
  const w = tw + 64, h = 36;
  const x0 = 640 - w / 2;
  const g = plate(scene, 'label', s(640), s(y), s(w + 10), s(h + 8)).setScrollFactor(0).setDepth(10000);
  const objs = [g, t];
  if (scene.textures.exists(key)) {
    objs.push(scene.add.image(s(x0 + 22), s(y), key).setDisplaySize(s(24), s(24)).setScrollFactor(0).setDepth(10001));
  }
  t.setPosition(s(x0 + 42), s(y));
  const handle = { active: true, slot };
  list.push(handle);
  live.set(scene, list);
  objs.forEach(o => o.setAlpha(0));
  scene.tweens.add({ targets: objs, alpha: 1, duration: 200 });
  scene.tweens.add({
    targets: objs, alpha: 0, delay: 2400, duration: 600,
    onComplete: () => { handle.active = false; objs.forEach(o => o.destroy()); },
  });
}
