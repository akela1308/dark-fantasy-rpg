import { plate } from './Plate.js';
/**
 * MusicPlayer - компактный плеер в углу экрана.
 * Музыка уже может играть с BootScene через registry.
 * Плеер подхватывает текущий трек и позволяет переключать.
 */
export class MusicPlayer {
  constructor(scene) {
    this.scene  = scene;
    this.tracks = [
      { key: 'track_ashes2',     file: 'Ashes of Velanth 2.mp3',       label: 'Пепел Веланта II' },
      { key: 'track_ashes',      file: 'Ashes of Velanth.mp3',         label: 'Пепел Веланта' },
      { key: 'track_ward',       file: 'Ashes of the Last Ward.mp3',   label: 'Пепел последней стражи' },
      { key: 'track_monastery2', file: 'Ashes of the Monastery 2.mp3', label: 'Пепел монастыря II' },
      { key: 'track_monastery',  file: 'Ashes of the Monastery.mp3',   label: 'Пепел монастыря' },
      { key: 'track_pass',       file: 'Ashes of the Pass.mp3',        label: 'Пепел перевала' },
      { key: 'track_dark',       file: 'Dark Song.mp3',                label: 'Тёмная песня' },
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
    this.muted = !!reg.get('musicMuted');   // пауза переживает смену сцены
    this.scene.events.once('shutdown', () => { this._gone = true; });

    if (existing && (existing.isPlaying || existing.isPaused)) {
      this.current = existing;
      this.index   = idx;
      // Переподключаем complete - старый listener (из LoadingScene) не запускал следующий трек
      existing.removeAllListeners('complete');
      existing.on('complete', () => this._onTrackEnd());
    } else {
      // Если музыки нет - запускаем (неигравший звук прошлой сцены _startTrack уничтожит)
      this.current = existing || null;
      this.index = idx;
      this._startTrack(this.index);
    }

    this._buildUI();
  }

  // Трек кончился без живой сцены (экран загрузки, титул): следующий запустит плеер новой сцены
  _onTrackEnd() {
    if (this._gone) { this.scene.game.registry.set('bgMusicIndex', this.index + 1); return; }
    this._startTrack(this.index + 1);
  }

  _startTrack(index) {
    if (this.current) {
      try { this.current.stop(); } catch(e) {}
      try { this.current.destroy(); } catch(e) {}
    }
    this.index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    const track = this.tracks[this.index];

    // Если трек не загружен - грузим его сейчас (ленивая загрузка)
    if (!this.scene.cache.audio.exists(track.key)) {
      this.scene.load.audio(track.key, `audio/web/${track.file}`); // web: те же треки в 96 кбит/с
      const wanted = this.index;
      this.scene.load.once(`filecomplete-audio-${track.key}`, () => {
        // Сцену уже сменили или игрок успел выбрать другой трек
        if (this._gone || this.index !== wanted || this.scene.game.registry.get('bgMusic')?.isPlaying) return;
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
    this.current.on('complete', () => this._onTrackEnd());

    // Сохраняем в глобальный registry
    this.scene.game.registry.set('bgMusic', this.current);
    this.scene.game.registry.set('bgMusicIndex', this.index);

    this._updateLabel();
  }

  _buildUI() {
    // Плеер позиционирован по зелёной зоне: экран x=0–420px, y=0–55px
    // zoom=0.765 → world = screen/0.765
    const depth = 52;

    // Фон: вдвое меньше - ширина 264, высота 33
    this._bg = plate(this.scene, 'label', 132, 17, 270, 38).setDepth(depth).setScrollFactor(0);

    // ♪ кнопка
    this._btnMute = this.scene.add.text(8, 7, '♪', {
      fontSize: '13px', color: this.muted ? '#555555' : '#C9A84C', fontFamily: 'serif'
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
    this.scene.game.registry.set('musicMuted', this.muted);
    if (this.muted) {
      this.current?.pause();
      this._btnMute.setColor('#555555');
    } else {
      // Трек, выбранный при выключенном звуке, ещё не запускался: продолжать нечего
      if (this.current?.isPaused) this.current.resume();
      else try { this.current?.play(); } catch(e) {}
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
