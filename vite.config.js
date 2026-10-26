import fs from 'node:fs';
import path from 'node:path';

// Варианты карт для выбора (public/maps/gen/*_v1..3.png, *_pick.png, ~450 МБ) нужны только
// инструментам выбора. Игра грузит *_pick.jpg, поэтому из сборки они удаляются.
let outDir = 'dist';
const dropMapVariants = {
  name: 'drop-map-variants',
  apply: 'build',
  configResolved(cfg) { outDir = cfg.build.outDir; },
  closeBundle() {
    const dir = path.resolve(outDir, 'maps/gen');
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (/_(v\d|pick)\.png$/.test(f)) fs.rmSync(path.join(dir, f));
    }
  },
};

// Для Tauri база относительная (файлы из пакета), для GitHub Pages подпапка репозитория
export default {
  plugins: [dropMapVariants],
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
