import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Варианты карт для выбора (public/maps/gen/*_v1..3.png, *_pick.png, ~450 МБ) нужны только
// инструментам выбора. Игра грузит *_pick.jpg, поэтому из сборки они удаляются.
// Туда же: исходные треки в 185 кбит/с (игра берёт audio/web/*.mp3) и дубли track1..9.mp3.
let outDir = 'dist';
let rootDir = process.cwd();
const DROP = [
  [/^maps\/gen\/.*_(v\d|pick)\.png$/],
  [/^audio\/[^/]+\.mp3$/],
  [/(^|\/)\.DS_Store$/],
];

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function dropUnused(dir) {
  for (const rel of walk(dir)) {
    if (DROP.some(([re]) => re.test(rel))) fs.rmSync(path.join(dir, rel));
  }
}

// PNG -> WebP при сборке: в собранной игре все .png заменяются на .webp того же имени
// (в 5-10 раз легче), загрузчик Phaser переписывает пути сам (src/main.js, __PNG_AS_WEBP__).
// public/ не трогаем. Готовые WebP кэшируются в node_modules/.cache/webp по содержимому файла.
const pngToWebp = {
  name: 'png-to-webp',
  apply: 'build',
  enforce: 'post',
  config() { return { define: { __PNG_AS_WEBP__: 'true' } }; },
  configResolved(cfg) { outDir = cfg.build.outDir; rootDir = cfg.root; },
  async closeBundle() {
    const sharp = (await import('sharp')).default;
    const dir = path.resolve(rootDir, outDir);
    dropUnused(dir); // сначала выкидываем лишнее, чтобы не перекодировать его
    const cache = path.resolve(rootDir, 'node_modules/.cache/webp');
    fs.mkdirSync(cache, { recursive: true });
    const pngs = walk(dir).filter(f => f.endsWith('.png'));
    let before = 0, after = 0;
    const queue = [...pngs];
    const worker = async () => {
      for (let rel; (rel = queue.shift()); ) {
        const src = path.join(dir, rel);
        const buf = fs.readFileSync(src);
        const hash = crypto.createHash('sha1').update(buf).digest('hex');
        const cached = path.join(cache, hash + '.webp');
        if (!fs.existsSync(cached)) {
          const tmp = cached + '.' + crypto.randomUUID() + '.tmp'; // одинаковые файлы могут кодироваться параллельно
          const enc = opts => sharp(buf, { limitInputPixels: false, ...opts })
            .webp({ quality: 85, alphaQuality: 90, effort: 4, smartSubsample: true })
            .toFile(tmp);
          try { await enc({}); }
          catch {
            // Файл с мелкими ошибками в данных: пробуем без строгой проверки, иначе оставляем байты как есть
            // (браузер распознаёт картинку по содержимому, а не по расширению)
            try { await enc({ failOn: 'none' }); }
            catch (e) { console.warn(`png-to-webp: ${rel} не перекодирован (${e.message})`); fs.writeFileSync(tmp, buf); }
          }
          fs.renameSync(tmp, cached);
        }
        fs.copyFileSync(cached, src.slice(0, -4) + '.webp');
        fs.rmSync(src);
        before += buf.length; after += fs.statSync(cached).size;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    console.log(`png-to-webp: ${pngs.length} файлов, ${(before / 1048576).toFixed(0)} -> ${(after / 1048576).toFixed(0)} МБ`);
  },
};

// Какие портреты реально лежат в public/portraits: бой не запрашивает несуществующие (иначе 404 в консоли)
const PORTRAITS = fs.readdirSync('public/portraits').filter(f => f.endsWith('.png')).map(f => f.slice(0, -4));
// Иконки предметов и книг (public/ui/items): игра не запрашивает те, что ещё не нарисованы
const ITEM_ICONS = fs.existsSync('public/ui/items') ? fs.readdirSync('public/ui/items').filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)) : [];

// Для Tauri база относительная (файлы из пакета), для GitHub Pages подпапка репозитория
export default {
  plugins: [pngToWebp],
  define: { __PORTRAITS__: JSON.stringify(PORTRAITS), __ITEM_ICONS__: JSON.stringify(ITEM_ICONS) },
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/dark-fantasy-rpg/',
  publicDir: 'public',
  optimizeDeps: {
    noDiscovery: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
  },
};
