/**
 * Заполнение полос по краям экрана (этап 6): за холстом игры лежит размытая и затемнённая
 * копия текущей карты или фона боя, вместо чёрных полос при соотношении сторон не 16:9.
 */
let el = null;

function ensure() {
  if (el || typeof document === 'undefined') return el;
  el = document.createElement('div');
  el.id = 'backdrop';
  Object.assign(el.style, {
    position: 'fixed', inset: '-60px', zIndex: '-1', pointerEvents: 'none',
    backgroundSize: 'cover', backgroundPosition: 'center',
    filter: 'blur(28px) brightness(0.5) saturate(0.85)', transition: 'background-image 0.4s',
  });
  document.body.prepend(el);
  return el;
}

/** Фон по ключу текстуры Phaser: уменьшенная копия картинки в data-URL (адрес загрузчика Phaser временный). */
export function setBackdrop(scene, key) {
  const d = ensure();
  if (!d) return;
  try {
    const img = scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() : null;
    if (!img?.width) { d.style.backgroundImage = 'none'; return; }
    const c = document.createElement('canvas');
    c.width = 192; c.height = 108;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    d.style.backgroundImage = `url("${c.toDataURL('image/jpeg', 0.7)}")`;
  } catch { d.style.backgroundImage = 'none'; }
}
