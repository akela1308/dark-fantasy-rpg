/**
 * Нарисованные плашки интерфейса вместо прямоугольников, нарисованных кодом (правка 27.10).
 * Картинки: public/ui/plate_*_v1.png (tools/ui_plates.py). Растягиваются как NineSlice: углы и кромка не искажаются.
 *   parchment: старый пергамент (карточки выбора, тёмный текст);
 *   button:    тёмное дерево в бронзовой оправе (кнопки, вкладки);
 *   label:     кожа в тонкой бронзе (подписи, подсказки, тосты, рамки портретов).
 *
 *   plate(scene, 'button', x, y, w, h)  -> NineSlice с origin 0.5 в мировых координатах сцены
 */
export const PLATES = {
  parchment: { key: 'plate_parchment', file: 'ui/plate_parchment_v1.png', l: 46, r: 46, t: 40, b: 40, corner: 0.22 },
  button:    { key: 'plate_button', file: 'ui/plate_button_v2.png', l: 30, r: 30, t: 30, b: 30, corner: 0.22 },
  label:     { key: 'plate_label', file: 'ui/plate_label_v1.png', l: 40, r: 40, t: 34, b: 34, corner: 0.3 },
};

/** Загрузка всех плашек (BootScene и LoadingScene). */
export function preloadPlates(scene) {
  Object.values(PLATES).forEach(p => { if (!scene.textures.exists(p.key)) scene.load.image(p.key, p.file); });
}

/**
 * Плашка размером w×h (в единицах мира сцены). Углы занимают около corner высоты плашки.
 * Если картинки нет, возвращает тёмный прямоугольник (тот же интерфейс у объекта).
 */
export function plate(scene, kind, x, y, w, h) {
  const p = PLATES[kind] || PLATES.label;
  if (!scene.textures.exists(p.key)) return scene.add.rectangle(x, y, w, h, 0x15110c, 0.95);
  const k = Math.min(1, Math.max(0.08, (h * p.corner) / p.t));
  const ns = scene.add.nineslice(x, y, p.key, undefined, Math.max(w / k, p.l + p.r + 2), Math.max(h / k, p.t + p.b + 2), p.l, p.r, p.t, p.b);
  ns.setScale(k);
  return ns;
}
