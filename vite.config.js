// Для Tauri база относительная (файлы из пакета), для GitHub Pages подпапка репозитория
export default {
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
