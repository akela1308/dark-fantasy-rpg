/**
 * Загрузка листа один раз на всю игру. У каждой сцены свой загрузчик, и textures.exists не видит файл,
 * который ещё качает загрузчик другой (например, ушедшей) сцены. Без этой метки быстрый переход ставил
 * тот же ключ второй раз («Texture key already in use»). Файл ушедшей сцены всё равно дописывается в текстуры.
 */
const pending = new Map();
const TTL = 60000;

export function isPending(key) {
  const t = pending.get(key);
  if (t && performance.now() - t < TTL) return true;
  pending.delete(key);
  return false;
}

/** Поставить лист в очередь загрузчика сцены, если его нет и никто его уже не качает. true, если поставлен. */
export function loadSheetOnce(scene, key, file, frameCfg) {
  if (scene.textures.exists(key) || isPending(key)) return false;
  pending.set(key, performance.now());
  scene.textures.once(`addtexture-${key}`, () => pending.delete(key));
  scene.load.on('loaderror', f => { if (f.key === key) pending.delete(key); });
  scene.load.spritesheet(key, file, frameCfg);
  return true;
}

/** cb, когда все текстуры появятся (своим загрузчиком или чужим). Слушатель снимается при уходе со сцены. */
export function whenTextures(scene, keys, cb) {
  const left = new Set(keys.filter(k => !scene.textures.exists(k)));
  if (!left.size) { cb(); return; }
  const onAdd = key => {
    left.delete(key);
    if (!left.size) { off(); cb(); }
  };
  const off = () => scene.textures.off('addtexture', onAdd);
  scene.textures.on('addtexture', onAdd);
  scene.events.once('shutdown', off);
}
