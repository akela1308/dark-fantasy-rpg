/**
 * MapUnit — персонаж на карте мира.
 * Движется к цели, анимируется программно (боб + покачивание).
 */
export class MapUnit {
  constructor(scene, x, y, textureKey, config = {}) {
    this.scene    = scene;
    this.speed    = config.speed ?? 120;
    this.targetX  = x;
    this.targetY  = y;
    this.moving   = false;
    this._bobTween   = null;
    this._leanTween  = null;

    // Спрайт
    this.sprite = scene.add.image(x, y, textureKey)
      .setOrigin(0.5, 1)
      .setDepth(10);

    // Масштаб под размер карты
    const h = config.height ?? 72;
    const scale = h / this.sprite.height;
    this.sprite.setScale(scale);

    // Тень под ногами
    this.shadow = scene.add.ellipse(x, y + 2, 28, 8, 0x000000, 0.25).setDepth(9);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  moveTo(tx, ty) {
    this.targetX = tx;
    this.targetY = ty;
    if (!this.moving) {
      this.moving = true;
      this._startWalkAnim();
    }
  }

  stopMove() {
    this.targetX = this.sprite.x;
    this.targetY = this.sprite.y;
    this.moving  = false;
    this._stopWalkAnim();
  }

  update(delta) {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      if (this.moving) {
        this.sprite.x = this.targetX;
        this.sprite.y = this.targetY;
        this.moving = false;
        this._stopWalkAnim();
      }
    } else {
      const step = this.speed * (delta / 1000);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;

      // Flip в сторону движения
      this.sprite.setFlipX(dx < 0);

      this.moving = true;
    }

    // Тень следует
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 2);
  }

  _startWalkAnim() {
    if (this._bobTween) return;

    this._bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: { from: this.sprite.y - 3, to: this.sprite.y + 3 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this._leanTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -2, to: 2 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _stopWalkAnim() {
    if (this._bobTween)  { this._bobTween.stop();  this._bobTween  = null; }
    if (this._leanTween) { this._leanTween.stop(); this._leanTween = null; }
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 0,
      duration: 80,
    });
  }

  destroy() {
    this._stopWalkAnim();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
