/**
 * MusicPlayer — компактный плеер в углу экрана.
 * Кнопки: ♪ вкл/выкл, ◀ пред, ▶ след.
 * Показывает название текущего трека.
 */
export class MusicPlayer {
  constructor(scene) {
    this.scene   = scene;
    this.tracks  = [
      { key: 'track_ashes2',      file: 'Ashes of Velanth 2.mp3',       label: 'Ashes of Velanth II' },
      { key: 'track_ashes',       file: 'Ashes of Velanth.mp3',         label: 'Ashes of Velanth' },
      { key: 'track_ward',        file: 'Ashes of the Last Ward.mp3',   label: 'Ashes of the Last Ward' },
      { key: 'track_monastery2',  file: 'Ashes of the Monastery 2.mp3', label: 'Ashes of Monastery II' },
      { key: 'track_monastery',   file: 'Ashes of the Monastery.mp3',   label: 'Ashes of the Monastery' },
      { key: 'track_pass',        file: 'Ashes of the Pass.mp3',        label: 'Ashes of the Pass' },
      { key: 'track_dark',        file: 'Dark Song.mp3',                label: 'Dark Song' },
      { key: 'track_forest',      file: 'Forest song.mp3',              label: 'Forest Song' },
      { key: 'track_mermaids',    file: 'Mermaids song.mp3',            label: 'Mermaids Song' },
    ];
    this.index   = 0;
    this.muted   = false;
    this.current = null;
  }

  // Вызвать в preload() сцены
  preload() {
    this.tracks.forEach(t => {
      this.scene.load.audio(t.key, `audio/${t.file}`);
    });
  }

  // Вызвать в create() сцены
  create() {
    this._buildUI();
    this._play(0);
  }

  _play(index) {
    if (this.current) {
      this.current.stop();
      this.current.destroy();
    }
    this.index   = index % this.tracks.length;
    const track  = this.tracks[this.index];
    this.current = this.scene.sound.add(track.key, { loop: false, volume: 0.5 });
    if (!this.muted) this.current.play();

    // Когда трек кончился — следующий
    this.current.on('complete', () => this._play(this.index + 1));

    this._updateLabel();
  }

  _buildUI() {
    const x = 10, y = 10;
    const depth = 10;

    // Фон плеера
    this._bg = this.scene.add.rectangle(x + 110, y + 18, 220, 36, 0x0a0a14, 0.82)
      .setStrokeStyle(1, 0x333355)
      .setOrigin(0.5)
      .setDepth(depth)
      .setScrollFactor(0);

    // Кнопка вкл/выкл ♪
    this._btnMute = this.scene.add.text(x + 8, y + 4, '♪', {
      fontSize: '18px', color: '#C9A84C', fontFamily: 'serif'
    }).setDepth(depth).setInteractive({ useHandCursor: true });
    this._btnMute.on('pointerdown', () => this._toggleMute());

    // Кнопка ◀ предыдущий
    this._btnPrev = this.scene.add.text(x + 34, y + 5, '◀', {
      fontSize: '14px', color: '#888888', fontFamily: 'serif'
    }).setDepth(depth).setInteractive({ useHandCursor: true });
    this._btnPrev.on('pointerdown', () => this._play(this.index - 1 + this.tracks.length));

    // Название трека
    this._label = this.scene.add.text(x + 55, y + 6, '', {
      fontSize: '11px', color: '#AAAAAA', fontFamily: 'serif'
    }).setDepth(depth);

    // Кнопка ▶ следующий
    this._btnNext = this.scene.add.text(x + 198, y + 5, '▶', {
      fontSize: '14px', color: '#888888', fontFamily: 'serif'
    }).setDepth(depth).setInteractive({ useHandCursor: true });
    this._btnNext.on('pointerdown', () => this._play(this.index + 1));

    // Hover эффекты
    [this._btnMute, this._btnPrev, this._btnNext].forEach(btn => {
      btn.on('pointerover', () => btn.setAlpha(0.6));
      btn.on('pointerout',  () => btn.setAlpha(1));
    });
  }

  _toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.current?.pause();
      this._btnMute.setColor('#555555');
    } else {
      this.current?.resume();
      this._btnMute.setColor('#C9A84C');
    }
  }

  _updateLabel() {
    const name = this.tracks[this.index].label;
    // Обрезаем если длинное
    const short = name.length > 18 ? name.slice(0, 17) + '…' : name;
    this._label?.setText(short);
  }
}
