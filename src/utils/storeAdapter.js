/**
 * Адаптер хранилища сохранений (04_ТЕХПЛАН 2.2).
 * Веб: localStorage как раньше. Tauri: те же ключи дополнительно пишутся файлами
 * в appDataDir()/saves/<ключ>.json (плагин fs), при старте файлы читаются обратно в localStorage.
 * Так сохранения переживают переустановку, а остальной код остаётся синхронным.
 */
const SAVE_PREFIXES = ['darkfantasy_', 'mortis_'];
const isSaveKey = k => SAVE_PREFIXES.some(p => k.startsWith(p));

function tauriFs() {
  const t = typeof window !== 'undefined' ? window.__TAURI__ : null;
  return t?.fs ? t : null;
}

export const Store = {
  isDesktop() { return !!tauriFs(); },

  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },

  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
    this._mirror(key, value);
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    this._mirror(key, null);
  },

  async _mirror(key, value) {
    const t = tauriFs();
    if (!t || !isSaveKey(key)) return;
    try {
      const { BaseDirectory } = t.fs;
      await t.fs.mkdir('saves', { baseDir: BaseDirectory.AppData, recursive: true });
      if (value === null) await t.fs.remove(`saves/${key}.json`, { baseDir: BaseDirectory.AppData });
      else await t.fs.writeTextFile(`saves/${key}.json`, value, { baseDir: BaseDirectory.AppData });
    } catch (e) { console.warn('[Store] файл сохранения:', e); }
  },

  /** Tauri: поднять сохранения из файлов в localStorage до старта игры. */
  async init() {
    const t = tauriFs();
    if (!t) return;
    try {
      const { BaseDirectory } = t.fs;
      if (!(await t.fs.exists('saves', { baseDir: BaseDirectory.AppData }))) return;
      const entries = await t.fs.readDir('saves', { baseDir: BaseDirectory.AppData });
      for (const e of entries) {
        if (!e.name?.endsWith('.json')) continue;
        const key = e.name.slice(0, -5);
        const text = await t.fs.readTextFile(`saves/${e.name}`, { baseDir: BaseDirectory.AppData });
        localStorage.setItem(key, text);
      }
    } catch (e) { console.warn('[Store] чтение сохранений:', e); }
  },
};
