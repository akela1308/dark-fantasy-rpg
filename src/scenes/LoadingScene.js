/**
 * LoadingScene — показывает экран загрузки пока грузятся все тяжёлые ассеты.
 * После загрузки переходит в BattleScene.
 */
export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadingScene' });
  }

  preload() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Загружаем фон загрузки первым (он маленький)
    this.load.image('loading_bg', 'loading.png');

    // После первого файла — показываем картинку
    this.load.once('filecomplete-image-loading_bg', () => {
      this.add.image(W / 2, H / 2, 'loading_bg')
        .setDisplaySize(W, H);

      // Прогресс бар
      const barBg   = this.add.rectangle(W / 2, H - 48, 400, 8, 0x222222, 0.8);
      const barFill = this.add.rectangle(W / 2 - 200, H - 48, 0, 8, 0xC9A84C, 1).setOrigin(0, 0.5);

      this.load.on('progress', (value) => {
        barFill.setDisplaySize(400 * value, 8);
      });
    });

    // Спрайты персонажей
    const sprites = [
      'hero_duelist','companion_brawler','companion_healer',
      'bandit_commander','bandit_brawler','bandit_archer'
    ];
    sprites.forEach(id => this.load.image(id, `sprites/${id}.png`));

    // Портреты
    sprites.forEach(id => this.load.image(`portrait_${id}`, `portraits/${id}.png`));

    // Фон боя
    this.load.image('battle_bg', 'battle_bg.png');

    // Аудио
    const tracks = [
      ['track_ashes2',     'Ashes of Velanth 2.mp3'],
      ['track_ashes',      'Ashes of Velanth.mp3'],
      ['track_ward',       'Ashes of the Last Ward.mp3'],
      ['track_monastery2', 'Ashes of the Monastery 2.mp3'],
      ['track_monastery',  'Ashes of the Monastery.mp3'],
      ['track_pass',       'Ashes of the Pass.mp3'],
      ['track_dark',       'Dark Song.mp3'],
      ['track_forest',     'Forest song.mp3'],
      ['track_mermaids',   'Mermaids song.mp3'],
    ];
    tracks.forEach(([key, file]) => this.load.audio(key, `audio/${file}`));
  }

  create() {
    this.scene.start('BattleScene');
  }
}
