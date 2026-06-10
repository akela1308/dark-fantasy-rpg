/**
 * MusicPlayer — компактный плеер в углу экрана.
 * Музыка уже может играть с BootScene через registry.
 * Плеер подхватывает текущий трек и позволяет переключать.
 */
export class MusicPlayer {
  constructor(scene) {
    this.scene  = scene;
    this.tracks = [
      { key: 'track_ashes2',     file: 'Ashes of Velanth 2.mp3',       label: 'Ashes of Velanth II' },
      { key: 'track_ashes',      file: 'Ashes of Velanth.mp3',         label: 'Ashes of Velanth' },
      { key: 'track_ward',       file: 'Ashes of the Last Ward.mp3',   label: 'Ashes of the Last Ward' },
      { key: 'track_monastery2', file: 'Ashes of the Monastery 2.mp3', label: 'Ashes of Monastery II' },
      { key: 'track_monastery',  file: 'Ashes of the Monastery.mp3',   label: 'Ashes of the Monastery' },
      { key: 'track_pass',       file: 'Ashes of the Pass.mp3',        label: 'Ashes of the Pass' },
      { key: 'track_dark',       file: 'Dark Song.mp3',                label: 'Dark Song' },
    ];
    this.muted   = false;
    this.current = null;
  }

  preload() {} // ассеты грузит LoadingScene

  create() {
    // Подхватываем уже играющую музыку из глобального registry
    const reg      = this.scene.game.registry;
    const existing = reg.get('bgMusic');
    const idx      = reg.get('bgMusicIndex') ?? 0;

    if (existing && existing.isPlaying) {
      this.current = existing;
      this.index   = idx;
      // Переподключаем complete — старый listener (из LoadingScene) не запускал следующий трек
      existing.removeAllListeners('complete');
      existing.on('complete', () => this._startTrack(this.index + 1));
    } else {
      // Если музыки нет — запускаем
      this.index = idx;
      this._startTrack(this.index);
    }

    this._buildUI();
  }

  _startTrack(index) {
    if (this.current) {
      try { this.current.stop(); } catch(e) {}
      try { this.current.destroy(); } catch(e) {}
    }
    this.index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    const track = this.tracks[this.index];

    // Если трек не загружен — грузим его сейчас (ленивая загрузка)
    if (!this.scene.cache.audio.exists(track.key)) {
      this.scene.load.audio(track.key, `audio/${track.file}`);
      this.scene.load.once(`filecomplete-audio-${track.key}`, () => {
        this._playTrack(track);
      });
      this.scene.load.start();
      return;
    }

    this._playTrack(track);
  }

  _playTrack(track) {
    this.current = this.scene.sound.add(track.key, { loop: false, volume: 0.45 });
    if (!this.muted) {
      try { this.current.play(); } catch(e) {}
    }
    this.current.on('complete', () => this._startTrack(this.index + 1));

    // Сохраняем в глобальный registry
    this.scene.game.registry.set('bgMusic', this.current);
    this.scene.game.registry.set('bgMusicIndex', this.index);

    this._updateLabel();
  }

  _buildUI() {
    // Плеер позиционирован по зелёной зоне: экран x=0–420px, y=0–55px
    // zoom=0.765 → world = screen/0.765
    const depth = 52;

    // Фон: вдвое меньше — ширина 264, высота 33
    this._bg = this.scene.add.rectangle(0, 17, 264, 33, 0x07070f, 0.90)
      .setOrigin(0, 0.5).setDepth(depth).setScrollFactor(0);

    // ♪ кнопка
    this._btnMute = this.scene.add.text(8, 7, '♪', {
      fontSize: '13px', color: '#C9A84C', fontFamily: 'serif'
    }).setDepth(depth).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this._btnMute.on('pointerdown', () => this._toggleMute());

    // ◀
    this._btnPrev = this.scene.add.text(28, 8, '◀', {
      fontSize: '11px', color: '#888888', fontFamily: 'serif'
    }).setDepth(depth).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this._btnPrev.on('pointerdown', () => this._startTrack(this.index - 1 + this.tracks.length));

    // Лейбл
    this._label = this.scene.add.text(46, 9, '', {
      fontSize: '10px', color: '#AAAAAA', fontFamily: 'serif'
    }).setDepth(depth).setScrollFactor(0);

    // ▶
    this._btnNext = this.scene.add.text(252, 8, '▶', {
      fontSize: '11px', color: '#888888', fontFamily: 'serif'
    }).setDepth(depth).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this._btnNext.on('pointerdown', () => this._startTrack(this.index + 1));

    [this._btnMute, this._btnPrev, this._btnNext].forEach(btn => {
      btn.on('pointerover', () => btn.setAlpha(0.6));
      btn.on('pointerout',  () => btn.setAlpha(1));
    });

    this._updateLabel();
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
    if (!this._label) return;
    const name  = this.tracks[this.index]?.label ?? '';
    const short = name.length > 18 ? name.slice(0, 17) + '…' : name;
    this._label.setText(short);
  }
}
