import * as Phaser from 'phaser/dist/phaser.esm.js';
import cinema from '../data/cinema.json';

/**
 * Ролик из клипов public/video (запас Veo): кадры src/data/cinema.json, подпись снизу, между кадрами затемнение.
 * Клик, пробел или Esc пропускают ролик. Если видео не запускается, сцена сразу идёт дальше: ролик не должен мешать игре.
 *   scene.start('CinemaScene', { id: 'intro', next: 'LoadingScene', nextData: {...} })
 */
export class CinemaScene extends Phaser.Scene {
  constructor() { super({ key: 'CinemaScene' }); }

  init(data) {
    this.id = data.id;
    this.next = data.next;
    this.nextData = data.nextData || {};
    this.shots = cinema[data.id]?.shots || [];
    this.i = -1;
    this.done = false;
  }

  create() {
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 1);
    this.caption = this.add.text(640, 648, '', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '24px', color: '#E8DEC8',
      align: 'center', wordWrap: { width: 980 }, stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);
    this.add.text(1262, 702, 'Клик: пропустить', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8a8270', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 1).setDepth(10);
    this.input.once('pointerdown', () => this._finish());
    this.input.keyboard?.once('keydown-ESC', () => this._finish());
    this.input.keyboard?.once('keydown-SPACE', () => this._finish());
    this._next();
  }

  _next() {
    if (this.done) return;
    this.i += 1;
    const shot = this.shots[this.i];
    if (!shot) { this._finish(); return; }
    this.video?.destroy();
    const v = this.video = this.add.video(640, 360).setDepth(1).setAlpha(0);
    const fail = () => this._next();
    v.on('error', fail);
    v.once('play', () => {
      v.setDisplaySize(1280, 720);
      this.tweens.add({ targets: v, alpha: 1, duration: 500 });
    });
    v.once('complete', () => this._next());
    v.loadURL(`video/${shot.video}.mp4`, true);
    v.play();
    this.caption.setText(shot.text || '').setAlpha(0);
    this.tweens.add({ targets: this.caption, alpha: 1, duration: 800, delay: 400 });
    // Страховка: клип дольше своей длины не держит сцену
    this.time.delayedCall(12000, () => { if (this.video === v) this._next(); });
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    this.video?.destroy();
    this.scene.start(this.next, this.nextData);
  }
}
