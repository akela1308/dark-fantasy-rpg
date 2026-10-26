import * as Phaser from 'phaser/dist/phaser.esm.js';
import { BootScene }    from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { MapScene }     from './scenes/MapScene.js';
import { BattleScene }  from './scenes/BattleScene.js';
import { LevelUpScene } from './scenes/LevelUpScene.js';
import { ChapterEndScene } from './scenes/ChapterEndScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/constants.js';
import { Store } from './utils/storeAdapter.js';

// В собранной игре все PNG перекодированы в WebP (vite.config.js, png-to-webp): подменяем путь при загрузке
if (typeof __PNG_AS_WEBP__ !== 'undefined' && __PNG_AS_WEBP__) {
  const L = Phaser.Loader.LoaderPlugin.prototype;
  const addFile = L.addFile;
  L.addFile = function (file) {
    [].concat(file).forEach(f => {
      if (f && typeof f.url === 'string' && f.url.endsWith('.png')) f.url = f.url.slice(0, -4) + '.webp';
    });
    return addFile.call(this, file);
  };
}

const config = {
  type: Phaser.AUTO,
  width:  GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0A0A0F',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, LoadingScene, MapScene, BattleScene, LevelUpScene, ChapterEndScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

// Десктоп (Tauri): сохранения поднимаются из файлов до старта игры
Store.init().finally(() => {
  const game = new Phaser.Game(config);
  // Только в dev: доступ к игре из консоли браузера для отладки
  if (import.meta.env.DEV) window.__game = game;
});
