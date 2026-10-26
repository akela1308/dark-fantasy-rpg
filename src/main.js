import * as Phaser from 'phaser/dist/phaser.esm.js';
import { BootScene }    from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { MapScene }     from './scenes/MapScene.js';
import { BattleScene }  from './scenes/BattleScene.js';
import { LevelUpScene } from './scenes/LevelUpScene.js';
import { ChapterEndScene } from './scenes/ChapterEndScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/constants.js';
import { Store } from './utils/storeAdapter.js';

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
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

// Десктоп (Tauri): сохранения поднимаются из файлов до старта игры
Store.init().finally(() => {
  const game = new Phaser.Game(config);
  // Только в dev: доступ к игре из консоли браузера для отладки
  if (import.meta.env.DEV) window.__game = game;
});
