/**
 * LoadingScene — экран загрузки с картинкой по центру и прогресс баром.
 */
export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadingScene' });
  }

  init(data) {
    // Куда идти после загрузки и с какими данными
    this._destination     = data?.destination     || 'MapScene';
    this._destinationData = data?.destinationData || { mapKey: 'map1' };
  }

  preload() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Чёрный фон сразу
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // Прогресс бар (рисуем до загрузки картинки)
    const barW = 400;
    const barH = 6;
    const barX = W / 2 - barW / 2;
    const barY = H - 50;

    this.add.rectangle(W / 2, barY, barW, barH, 0x333333).setOrigin(0.5);
    const barFill = this.add.rectangle(barX, barY, 1, barH, 0xC9A84C).setOrigin(0, 0.5);

    // Слушаем прогресс
    this.load.on('progress', (value) => {
      barFill.width = Math.max(1, barW * value);
    });

    this.load.on('complete', () => {
      this.scene.start(this._destination, this._destinationData);
    });

    // Сначала загружаем картинку
    this.load.image('loading_bg', 'loading.png');

    // Когда картинка загружена — показываем её по центру без растяжки
    this.load.once('filecomplete-image-loading_bg', () => {
      const img = this.add.image(W / 2, H / 2, 'loading_bg');
      // Масштабируем чтобы вписалась в экран, сохраняя пропорции
      const scaleX = W / img.width;
      const scaleY = H / img.height;
      const scale  = Math.min(scaleX, scaleY, 1); // не увеличиваем если меньше экрана
      img.setScale(scale);
    });

    // Спрайты
    const sprites = [
      'hero_duelist','companion_brawler','companion_healer',
      'bandit_commander','bandit_brawler','bandit_archer'
    ];
    sprites.forEach(id => this.load.image(id, `sprites/${id}.png`));

    // Портреты
    sprites.forEach(id => this.load.image(`portrait_${id}`, `portraits/${id}.png`));

    // Фон боя
    this.load.image('battle_bg', 'battle_bg.png');

    // UI
    this.load.image('dialog_frame', 'ui/dialog_frame.png');

    // Карты мира
    this.load.image('map_map1',         'maps/map1.png');
    this.load.image('map_tavern_map',   'maps/tavern_map.png');
    this.load.image('map_tavern_inside','maps/tavern_inside.png');
    this.load.image('map_mountains_map','maps/mountains_map.png');
    this.load.image('map_swamp_map',    'maps/swamp_map.png');
    this.load.image('map_forest1',      'maps/forest1.png');
    this.load.image('map_elf_boloto',   'maps/elf_boloto.png');

    // Персонажи на карте
    this.load.image('map_hero',    'maps/characters/hero.png');
    this.load.image('map_brawler', 'maps/characters/brawler.png');
    this.load.image('map_healer',  'maps/characters/healer.png');
    this.load.image('map_bandit',  'maps/characters/bandit.png');

    // Аудио
    const tracks = [
      ['track_ashes2',     'Ashes of Velanth 2.mp3'],
      ['track_ashes',      'Ashes of Velanth.mp3'],
      ['track_ward',       'Ashes of the Last Ward.mp3'],
      ['track_monastery2', 'Ashes of the Monastery 2.mp3'],
      ['track_monastery',  'Ashes of the Monastery.mp3'],
      ['track_pass',       'Ashes of the Pass.mp3'],
      ['track_dark',       'Dark Song.mp3'],
    ];
    tracks.forEach(([key, file]) => this.load.audio(key, `audio/${file}`));

    // Запускаем музыку как только загрузится первый трек
    this.load.once('filecomplete-audio-track_ashes2', () => {
      if (!this.game.registry.get('musicStarted')) {
        const startMusic = () => {
          if (this.game.registry.get('musicStarted')) return;
          const music = this.sound.add('track_ashes2', { loop: false, volume: 0.45 });
          music.play();
          music.on('complete', () => {
            // MusicPlayer в следующей сцене подхватит и продолжит
            this.game.registry.set('bgMusicIndex', 1);
          });
          this.game.registry.set('musicStarted', true);
          this.game.registry.set('bgMusic', music);
          this.game.registry.set('bgMusicIndex', 0);
        };

        if (this.sound.locked) {
          // Браузер заблокировал autoplay — запустим при первом взаимодействии
          this.sound.once('unlocked', startMusic);
        } else {
          startMusic();
        }
      }
    });
  }

  create() {
    // scene.start is handled by the 'complete' event in preload
  }
}
