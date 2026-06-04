export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {}

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2 - 60, 'DARK FANTASY', {
      fontFamily: 'serif', fontSize: '64px', color: '#C9A84C',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 10, 'TACTICAL RPG', {
      fontFamily: 'serif', fontSize: '28px', color: '#888888',
    }).setOrigin(0.5);

    const btn = this.add.text(width / 2, height / 2 + 100, '[ НАЧАТЬ ]', {
      fontFamily: 'serif', fontSize: '32px', color: '#E8E8E8',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#C9A84C'));
    btn.on('pointerout',  () => btn.setColor('#E8E8E8'));
    btn.on('pointerdown', () => {
      this.scene.start('LoadingScene', {
        destination: 'MapScene',
        destinationData: { mapKey: 'map1' }
      });
    });
  }
}
