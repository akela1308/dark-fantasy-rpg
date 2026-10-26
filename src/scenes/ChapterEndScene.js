import * as Phaser from 'phaser/dist/phaser.esm.js';

/**
 * Финальный экран главы 1 (03_ДИАЛОГИ 9, 07_ЗАДАЧИ 28): абзацы по флагам мира.
 */
const SEAL_LINES = [
  ['seal_worn', 'Дорога открыта. Вы знаете, куда идти. Вы почти уверены, что помните, зачем.'],
  ['seal_taken', 'Дорога открыта. Кольцо греет карман. Савко сказал бы, что это не кольцо греет.'],
  [null, 'Дорога открыта. Вы потеряли день и ничего больше. В Веланте это редкость.'],
];

export class ChapterEndScene extends Phaser.Scene {
  constructor() { super({ key: 'ChapterEndScene' }); }

  init(data) {
    this.fromMapKey = data?.fromMapKey || 'tavern_map';
    this.fromSpawnId = data?.fromSpawnId || 'default';
  }

  create() {
    const W = 1280, H = 720;
    const reg = this.game.registry;
    reg.set('chapter1_done', true);
    this.add.rectangle(W / 2, H / 2, W, H, 0x050407, 1);
    const line = SEAL_LINES.find(([f]) => !f || reg.get(f))[1];
    const title = this.add.text(W / 2, 200, 'Конец первой главы', {
      fontFamily: 'serif', fontSize: '42px', color: '#C9A84C',
    }).setOrigin(0.5).setAlpha(0);
    const body = this.add.text(W / 2, 330, line, {
      fontFamily: 'serif', fontSize: '24px', color: '#E8DEC8', align: 'center',
      wordWrap: { width: 820 }, lineSpacing: 8,
    }).setOrigin(0.5).setAlpha(0);
    const btn = this.add.text(W / 2, 520, '[ Дальше ]', {
      fontFamily: 'serif', fontSize: '26px', color: '#C9A84C',
    }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: title, alpha: 1, duration: 1200 });
    this.tweens.add({ targets: body, alpha: 1, duration: 1400, delay: 900 });
    this.tweens.add({ targets: btn, alpha: 1, duration: 800, delay: 2200 });
    btn.on('pointerover', () => btn.setColor('#FFD700'));
    btn.on('pointerout', () => btn.setColor('#C9A84C'));
    btn.on('pointerdown', () => {
      this.scene.start('LoadingScene', { destination: 'MapScene', destinationData: { mapKey: this.fromMapKey, spawnId: this.fromSpawnId } });
    });
  }
}
