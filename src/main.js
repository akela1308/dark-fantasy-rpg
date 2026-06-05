import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { MapScene }     from './scenes/MapScene.js';
import { BattleScene }  from './scenes/BattleScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/constants.js';

const config = {
  type: Phaser.AUTO,
  width:  GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0A0A0F',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, LoadingScene, MapScene, BattleScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_VERTICALLY,
  },
};

new Phaser.Game(config);
