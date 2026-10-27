import * as Phaser from 'phaser/dist/phaser.esm.js';
import { BootScene }    from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { MapScene }     from './scenes/MapScene.js';
import { BattleScene }  from './scenes/BattleScene.js';
import { LevelUpScene } from './scenes/LevelUpScene.js';
import { ChapterEndScene } from './scenes/ChapterEndScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/constants.js';
import { Store } from './utils/storeAdapter.js';

// Портрет с новой версией (<имя>_v2.png: вырезан фон и т.п.) грузится вместо старого под тем же ключом
if (typeof __PORTRAITS__ !== 'undefined') {
  const L = Phaser.Loader.LoaderPlugin.prototype;
  const addFile = L.addFile;
  L.addFile = function (file) {
    [].concat(file).forEach(f => {
      const m = f && typeof f.url === 'string' && f.url.match(/portraits\/([\w-]+)\.(png|webp)$/);
      if (m && !m[1].endsWith('_v2') && __PORTRAITS__.includes(`${m[1]}_v2`)) f.url = f.url.replace(/\.(png|webp)$/, '_v2.$1');
    });
    return addFile.call(this, file);
  };
}

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
  // Во весь экран: если окно чуть шире или выше 16:9 (до 12%), игра заполняет его целиком и срезает края
  // (ENVELOP); при сильно другой форме окна вписывается целиком (FIT), полосы закрывает размытый фон
  const fitMode = () => {
    const r = window.innerWidth / window.innerHeight, base = GAME_WIDTH / GAME_HEIGHT;
    const mode = Math.abs(r / base - 1) <= 0.12 ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT;
    if (game.scale.scaleMode !== mode) { game.scale.scaleMode = mode; game.scale.refresh(); }
  };
  game.events.once('ready', fitMode);
  window.addEventListener('resize', () => setTimeout(fitMode, 50));
  // Только в dev: доступ к игре из консоли браузера для отладки
  if (import.meta.env.DEV) window.__game = game;
});
